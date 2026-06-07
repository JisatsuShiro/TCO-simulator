import { create } from 'zustand';
import type { Station, Tool } from '../types/gessie';
import {
  initialClockState,
  type ClockState,
  clockReducers,
  ensureUid,
} from '../sim/clock';
import { initialPlayerState, type AppMode, type PlayerState } from '../sim/player';
import { stationToPlayerData } from '../sim/builder';
import {
  toggleLever as toggleLeverAction,
  setEPAOff as setEPAOffAction,
  cancelEPA as cancelEPAAction,
  closeWithFA as closeWithFAAction,
  toggleCommutFC as toggleCommutFCAction,
  toggleAnnulElec as toggleAnnulElecAction,
  annulSubstitution as annulSubstitutionAction,
  diagnoseToggleLever,
  type LeverRefusal,
} from '../sim/actions';
import {
  startTrain as startTrainAction,
  moveTrainIn as moveTrainInAction,
  moveTrainOut as moveTrainOutAction,
  releasePedale as releasePedaleAction,
  toggleDisturbance as toggleDisturbanceAction,
  stopPhone as stopPhoneAction,
  toggleFA as toggleFAAction,
  trainCanStart as trainCanStartAction,
  forceTrainStart as forceTrainStartAction,
} from '../sim/train';
import {
  pressTestBouton as pressTestBoutonAction,
  lightOffTestBloc as lightOffTestBlocAction,
  pressRedditionBouton as pressRedditionBoutonAction,
  releaseRedditionBouton as releaseRedditionBoutonAction,
  switchSemaphoreBouton as switchSemaphoreBoutonAction,
  switchVoieLibreBouton as switchVoieLibreBoutonAction,
  pressAnnonceBouton as pressAnnonceBoutonAction,
} from '../sim/cantonnement';
import {
  pressATRBouton as pressATRBoutonAction,
  cancelATr as cancelATrAction,
  releaseATRBouton as releaseATRBoutonAction,
  giveATRAutorisation as giveATRAutorisationAction,
  removeATRAutorisation as removeATRAutorisationAction,
} from '../sim/atr';
import {
  takeKey as takeKeyAction,
  putKey as putKeyAction,
  takeCentralKey as takeCentralKeyAction,
  putCentralKey as putCentralKeyAction,
  toggleLock as toggleLockAction,
} from '../sim/keys';
import {
  toggleDispositifAttention as toggleDispositifAttentionAction,
  type ToggleDispositifPayload,
} from '../sim/dispositifs';
import type { Direction, PlayerData, SimEvent, Train } from '../sim/types';

/**
 * Entrée du journal des refus de toggleLever. Quand un opérateur tente de
 * manœuvrer un levier et qu'une garde refuse, on stocke la raison ici pour
 * affichage dans le panneau "Refus" du LeversPanel. C'est de l'UX, pas du
 * gameplay — n'affecte pas la sim.
 */
export interface LeverRefusalEntry extends LeverRefusal {
  /** Identifiant unique (timestamp ms + counter, monotonic). */
  uid: string;
  /** ID du levier concerné. */
  leverId: string;
  /** Heure simulée au moment du refus (clock.currentTime). */
  time: number;
}

interface GessieState {
  // === Données station + tools (persistantes le temps de la session) ===
  station: Station | null;
  tools: Record<string, Tool>;

  // === Sim state ===
  clock: ClockState;
  player: PlayerState;

  // === UX : journal des refus de toggleLever (panel "Refus") ===
  leverRefusals: LeverRefusalEntry[];
  /**
   * Compteur de refus non lus. Reset à 0 quand l'opérateur ouvre l'onglet
   * "Refus". Driving signal pour le clignotement de l'onglet.
   */
  leverRefusalsUnseen: number;

  // === Actions ===
  loadStation: (s: Station, tools: Tool[]) => void;
  /** Initialise le Player depuis la station courante et passe en mode play. */
  initPlayer: (startingTimeMs?: number) => void;
  /** Repasse en mode edit : Player vidé, Clock arrêté. */
  exitPlayer: () => void;
  setSpeed: (speed: number) => void;
  /** Ajoute un event à la file Clock (assigne un uid si absent). */
  addEvent: (event: SimEvent) => void;
  /** Avance l'horloge à `time` et dispatche les events échus. */
  checkEvents: (time: number) => void;
  /** Tick interne (appelé par le hook React qui pose un setInterval). */
  tick: () => void;
  /** Bascule un levier (échec silencieux si une garde n'est pas satisfaite). */
  toggleLever: (leverId: string) => void;
  /**
   * Bascule l'annulateur électrique d'un levier ("brise le sceau"). Quand
   * activé, le prochain `toggleLever` ignorera les gardes 6-10 (direction
   * active, zones, continuité, EAP/EPA). Les incompatibilités et serrures
   * restent vérifiées.
   */
  toggleAnnulElec: (leverId: string) => void;
  /**
   * Raccroche le téléphone : éteint la sonnerie sans relâcher le train (le
   * train reste en pause tant que le signal n'est pas ouvert). Reproduction
   * de l'action Vuex `stopPhone`.
   */
  stopPhone: () => void;
  /**
   * Ré-évalue la garde signal d'un train arrêté devant un contrôle fermé.
   * Si le signal a été ouvert depuis, le train repart ; sinon il se rebloque
   * (le téléphone resonne). Reproduction de `trainCanStart` Gessie.
   */
  trainCanStart: (trainId: string) => void;
  /**
   * Force le passage d'un train arrêté devant un contrôle fermé : le train
   * franchit le signal **même fermé** (faute professionnelle simulée pour
   * la formation). Reproduction de `forceTrainStart` Gessie avec
   * `forcePassage: true`.
   */
  forceTrainStart: (trainId: string) => void;
  /** Annule un EPA avec délai (programme un setEPAOff). */
  cancelEPA: (signalId: string) => void;
  /** Ferme un signal automatiquement (Fermeture Automatique). */
  closeWithFA: (signalId: string) => void;
  /**
   * Bascule l'annulateur de Fermeture Automatique d'un signal ("brise le
   * sceau"). Quand activé, la FA déclenchée au passage du train ne refermera
   * pas le signal (bypass dans `closeWithFA`). Quand on réenclenche le sceau
   * et qu'un EPA/EAP s'est accumulé, on tente une libération.
   */
  toggleFA: (signalId: string) => void;
  /**
   * Bouton fugitif "annulation de substitution" : tente d'ouvrir un signal
   * malgré l'occupation d'une zone de protection. No-op si la zone surveillée
   * n'est pas en circulation. Reproduit `annulSubstitution` (renderer.js).
   */
  annulSubstitution: (signalId: string) => void;
  /**
   * Bascule le commutateur de Fermeture Carré : verrouille/déverrouille
   * le signal. En déverrouillant, retire un setEPAOff éventuel de la file
   * Clock (cohérent avec Gessie qui appelle `REMOVE_EVENT`).
   */
  toggleCommutFC: (signalId: string) => void;
  /** Lance un nouveau train. Le nom est généré automatiquement. */
  startTrain: (train: { direction: Direction; size: Train['size']; speed: number; startingPoint: string }) => void;
  /** Toggle d'une disturbance (avarie) sur une affectation ou un bloc. */
  toggleDisturbance: (payload: { affectationId?: string; blocId?: string; disturbance: string }) => void;

  // === Cantonnement (étape 6 — partie A) ===
  pressTestBouton: (blocId: string) => void;
  pressRedditionBouton: (blocId: string) => void;
  switchSemaphoreBouton: (blocId: string) => void;
  switchVoieLibreBouton: (blocId: string) => void;
  pressAnnonceBouton: (blocId: string) => void;

  // === ATR (étape 6 — partie B) ===
  pressATRBouton: (atrId: string) => void;
  releaseATRBouton: (atrId: string) => void;
  giveATRAutorisation: (atrId: string) => void;
  removeATRAutorisation: (atrId: string) => void;

  /**
   * Bascule un dispositif d'attention (DA / DSA / DR) sur un levier ou un
   * bloc. Pure annotation opérateur, n'affecte pas les enclenchements.
   * Reproduit `toggleDispositifAttention` (renderer.js).
   */
  toggleDispositifAttention: (payload: ToggleDispositifPayload) => void;

  // === Clés (étape 6 — partie C) ===
  takeKey: (payload: { lock?: boolean; groupId?: string; leverId?: string; keyId: string }) => void;
  putKey: (payload: { lock?: boolean; groupId?: string; leverId?: string; keyId: string }) => void;
  takeCentralKey: (uid: string) => void;
  putCentralKey: (uid: string) => void;
  /**
   * Tourne la clé d'un cadenas N↔R (plus↔minus). R→N refusé sans clé
   * présente (refus silencieux). Reproduit `toggleLock` (renderer.js).
   */
  toggleLock: (keyId: string) => void;

  // === Refus journal ===
  /** Marque tous les refus comme lus (reset du badge clignotant). */
  markLeverRefusalsSeen: () => void;
  /** Vide entièrement le journal des refus. */
  clearLeverRefusals: () => void;
}

/**
 * Résultat d'un dispatch d'event Player. Le routeur peut renvoyer :
 *   - state : nouveau PlayerData (ou inchangé)
 *   - newEvents : events à pousser dans la file Clock
 *   - pauseEventUids / resumeEventUids : opérations sur la file Clock
 * Ou null si l'event n'a pas de handler (caller log un warning).
 */
interface DispatchResult {
  state: PlayerData;
  newEvents?: SimEvent[];
  pauseEventUids?: string[];
  resumeEventUids?: string[];
}

/**
 * Mini-routeur d'event → action Player. Reçoit l'état Player + Clock courants
 * et retourne le DispatchResult (ou null si l'event n'est pas géré).
 */
function dispatchPlayerEvent(
  state: PlayerData,
  clock: ClockState,
  event: SimEvent,
): DispatchResult | null {
  switch (event.type) {
    case 'setEPAOff': {
      const signalId = (event as { signalId?: string }).signalId;
      if (!signalId) return { state };
      return { state: setEPAOffAction(state, signalId) };
    }
    case 'moveTrainIn': {
      if (!event.train || !event.target) return { state };
      const ctx = {
        allRunningEvents: clock.events.concat(clock.pausedEvents),
        runningEvents: clock.events,
      };
      const res = moveTrainInAction(
        state,
        {
          train: event.train,
          target: event.target,
          time: event.time ?? clock.currentTime,
          forcePassage: (event as { forcePassage?: boolean }).forcePassage,
        },
        ctx,
      );
      return {
        state: res.state,
        newEvents: res.events,
        pauseEventUids: res.pauseEventUids,
        resumeEventUids: res.resumeEventUids,
      };
    }
    case 'moveTrainOut': {
      if (!event.train || !event.target) return { state };
      const res = moveTrainOutAction(state, {
        train: event.train,
        target: event.target,
        pausedEvents: clock.pausedEvents,
      });
      return {
        state: res.state,
        newEvents: res.events,
        pauseEventUids: res.pauseEventUids,
        resumeEventUids: res.resumeEventUids,
      };
    }
    case 'releasePedale': {
      const signalId = (event as { signalId?: string }).signalId;
      const pedaleId = (event as { pedaleId?: string }).pedaleId;
      if (!signalId || !pedaleId) return { state };
      return { state: releasePedaleAction(state, { signalId, pedaleId }) };
    }
    case 'toggleDisturbance': {
      const dist = (event as { disturbance?: string }).disturbance;
      if (!dist) return { state };
      return {
        state: toggleDisturbanceAction(state, {
          affectationId: event.affectationId,
          blocId: event.blocId,
          disturbance: dist,
          runningEvents: clock.events.concat(clock.pausedEvents),
        }),
      };
    }
    case 'lightOffTestBloc': {
      if (!event.blocId) return { state };
      return { state: lightOffTestBlocAction(state, event.blocId) };
    }
    case 'releaseRedditionBouton': {
      if (!event.blocId) return { state };
      return { state: releaseRedditionBoutonAction(state, event.blocId) };
    }
    case 'cancelATr': {
      const atrId = (event as { atrId?: string }).atrId;
      if (!atrId) return { state };
      return { state: cancelATrAction(state, atrId) };
    }
    case 'closeWithFA': {
      // Dispatch scénarisé via Affectation.events (cf. train.ts) — un
      // scénario peut forcer la fermeture d'un signal au passage d'un train.
      const signalId = (event as { signalId?: string }).signalId;
      if (!signalId) return { state };
      return { state: closeWithFAAction(state, signalId) };
    }
    case 'startTrain': {
      // Spawn différé d'un train scénarisé. Le payload contient un Train
      // partiel (direction/size/speed/startingPoint, name à assigner).
      if (!event.train) return { state };
      const existingNames = Array.from(
        new Set(
          clock.events
            .concat(clock.pausedEvents)
            .map((e) => e.train?.name)
            .filter((n): n is string => typeof n === 'string'),
        ),
      );
      const res = startTrainAction(state, {
        train: event.train,
        existingTrainNames: existingNames,
        currentTime: clock.currentTime,
      });
      return { state: res.state, newEvents: res.events };
    }
    default:
      return null;
  }
}

/**
 * Helper partagé entre `trainCanStart` et `forceTrainStart` (cf.
 * `sim/train.ts`). Encapsule l'orchestration Clock :
 *   1. Resume tous les paused events du train (déplace pausedEvents → events)
 *   2. Retire l'event arrivé (qu'on re-joue manuellement, déjà résolu par
 *      l'action sim qui retourne le state post-moveTrainIn)
 *   3. Pousse les nouveaux events générés par moveTrainIn
 *   4. Re-pause les events que moveTrainIn a relinkés (signal toujours
 *      fermé en mode `trainCanStart`)
 */
function applyTrainStartResult(
  s: GessieState,
  action: typeof trainCanStartAction,
  trainId: string,
): Partial<GessieState> | GessieState {
  if (!s.player.data) return s;
  const ctx = {
    pausedEvents: s.clock.pausedEvents,
    runningEvents: s.clock.events,
    currentTime: s.clock.currentTime,
  };
  const res = action(s.player.data, { trainId }, ctx);
  const playerChanged = res.state !== s.player.data;
  const hasOps =
    !!res.events?.length ||
    !!res.pauseEventUids?.length ||
    !!res.resumeEventUids?.length ||
    !!res.removeEventUids?.length;
  if (!playerChanged && !hasOps) return s;

  let clock = s.clock;
  if (res.resumeEventUids) {
    for (const uid of res.resumeEventUids) {
      clock = clockReducers.RESUME_EVENT(clock, uid);
    }
  }
  if (res.removeEventUids) {
    for (const uid of res.removeEventUids) {
      clock = clockReducers.REMOVE_EVENT(clock, uid);
    }
  }
  if (res.events) {
    for (const ev of res.events) {
      clock = clockReducers.ADD_EVENT(clock, ensureUid(ev));
    }
  }
  if (res.pauseEventUids) {
    for (const uid of res.pauseEventUids) {
      clock = clockReducers.PAUSE_EVENT(clock, uid);
    }
  }
  return {
    player: playerChanged ? { ...s.player, data: res.state } : s.player,
    clock,
  };
}

/**
 * Applique un DispatchResult sur le couple (clock, player). Pousse les
 * nouveaux events, met en pause/reprend ceux signalés.
 */
function applyDispatchResult(
  clock: ClockState,
  res: DispatchResult,
): ClockState {
  let c = clock;
  if (res.pauseEventUids) {
    for (const uid of res.pauseEventUids) {
      c = clockReducers.PAUSE_EVENT(c, uid);
    }
  }
  if (res.resumeEventUids) {
    for (const uid of res.resumeEventUids) {
      c = clockReducers.RESUME_EVENT(c, uid);
    }
  }
  if (res.newEvents) {
    for (const ev of res.newEvents) {
      c = clockReducers.ADD_EVENT(c, ensureUid(ev));
    }
  }
  return c;
}

/**
 * Avance l'horloge jusqu'à `time` et dispatche les events échus dans l'ordre.
 *
 * IMPORTANT — fidélité Gessie : l'event reste dans `clock.events` PENDANT son
 * dispatch (Gessie : `dispatch(); REMOVE_EVENT;`). On ne le retire qu'après.
 * Sans ça, `moveTrainIn` ratait son propre event au moment de filtrer
 * `events.filter(e => e.train.name === ...)` pour le lier à un carré fermé,
 * et le train disparaissait à la réouverture du levier (cf. bug zones-overlap).
 */
function drainDueEvents(
  clock: ClockState,
  playerData: PlayerData | null,
  time: number,
): { nextClock: ClockState; nextPlayerData: PlayerData | null } {
  let nextClock = clockReducers.UPDATE_CURRENT_TIME(clock, time);
  let nextPlayerData = playerData;
  while (nextClock.events[0] && (nextClock.events[0].time ?? Infinity) <= time) {
    const ev = nextClock.events[0];
    if (nextPlayerData) {
      const out = dispatchPlayerEvent(nextPlayerData, nextClock, ev);
      if (out !== null) {
        nextPlayerData = out.state;
        nextClock = applyDispatchResult(nextClock, out);
      } else {
        console.log('[sim] event due (no handler):', ev.type, ev);
      }
    }
    // Retire l'event APRÈS dispatch (Gessie). Si l'event a été pause/resume
    // pendant le dispatch (= déplacé), REMOVE_EVENT est un no-op silencieux.
    nextClock = clockReducers.REMOVE_EVENT(nextClock, ev.uid);
  }
  return { nextClock, nextPlayerData };
}

export const useGessieStore = create<GessieState>((set, get) => ({
  station: null,
  tools: {},

  clock: initialClockState,
  player: initialPlayerState,
  leverRefusals: [],
  leverRefusalsUnseen: 0,

  loadStation: (station, toolList) =>
    set({
      station,
      tools: Object.fromEntries(toolList.map((t) => [t.id, t])),
      // Reset Player + Clock (la nouvelle station n'a plus de sim active).
      player: initialPlayerState,
      clock: initialClockState,
      leverRefusals: [],
      leverRefusalsUnseen: 0,
    }),

  initPlayer: (startingTimeMs) => {
    const station = get().station;
    if (!station) return;
    const data = stationToPlayerData(station);
    const t0 = startingTimeMs ?? Date.now();
    set({
      player: { mode: 'play', data },
      clock: clockReducers.INIT_CLOCK(initialClockState, t0),
      leverRefusals: [],
      leverRefusalsUnseen: 0,
    });
  },

  exitPlayer: () =>
    set({
      player: initialPlayerState,
      clock: initialClockState,
      leverRefusals: [],
      leverRefusalsUnseen: 0,
    }),

  setSpeed: (speed) =>
    set((s) => ({ clock: clockReducers.SET_SPEED(s.clock, speed) })),

  addEvent: (event) =>
    set((s) => ({ clock: clockReducers.ADD_EVENT(s.clock, ensureUid(event)) })),

  checkEvents: (time) => {
    const { clock, player } = get();
    const { nextClock, nextPlayerData } = drainDueEvents(clock, player.data, time);
    set({
      clock: nextClock,
      player: nextPlayerData === player.data ? player : { ...player, data: nextPlayerData },
    });
  },

  tick: () => {
    const { clock, player } = get();
    if (clock.speed === 0) return;
    const newTime = clock.currentTime + 1000 * clock.speed;
    const { nextClock, nextPlayerData } = drainDueEvents(clock, player.data, newTime);
    set({
      clock: nextClock,
      player: nextPlayerData === player.data ? player : { ...player, data: nextPlayerData },
    });
  },

  toggleLever: (leverId) =>
    set((s) => {
      if (!s.player.data) return s;
      const before = s.player.data;
      const next = toggleLeverAction(before, leverId);
      if (next === before) {
        // Garde refusée : on diagnostique pour expliquer à l'opérateur via
        // le panneau "Refus". `diagnoseToggleLever` retourne la première
        // garde qui aurait bloqué (cf. sim/actions.ts).
        const diag = diagnoseToggleLever(before, leverId);
        if (!diag) return s; // bizarre : no-op sans cause identifiable
        const entry: LeverRefusalEntry = {
          uid: `${Date.now()}-${s.leverRefusals.length}`,
          leverId,
          time: s.clock.currentTime,
          guard: diag.guard,
          reason: diag.reason,
        };
        return {
          leverRefusals: [...s.leverRefusals, entry],
          leverRefusalsUnseen: s.leverRefusalsUnseen + 1,
        };
      }

      // Détection des signaux qui viennent de s'ouvrir avec des linkedEvents
      // (= un train téléphonait — on le reprend dans la file Clock).
      // Reproduit la logique Gessie `dispatch("resumeEvent", N)` qui vit dans
      // updateAffectationPosition côté bundle. La logique reste ici (et non
      // dans `sim/actions.ts`) pour conserver `updateAffectationPosition`
      // pure : seul le store a accès au Clock (clockReducers, pausedEvents).
      const resumeUids: string[] = [];
      let cleaned = next;
      for (const [id, aff] of Object.entries(next.affectations)) {
        const wasClosed = before.affectations[id]?.position === 'F';
        const isOpen = aff.position === 'O';
        const linked = aff.linkedEvents;
        if (wasClosed && isOpen && linked && linked.length > 0) {
          resumeUids.push(...linked);
          cleaned = {
            ...cleaned,
            affectations: {
              ...cleaned.affectations,
              [id]: { ...aff, linkedEvents: [] },
            },
          };
        }
      }

      // Cas usuel : aucun train téléphonant — on n'a pas à toucher au Clock.
      if (resumeUids.length === 0) {
        return { player: { ...s.player, data: cleaned } };
      }

      let clock = s.clock;
      for (const uid of resumeUids) {
        clock = clockReducers.RESUME_EVENT(clock, uid);
      }
      // Plus de train téléphonant → coupe la sonnerie.
      cleaned = { ...cleaned, phoneIsRinging: false };

      return {
        player: { ...s.player, data: cleaned },
        clock,
      };
    }),

  toggleAnnulElec: (leverId) =>
    set((s) => {
      if (!s.player.data) return s;
      const next = toggleAnnulElecAction(s.player.data, leverId);
      if (next === s.player.data) return s;
      return { player: { ...s.player, data: next } };
    }),

  stopPhone: () =>
    set((s) => {
      if (!s.player.data) return s;
      const next = stopPhoneAction(s.player.data);
      if (next === s.player.data) return s;
      return { player: { ...s.player, data: next } };
    }),

  trainCanStart: (trainId) =>
    set((s) => applyTrainStartResult(s, trainCanStartAction, trainId)),

  forceTrainStart: (trainId) =>
    set((s) => applyTrainStartResult(s, forceTrainStartAction, trainId)),

  toggleDispositifAttention: (payload) =>
    set((s) => {
      if (!s.player.data) return s;
      const next = toggleDispositifAttentionAction(s.player.data, payload);
      if (next === s.player.data) return s;
      return { player: { ...s.player, data: next } };
    }),

  cancelEPA: (signalId) =>
    set((s) => {
      if (!s.player.data) return s;
      const result = cancelEPAAction(s.player.data, signalId, s.clock.currentTime);
      let clock = s.clock;
      if (result.events && result.events.length > 0) {
        for (const ev of result.events) {
          clock = clockReducers.ADD_EVENT(clock, ensureUid(ev));
        }
      }
      const playerChanged = result.state !== s.player.data;
      return {
        player: playerChanged ? { ...s.player, data: result.state } : s.player,
        clock,
      };
    }),

  closeWithFA: (signalId) =>
    set((s) => {
      if (!s.player.data) return s;
      const next = closeWithFAAction(s.player.data, signalId);
      if (next === s.player.data) return s;
      return { player: { ...s.player, data: next } };
    }),

  toggleFA: (signalId) =>
    set((s) => {
      if (!s.player.data) return s;
      const next = toggleFAAction(s.player.data, signalId);
      if (next === s.player.data) return s;
      return { player: { ...s.player, data: next } };
    }),

  annulSubstitution: (signalId) =>
    set((s) => {
      if (!s.player.data) return s;
      const next = annulSubstitutionAction(s.player.data, signalId);
      if (next === s.player.data) return s;
      return { player: { ...s.player, data: next } };
    }),

  toggleCommutFC: (signalId) =>
    set((s) => {
      if (!s.player.data) return s;
      const result = toggleCommutFCAction(s.player.data, signalId);
      const playerChanged = result.state !== s.player.data;
      if (!playerChanged && !result.removeEvents) return s;

      let clock = s.clock;
      if (result.removeEvents) {
        for (const ev of [...s.clock.events, ...s.clock.pausedEvents]) {
          if (result.removeEvents(ev)) {
            clock = clockReducers.REMOVE_EVENT(clock, ev.uid);
          }
        }
      }
      return {
        player: playerChanged ? { ...s.player, data: result.state } : s.player,
        clock,
      };
    }),

  startTrain: (params) =>
    set((s) => {
      if (!s.player.data) return s;
      // Liste des noms de trains déjà actifs (events + paused) — mêmes règles
      // que Gessie : on extrait .train.name et on dédoublonne.
      const allEvents = s.clock.events.concat(s.clock.pausedEvents);
      const existingNames = Array.from(
        new Set(
          allEvents
            .map((e) => e.train?.name)
            .filter((n): n is string => typeof n === 'string'),
        ),
      );
      const incomingTrain: Train = {
        name: '', // sera assigné par startTrainAction
        direction: params.direction,
        size: params.size,
        speed: params.speed,
        startingPoint: params.startingPoint,
      };
      const res = startTrainAction(s.player.data, {
        train: incomingTrain,
        existingTrainNames: existingNames,
        currentTime: s.clock.currentTime,
      });
      const nextClock = applyDispatchResult(s.clock, {
        state: res.state,
        newEvents: res.events,
      });
      return {
        player: res.state === s.player.data ? s.player : { ...s.player, data: res.state },
        clock: nextClock,
      };
    }),

  toggleDisturbance: (payload) =>
    set((s) => {
      if (!s.player.data) return s;
      const next = toggleDisturbanceAction(s.player.data, {
        ...payload,
        runningEvents: s.clock.events.concat(s.clock.pausedEvents),
      });
      if (next === s.player.data) return s;
      return { player: { ...s.player, data: next } };
    }),

  // === Cantonnement ===
  pressTestBouton: (blocId) =>
    set((s) => {
      if (!s.player.data) return s;
      const result = pressTestBoutonAction(s.player.data, {
        blocId,
        currentTime: s.clock.currentTime,
      });
      let clock = s.clock;
      if (result.events) {
        for (const ev of result.events) {
          clock = clockReducers.ADD_EVENT(clock, ensureUid(ev));
        }
      }
      const playerChanged = result.state !== s.player.data;
      return {
        player: playerChanged ? { ...s.player, data: result.state } : s.player,
        clock,
      };
    }),

  pressRedditionBouton: (blocId) =>
    set((s) => {
      if (!s.player.data) return s;
      const result = pressRedditionBoutonAction(s.player.data, {
        blocId,
        currentTime: s.clock.currentTime,
      });
      let clock = s.clock;
      if (result.events) {
        for (const ev of result.events) {
          clock = clockReducers.ADD_EVENT(clock, ensureUid(ev));
        }
      }
      const playerChanged = result.state !== s.player.data;
      return {
        player: playerChanged ? { ...s.player, data: result.state } : s.player,
        clock,
      };
    }),

  switchSemaphoreBouton: (blocId) =>
    set((s) => {
      if (!s.player.data) return s;
      const next = switchSemaphoreBoutonAction(s.player.data, blocId);
      if (next === s.player.data) return s;
      return { player: { ...s.player, data: next } };
    }),

  switchVoieLibreBouton: (blocId) =>
    set((s) => {
      if (!s.player.data) return s;
      const next = switchVoieLibreBoutonAction(s.player.data, blocId);
      if (next === s.player.data) return s;
      return { player: { ...s.player, data: next } };
    }),

  pressAnnonceBouton: (blocId) =>
    set((s) => {
      if (!s.player.data) return s;
      const next = pressAnnonceBoutonAction(s.player.data, blocId);
      if (next === s.player.data) return s;
      return { player: { ...s.player, data: next } };
    }),

  // === ATR ===
  pressATRBouton: (atrId) =>
    set((s) => {
      if (!s.player.data) return s;
      const result = pressATRBoutonAction(s.player.data, {
        atrId,
        currentTime: s.clock.currentTime,
      });
      let clock = s.clock;
      if (result.events) {
        for (const ev of result.events) {
          clock = clockReducers.ADD_EVENT(clock, ensureUid(ev));
        }
      }
      const playerChanged = result.state !== s.player.data;
      return {
        player: playerChanged ? { ...s.player, data: result.state } : s.player,
        clock,
      };
    }),

  releaseATRBouton: (atrId) =>
    set((s) => {
      if (!s.player.data) return s;
      const next = releaseATRBoutonAction(s.player.data, atrId);
      if (next === s.player.data) return s;
      return { player: { ...s.player, data: next } };
    }),

  giveATRAutorisation: (atrId) =>
    set((s) => {
      if (!s.player.data) return s;
      const next = giveATRAutorisationAction(s.player.data, atrId);
      if (next === s.player.data) return s;
      return { player: { ...s.player, data: next } };
    }),

  removeATRAutorisation: (atrId) =>
    set((s) => {
      if (!s.player.data) return s;
      const next = removeATRAutorisationAction(s.player.data, atrId);
      if (next === s.player.data) return s;
      return { player: { ...s.player, data: next } };
    }),

  // === Clés ===
  takeKey: (payload) =>
    set((s) => {
      if (!s.player.data) return s;
      const next = takeKeyAction(s.player.data, payload);
      if (next === s.player.data) return s;
      return { player: { ...s.player, data: next } };
    }),

  putKey: (payload) =>
    set((s) => {
      if (!s.player.data) return s;
      const next = putKeyAction(s.player.data, payload);
      if (next === s.player.data) return s;
      return { player: { ...s.player, data: next } };
    }),

  takeCentralKey: (uid) =>
    set((s) => {
      if (!s.player.data) return s;
      const next = takeCentralKeyAction(s.player.data, uid);
      if (next === s.player.data) return s;
      return { player: { ...s.player, data: next } };
    }),

  putCentralKey: (uid) =>
    set((s) => {
      if (!s.player.data) return s;
      const next = putCentralKeyAction(s.player.data, uid);
      if (next === s.player.data) return s;
      return { player: { ...s.player, data: next } };
    }),

  toggleLock: (keyId) =>
    set((s) => {
      if (!s.player.data) return s;
      const next = toggleLockAction(s.player.data, keyId);
      if (next === s.player.data) return s;
      return { player: { ...s.player, data: next } };
    }),

  markLeverRefusalsSeen: () =>
    set((s) => (s.leverRefusalsUnseen === 0 ? s : { leverRefusalsUnseen: 0 })),

  clearLeverRefusals: () =>
    set((s) =>
      s.leverRefusals.length === 0 && s.leverRefusalsUnseen === 0
        ? s
        : { leverRefusals: [], leverRefusalsUnseen: 0 },
    ),

}));

// ===== Helpers =====

export function useAppMode(): AppMode {
  return useGessieStore((s) => s.player.mode);
}

export function useClockTime(): number {
  return useGessieStore((s) => s.clock.currentTime);
}
