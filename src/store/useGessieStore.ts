import { create } from 'zustand';
import type { Station, Tool } from '../types/gessie';
import {
  initialClockState,
  type ClockState,
  clockReducers,
  ensureUid,
  processCheckEvents,
  processTick,
} from '../sim/clock';
import { initialPlayerState, type AppMode, type PlayerState } from '../sim/player';
import { stationToPlayerData } from '../sim/builder';
import {
  toggleLever as toggleLeverAction,
  setEPAOff as setEPAOffAction,
  cancelEPA as cancelEPAAction,
  closeWithFA as closeWithFAAction,
  toggleCommutFC as toggleCommutFCAction,
} from '../sim/actions';
import {
  startTrain as startTrainAction,
  moveTrainIn as moveTrainInAction,
  moveTrainOut as moveTrainOutAction,
  releasePedale as releasePedaleAction,
  toggleDisturbance as toggleDisturbanceAction,
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
} from '../sim/keys';
import type { Direction, PlayerData, SimEvent, Train } from '../sim/types';

interface GessieState {
  // === Données station + tools (persistantes le temps de la session) ===
  station: Station | null;
  tools: Record<string, Tool>;

  // === UI (debug / hover) ===
  hoveredUid: string | null;
  setHoveredUid: (uid: string | null) => void;

  // === Sim state ===
  clock: ClockState;
  player: PlayerState;

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
  /** Annule un EPA avec délai (programme un setEPAOff). */
  cancelEPA: (signalId: string) => void;
  /** Ferme un signal automatiquement (Fermeture Automatique). */
  closeWithFA: (signalId: string) => void;
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

  // === Clés (étape 6 — partie C) ===
  takeKey: (payload: { lock?: boolean; groupId?: string; leverId?: string; keyId: string }) => void;
  putKey: (payload: { lock?: boolean; groupId?: string; leverId?: string; keyId: string }) => void;
  takeCentralKey: (uid: string) => void;
  putCentralKey: (uid: string) => void;
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
      if (!event.signalId) return { state };
      return { state: setEPAOffAction(state, event.signalId) };
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
    default:
      return null;
  }
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

export const useGessieStore = create<GessieState>((set, get) => ({
  station: null,
  tools: {},
  hoveredUid: null,

  clock: initialClockState,
  player: initialPlayerState,

  setHoveredUid: (uid) => set({ hoveredUid: uid }),

  loadStation: (station, toolList) =>
    set({
      station,
      tools: Object.fromEntries(toolList.map((t) => [t.id, t])),
      // Reset Player + Clock (la nouvelle station n'a plus de sim active).
      player: initialPlayerState,
      clock: initialClockState,
    }),

  initPlayer: (startingTimeMs) => {
    const station = get().station;
    if (!station) return;
    const data = stationToPlayerData(station);
    const t0 = startingTimeMs ?? Date.now();
    set({
      player: { mode: 'play', data },
      clock: clockReducers.INIT_CLOCK(initialClockState, t0),
    });
  },

  exitPlayer: () =>
    set({ player: initialPlayerState, clock: initialClockState }),

  setSpeed: (speed) =>
    set((s) => ({ clock: clockReducers.SET_SPEED(s.clock, speed) })),

  addEvent: (event) =>
    set((s) => ({ clock: clockReducers.ADD_EVENT(s.clock, ensureUid(event)) })),

  checkEvents: (time) => {
    const { clock, player } = get();
    const { state: afterTick, toDispatch } = processCheckEvents(clock, time);
    let nextClock = afterTick;
    let nextPlayerData = player.data;
    for (const ev of toDispatch) {
      if (nextPlayerData) {
        const out = dispatchPlayerEvent(nextPlayerData, nextClock, ev);
        if (out !== null) {
          nextPlayerData = out.state;
          nextClock = applyDispatchResult(nextClock, out);
          continue;
        }
      }
      console.log('[sim] event due (no handler):', ev.type, ev);
    }
    set({
      clock: nextClock,
      player: nextPlayerData === player.data ? player : { ...player, data: nextPlayerData },
    });
  },

  tick: () => {
    const { clock, player } = get();
    if (clock.speed === 0) return;
    const { state: afterTick, toDispatch } = processTick(clock);
    let nextClock = afterTick;
    let nextPlayerData = player.data;
    for (const ev of toDispatch) {
      if (nextPlayerData) {
        const out = dispatchPlayerEvent(nextPlayerData, nextClock, ev);
        if (out !== null) {
          nextPlayerData = out.state;
          nextClock = applyDispatchResult(nextClock, out);
          continue;
        }
      }
      console.log('[sim] event due (no handler):', ev.type, ev);
    }
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
      if (next === before) return s; // garde refusée — no-op

      // Détection des signaux qui viennent de s'ouvrir avec des linkedEvents
      // (= un train téléphonait — on le reprend dans la file Clock).
      // Reproduit la logique Gessie `dispatch("resumeEvent", N)` dans
      // updateAffectationPosition (cf. actions.ts:483, marqué TODO étape 6).
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

}));

// ===== Helpers =====

export function useAppMode(): AppMode {
  return useGessieStore((s) => s.player.mode);
}

export function useClockTime(): number {
  return useGessieStore((s) => s.clock.currentTime);
}
