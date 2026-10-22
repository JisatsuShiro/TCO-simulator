// Connexion de l'opérateur à la ligne CAPI partagée (voir `server/capi.js`).
//
// Le serveur détient l'état de la ligne et joue les dialogues ; ce store ne fait
// que relire l'état qu'il diffuse et lui envoyer les frappes validées. Singleton
// zustand, comme `useCantonnementSession`, dont il réutilise l'URL du relais.

import { create } from 'zustand';
import { resolveUrl } from '../net/useCantonnementSession';
import type { Resultat } from './dialogues';
import type { Ligne } from './ligne';

export type EtatConnexion =
  /** Aucune connexion. */
  | 'idle'
  /** Socket ouverte, identifiants en cours de vérification. */
  | 'connexion'
  /** Authentifié, gare à choisir. */
  | 'choix'
  /** Poste tenu : la ligne est diffusée. */
  | 'assis'
  | 'erreur';

interface CapiRoom {
  status: EtatConnexion;
  erreur: string | null;
  /** Indices des postes déjà tenus par un opérateur. */
  occupes: number[];
  poste: number | null;
  ligne: Ligne | null;

  connecter: (user: string, password: string) => void;
  prendre: (poste: number) => void;
  /** Joue un dialogue sur le serveur ; l'alarme 17 si la liaison est perdue. */
  jouer: (saisie: string) => Promise<Resultat>;
  commande: (cle: 'selecteur' | 'bouchon' | 'liaison', valeur: boolean) => void;
  quitter: () => void;
}

let socket: WebSocket | null = null;
let ecartMs = 0;
let nextId = 1;
const attentes = new Map<number, (r: Resultat) => void>();

/** Heure du serveur : l'horloge de la ligne est la même pour tous les opérateurs. */
export function maintenantServeur(): number {
  return Date.now() + ecartMs;
}

function envoyer(message: object): void {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function fermer(): void {
  if (!socket) return;
  const ancienne = socket;
  socket = null;
  ancienne.onopen = null;
  ancienne.onmessage = null;
  ancienne.onclose = null;
  ancienne.onerror = () => {};
  try {
    ancienne.close();
  } catch {
    /* socket déjà morte */
  }
  // Les dialogues en vol n'aboutiront pas : alarme 17.
  for (const reponse of attentes.values()) reponse({ ok: false, alarme: 17 });
  attentes.clear();
}

export const useCapiRoom = create<CapiRoom>((set) => ({
  status: 'idle',
  erreur: null,
  occupes: [],
  poste: null,
  ligne: null,

  connecter: (user, password) => {
    fermer();
    set({ status: 'connexion', erreur: null, occupes: [], poste: null, ligne: null });
    let ws: WebSocket;
    try {
      ws = new WebSocket(resolveUrl());
    } catch {
      set({ status: 'erreur', erreur: 'URL du serveur invalide.' });
      return;
    }
    socket = ws;

    ws.onopen = () => {
      if (ws === socket) envoyer({ t: 'capi-login', user, password });
    };

    ws.onmessage = (ev) => {
      if (ws !== socket) return;
      let msg: { t: string; [cle: string]: unknown };
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      switch (msg.t) {
        case 'capi-auth':
          set({ status: 'choix', erreur: null });
          break;
        case 'capi-occupation':
          set({ occupes: msg.occupes as number[] });
          break;
        case 'capi-assis':
          set({ status: 'assis', poste: msg.poste as number, erreur: null });
          break;
        case 'capi-etat':
          ecartMs = (msg.serveurMs as number) - Date.now();
          set({ ligne: msg.ligne as Ligne, occupes: msg.occupes as number[] });
          break;
        case 'capi-resultat': {
          const reponse = attentes.get(msg.id as number);
          attentes.delete(msg.id as number);
          reponse?.(msg.resultat as Resultat);
          break;
        }
        case 'capi-erreur':
          if (msg.code === 'auth') {
            // Identifiants refusés : on referme, un nouvel essai rouvrira la socket.
            fermer();
            set({ status: 'erreur', erreur: msg.message as string });
          } else {
            // Gare prise, par exemple : on reste connecté pour en choisir une autre.
            set({ erreur: msg.message as string });
          }
          break;
      }
    };

    ws.onclose = () => {
      if (ws !== socket) return;
      socket = null;
      for (const reponse of attentes.values()) reponse({ ok: false, alarme: 17 });
      attentes.clear();
      set({
        status: 'erreur',
        erreur: 'Connexion au serveur CAPI perdue ou impossible.',
        poste: null,
        ligne: null,
      });
    };

    ws.onerror = () => {
      // L'événement close suit.
    };
  },

  prendre: (poste) => {
    set({ erreur: null });
    envoyer({ t: 'capi-prendre', poste });
  },

  jouer: (saisie) =>
    new Promise<Resultat>((resolve) => {
      const id = nextId++;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        resolve({ ok: false, alarme: 17 });
        return;
      }
      attentes.set(id, resolve);
      envoyer({ t: 'capi-dialogue', id, saisie });
    }),

  commande: (cle, valeur) => envoyer({ t: 'capi-commande', cle, valeur }),

  quitter: () => {
    envoyer({ t: 'capi-quitter' });
    fermer();
    set({ status: 'idle', erreur: null, occupes: [], poste: null, ligne: null });
  },
}));
