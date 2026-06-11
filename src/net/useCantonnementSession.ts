// Store de session multijoueur de cantonnement.
//
// Singleton zustand (comme `useGessieStore`) : il survit aux changements de vue
// React, ce qui permet de rester connecté à la partie quand l'opérateur entre
// en poste (vue 'sim'). Encapsule la WebSocket, la (re)connexion automatique et
// l'état de présence.
//
// Résolution de l'URL du relais :
//   - `VITE_CANTON_WS_URL` si défini (dev : ws://localhost:8081)
//   - sinon dérivé de window.location → wss://<host>/canton en prod HTTPS.

import { create } from 'zustand';
import type { Gare } from './gares';
import type {
  ClientMessage,
  Member,
  ServerMessage,
  TrainInMessage,
  TrainPayload,
} from './protocol';

export type SessionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

interface SessionState {
  status: SessionStatus;
  /** Code de la partie courante (normalisé majuscules). */
  code: string | null;
  /** Gare tenue par cet opérateur. */
  gare: Gare | null;
  /** Soi-même tel que confirmé par le serveur. */
  you: Member | null;
  /** Tous les membres connectés (soi inclus). */
  members: Member[];
  /** Dernier message d'erreur lisible (gare prise, connexion…). */
  error: string | null;
  /** Horloge autoritative de la partie (diffusée par le serveur). */
  roomClock: { simTime: number; speed: number } | null;

  /** Rejoint (ou crée) une partie sur la gare donnée. */
  connect: (code: string, gare: Gare, name?: string) => void;
  /** Quitte la partie et coupe la connexion. */
  disconnect: () => void;
  /** Demande au serveur de changer la vitesse/pause de l'horloge partagée. */
  setClockSpeed: (speed: number) => void;
  /** Transfère un train sortant vers la gare voisine `toGare`. */
  sendTrain: (toGare: Gare, train: TrainPayload) => void;
  /** Abonne un handler aux trains entrants. Retourne un désabonnement. */
  onTrain: (handler: (msg: TrainInMessage) => void) => () => void;
}

// ===== État hors-React (socket + timers) =====

let socket: WebSocket | null = null;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
// Paramètres de la connexion désirée (pour re-join au reconnect).
let desired: { code: string; gare: Gare; name: string } | null = null;
const trainHandlers = new Set<(msg: TrainInMessage) => void>();

const PING_INTERVAL_MS = 25_000;
const MAX_RECONNECT_DELAY_MS = 15_000;

// Identité stable de ce client pour toute la durée de l'onglet. Permet au
// serveur de traiter un re-`join` (reconnexion, double-effet React StrictMode)
// comme une reprise du même opérateur plutôt qu'un nouvel arrivant — sinon la
// gare paraîtrait « déjà occupée » par soi-même.
function makeClientId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fallback ci-dessous */
  }
  return `c-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}
const CLIENT_ID = makeClientId();

function resolveUrl(): string {
  const fromEnv = import.meta.env.VITE_CANTON_WS_URL as string | undefined;
  if (fromEnv) return fromEnv;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/canton`;
}

function clearTimers() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function sendMessage(msg: ClientMessage) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

/**
 * Ferme la socket courante SANS déclencher de reconnexion : on retire d'abord
 * ses handlers (donc son `onclose` ne tournera pas) puis on `socket = null`.
 * Indispensable pour éviter qu'une socket remplacée (reconnexion, double-effet
 * StrictMode) ne relance une reconnexion fantôme — source de boucles.
 */
function teardownSocket() {
  if (!socket) return;
  const old = socket;
  socket = null;
  old.onopen = null;
  old.onmessage = null;
  old.onclose = null;
  // No-op (et non `null`) : fermer un socket encore en CONNECTING peut émettre
  // un `error` tardif ; on l'avale au lieu de le laisser remonter.
  old.onerror = () => {};
  try {
    old.close();
  } catch {
    /* socket déjà morte */
  }
}

export const useCantonnementSession = create<SessionState>((set, get) => {
  function openSocket() {
    if (!desired) return;

    let ws: WebSocket;
    try {
      ws = new WebSocket(resolveUrl());
    } catch {
      set({ status: 'error', error: 'URL de serveur invalide.' });
      return;
    }
    socket = ws;

    ws.onopen = () => {
      if (ws !== socket) return; // socket remplacée entre-temps
      reconnectAttempts = 0;
      if (!desired) return;
      sendMessage({
        t: 'join',
        code: desired.code,
        gare: desired.gare,
        name: desired.name,
        clientId: CLIENT_ID,
      });
      // Ping applicatif pour garder les proxies intermédiaires éveillés.
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = setInterval(() => sendMessage({ t: 'ping' }), PING_INTERVAL_MS);
    };

    ws.onmessage = (ev) => {
      if (ws !== socket) return; // ignore une socket remplacée
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data as string) as ServerMessage;
      } catch {
        return;
      }
      switch (msg.t) {
        case 'joined':
          set({ status: 'connected', you: msg.you, members: msg.members, error: null });
          break;
        case 'presence':
          set({ members: msg.members });
          break;
        case 'clock':
          set({ roomClock: { simTime: msg.simTime, speed: msg.speed } });
          break;
        case 'error':
          // gare-taken (ou autre refus) : on arrête, pas de reconnexion.
          // `desired = null` empêche toute reconnexion ; teardown ferme proprement.
          desired = null;
          clearTimers();
          set({ status: 'error', error: msg.message });
          teardownSocket();
          break;
        case 'train':
          for (const h of trainHandlers) h(msg);
          break;
        case 'pong':
        case 'train-undelivered':
          break;
      }
    };

    ws.onclose = () => {
      if (ws !== socket) return; // socket déjà remplacée : pas de reconnexion fantôme
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      socket = null;
      if (!desired) return; // fermeture volontaire (disconnect / refus serveur)
      // Reconnexion automatique avec backoff exponentiel plafonné.
      reconnectAttempts += 1;
      const delay = Math.min(1000 * 2 ** (reconnectAttempts - 1), MAX_RECONNECT_DELAY_MS);
      set({ status: 'reconnecting', error: null });
      reconnectTimer = setTimeout(openSocket, delay);
    };

    ws.onerror = () => {
      // L'événement close suit ; on n'y déclenche pas la reconnexion ici.
    };
  }

  return {
    status: 'idle',
    code: null,
    gare: null,
    you: null,
    members: [],
    error: null,
    roomClock: null,

    connect: (code, gare, name = '') => {
      const normalized = code.trim().toUpperCase();
      // Repart proprement si une connexion existait (sans reconnexion fantôme).
      clearTimers();
      teardownSocket();
      reconnectAttempts = 0;
      desired = { code: normalized, gare, name };
      set({
        status: 'connecting',
        code: normalized,
        gare,
        you: null,
        members: [],
        error: null,
        roomClock: null,
      });
      openSocket();
    },

    disconnect: () => {
      // Envoie `leave` tant que la socket est vivante, puis ferme sans reconnexion.
      sendMessage({ t: 'leave' });
      desired = null;
      clearTimers();
      teardownSocket();
      set({
        status: 'idle',
        code: null,
        gare: null,
        you: null,
        members: [],
        error: null,
        roomClock: null,
      });
    },

    setClockSpeed: (speed) => {
      void get;
      sendMessage({ t: 'clock-set', speed });
    },

    sendTrain: (toGare, train) => {
      sendMessage({ t: 'train', toGare, train });
    },

    onTrain: (handler) => {
      trainHandlers.add(handler);
      return () => {
        trainHandlers.delete(handler);
      };
    },
  };
});
