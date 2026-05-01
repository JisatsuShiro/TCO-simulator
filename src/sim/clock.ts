// Clock store : file d'événements priorisée + horloge logique de la sim.
//
// Reproduction fidèle du module Clock de Gessie (renderer.js @216800).
// Tout changement d'état "dans le temps" passe par cette file (mouvement de
// train, presse/relâche pédale, fermeture FA, fin EAP/EPA, déclenchement
// d'avarie scénarisée). Pas de game-loop physique — c'est purement
// event-driven.
//
// Différences avec Vuex :
//   - On utilise des "set" Zustand directement (pas de mutations vs actions)
//   - `checkEvents` appelle un dispatcher externe (injecté) car Clock ne
//     connaît pas le Player store ; ça évite le couplage circulaire.

import type { SimEvent } from './types';

let uidCounter = 0;
function makeUid(): string {
  uidCounter++;
  return `evt-${Date.now().toString(36)}-${uidCounter}`;
}

export interface ClockState {
  /** Temps logique courant (ms epoch). */
  currentTime: number;
  /** 0 = pause ; 1 = temps réel ; 2/5/10 = accéléré. */
  speed: number;
  /** Events programmés, triés par time ascendant. */
  events: SimEvent[];
  /** Events en pause (time === undefined, remainingTime défini). */
  pausedEvents: SimEvent[];
}

/**
 * Dispatcher d'événement : appelé par checkEvents pour chaque event échu.
 * Le Player store s'enregistre via setEventDispatcher() à son initialisation.
 */
export type EventDispatcher = (event: SimEvent) => void;

let dispatcher: EventDispatcher | null = null;
export function setEventDispatcher(fn: EventDispatcher | null): void {
  dispatcher = fn;
}

export const initialClockState: ClockState = {
  currentTime: 0,
  speed: 0,
  events: [],
  pausedEvents: [],
};

// ===== Helpers (purs, testables) =====

function sortByTime(a: SimEvent, b: SimEvent): number {
  // Les events en file ont toujours un time défini (les paused sont à part).
  const ta = a.time ?? Infinity;
  const tb = b.time ?? Infinity;
  return ta - tb;
}

// ===== Actions du Clock store =====
//
// On exporte des fonctions qui prennent l'état et renvoient le nouvel état.
// Le slice Zustand les expose via des wrappers `set(state => ...)`.

export const clockReducers = {
  INIT_CLOCK(state: ClockState, time: number): ClockState {
    return { ...state, speed: 0, currentTime: time, events: [], pausedEvents: [] };
  },

  ADD_EVENT(state: ClockState, event: SimEvent): ClockState {
    const events = [...state.events, event].sort(sortByTime);
    return { ...state, events };
  },

  /**
   * Met un event directement en pause sans qu'il soit jamais entré en file
   * (utilisé pour les events de moveTrainIn d'un train arrêté à un signal :
   * le `time` du moveTrainIn est calculé, mais on le pause avant qu'il
   * arrive). remainingTime = time - currentTime.
   */
  PREPARE_EVENT(state: ClockState, event: SimEvent): ClockState {
    const paused: SimEvent = {
      ...event,
      remainingTime: (event.time ?? state.currentTime) - state.currentTime,
      time: undefined,
    };
    return { ...state, pausedEvents: [...state.pausedEvents, paused] };
  },

  REMOVE_EVENT(state: ClockState, uid: string): ClockState {
    return { ...state, events: state.events.filter((e) => e.uid !== uid) };
  },

  REMOVE_PAUSED_EVENT(state: ClockState, uid: string): ClockState {
    return { ...state, pausedEvents: state.pausedEvents.filter((e) => e.uid !== uid) };
  },

  PAUSE_EVENT(state: ClockState, uid: string): ClockState {
    const idx = state.events.findIndex((e) => e.uid === uid);
    if (idx === -1) return state;
    const ev = state.events[idx];
    const remainingTime = Math.max(0, (ev.time ?? state.currentTime) - state.currentTime);
    const paused: SimEvent = { ...ev, remainingTime, time: undefined };
    const events = state.events.slice(0, idx).concat(state.events.slice(idx + 1));
    return { ...state, events, pausedEvents: [...state.pausedEvents, paused] };
  },

  RESUME_EVENT(state: ClockState, uid: string): ClockState {
    const idx = state.pausedEvents.findIndex((e) => e.uid === uid);
    if (idx === -1) return state;
    const ev = state.pausedEvents[idx];
    const resumed: SimEvent = {
      ...ev,
      time: (ev.remainingTime ?? 0) + state.currentTime,
      remainingTime: undefined,
    };
    const pausedEvents = state.pausedEvents.slice(0, idx).concat(state.pausedEvents.slice(idx + 1));
    const events = [...state.events, resumed].sort(sortByTime);
    return { ...state, pausedEvents, events };
  },

  UPDATE_CURRENT_TIME(state: ClockState, time: number): ClockState {
    return { ...state, currentTime: time };
  },

  SET_SPEED(state: ClockState, speed: number): ClockState {
    return { ...state, speed };
  },
};

// ===== Helpers pour ajouter un uid si manquant =====

export function ensureUid(event: SimEvent): SimEvent {
  if (event.uid) return event;
  return { ...event, uid: makeUid() };
}

// ===== checkEvents : avance l'horloge et dispatche les events échus =====
//
// On retourne le nouvel état + la liste d'events à dispatcher (le caller
// s'occupe d'appeler le dispatcher). Ça permet de garder cette fonction
// pure et testable.

export function processCheckEvents(
  state: ClockState,
  time: number,
): { state: ClockState; toDispatch: SimEvent[] } {
  let s = clockReducers.UPDATE_CURRENT_TIME(state, time);
  const toDispatch: SimEvent[] = [];
  while (s.events[0] && (s.events[0].time ?? Infinity) <= time) {
    const ev = s.events[0];
    toDispatch.push(ev);
    s = clockReducers.REMOVE_EVENT(s, ev.uid);
  }
  return { state: s, toDispatch };
}

// ===== Tick : appelé une fois par seconde pendant la sim =====
//
// L'appelant fournit le state courant et reçoit en retour le nouveau state
// + la liste d'events à dispatcher. Si speed === 0, no-op.

export function processTick(state: ClockState): { state: ClockState; toDispatch: SimEvent[] } {
  if (state.speed === 0) return { state, toDispatch: [] };
  const newTime = state.currentTime + 1000 * state.speed;
  return processCheckEvents(state, newTime);
}

// ===== Hook React (à brancher dans le composant qui orchestre la sim) =====
//
// (à écrire plus tard quand on aura un Player slice qui enregistre son
// dispatcher.)

export { dispatcher as currentDispatcher };
