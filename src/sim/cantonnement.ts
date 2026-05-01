// Actions de cantonnement (blocs sémaphores) — étape 6 du portage Gessie.
//
// Reproduction fidèle des actions Vuex Player liées aux blocs (renderer.js
// @224000-@233000). Un Bloc = un enclenchement de cantonnement (BAPR/BAL)
// entre deux gares, avec :
//   - test/voieLibre/reddition/annonce/blocage/commutSemaphore : états textes
//     "E" (enclenché) / "A" (actif/délivré) / "R" (renversé) selon le champ.
//   - pedales : { 'réddition': { pressed }, ... }  — note l'accent !
//   - testDuration : durée (s) du test avant retour automatique en "E".
//
// Convention : actions `(state, payload) => PlayerData` ou `ActionResult`
// pour celles qui programment un event Clock. Échec silencieux (return state
// inchangé) si une garde refuse.

import type { ActionResult } from './actions';
import { updateAffectationPosition } from './actions';
import type { Bloc, PlayerData, SimEvent } from './types';

// ===== Helpers internes =====

function findBlocIdx(state: PlayerData, blocId: string): number {
  return state.blocs.findIndex((b) => b.id === blocId);
}

function patchBloc(
  state: PlayerData,
  blocIdx: number,
  patch: Partial<Bloc>,
): PlayerData {
  if (blocIdx < 0) return state;
  const blocs = state.blocs.slice();
  blocs[blocIdx] = { ...blocs[blocIdx], ...patch };
  return { ...state, blocs };
}

function patchBlocPedale(
  state: PlayerData,
  blocIdx: number,
  pedaleId: string,
  pressed: boolean,
): PlayerData {
  if (blocIdx < 0) return state;
  const bloc = state.blocs[blocIdx];
  const ped = bloc.pedales?.[pedaleId];
  if (!ped) return state;
  const blocs = state.blocs.slice();
  blocs[blocIdx] = {
    ...bloc,
    pedales: { ...bloc.pedales, [pedaleId]: { ...ped, pressed } },
  };
  return { ...state, blocs };
}

// ===== pressTestBouton (action Gessie) =====
//
// renderer.js @228700 : `if (TEST_IMPOSSIBLE not in disturbances) and
// (test !== 'A' && reddition !== 'A')` → set test='A' et programme un
// `lightOffTestBloc` à currentTime + testDuration*1000.

export function pressTestBouton(
  state: PlayerData,
  payload: { blocId: string; currentTime: number },
): ActionResult {
  const idx = findBlocIdx(state, payload.blocId);
  if (idx < 0) return { state };
  const bloc = state.blocs[idx];
  if (bloc.disturbances.indexOf('TEST_IMPOSSIBLE') !== -1) return { state };
  // Bundle : `"A"===s.test||"A"===s.reddition` → bail. On respecte cette garde.
  if (bloc.test === 'A' || bloc.reddition === 'A') return { state };
  const next = patchBloc(state, idx, { test: 'A' });
  const evt: SimEvent = {
    uid: '',
    time: payload.currentTime + 1000 * bloc.testDuration,
    type: 'lightOffTestBloc',
    blocId: payload.blocId,
  };
  return { state: next, events: [evt] };
}

// ===== lightOffTestBloc (handler de l'event programmé) =====
//
// Le bundle commit SWITCH_TEST_BLOC position="E" puis tente de retirer
// l'event de la file Clock — ici l'event vient déjà d'être consommé donc
// rien à faire de ce côté.

export function lightOffTestBloc(state: PlayerData, blocId: string): PlayerData {
  const idx = findBlocIdx(state, blocId);
  if (idx < 0) return state;
  return patchBloc(state, idx, { test: 'E' });
}

// ===== pressRedditionBouton (action Gessie) =====
//
// Le bundle Gessie ne définit pas une action `pressRedditionBouton` séparée :
// la pédale réddition d'un bloc est pressée via `pressBlocPedale`
// (UPDATE_BLOC_PEDALE → pressed:true). Mais la mission demande un wrapper qui
// programme aussi un `releaseRedditionBouton` automatique. On reproduit
// `pressBlocPedale` + addEvent à +1s par défaut (durée standard d'une presse
// de bouton dans Gessie).

export function pressRedditionBouton(
  state: PlayerData,
  payload: { blocId: string; currentTime: number },
): ActionResult {
  const idx = findBlocIdx(state, payload.blocId);
  if (idx < 0) return { state };
  const bloc = state.blocs[idx];
  const ped = bloc.pedales?.['réddition'];
  if (!ped) return { state };
  if (ped.pressed) return { state }; // déjà pressé : no-op (idempotent comme le bundle)
  const next = patchBlocPedale(state, idx, 'réddition', true);
  const evt: SimEvent = {
    uid: '',
    time: payload.currentTime + 1000,
    type: 'releaseRedditionBouton',
    blocId: payload.blocId,
  };
  return { state: next, events: [evt] };
}

// ===== releaseRedditionBouton (action Gessie) =====
//
// renderer.js @232400 : si la pédale réddition est pressée et REDDITION_IMPOSSIBLE
// pas dans disturbances, alors commit SWITCH_REDDITION_BLOC position="E". On
// retire aussi le `pressed:true` sur la pédale (sinon la pédale reste indéfiniment
// pressée — détail qui n'apparaît pas explicitement dans le bundle mais qui
// est implicite côté UX).

export function releaseRedditionBouton(state: PlayerData, blocId: string): PlayerData {
  const idx = findBlocIdx(state, blocId);
  if (idx < 0) return state;
  const bloc = state.blocs[idx];
  const ped = bloc.pedales?.['réddition'];
  if (!ped || !ped.pressed) return state;
  if (bloc.disturbances.indexOf('REDDITION_IMPOSSIBLE') !== -1) {
    // Disturbance active : on relâche juste la pédale, mais sans changer la reddition.
    return patchBlocPedale(state, idx, 'réddition', false);
  }
  const blocs = state.blocs.slice();
  blocs[idx] = {
    ...bloc,
    reddition: 'E',
    pedales: { ...bloc.pedales, 'réddition': { ...ped, pressed: false } },
  };
  return { ...state, blocs };
}

// ===== switchSemaphoreBouton (action Gessie : toggle commutSemaphore N↔R) =====
//
// renderer.js @226800. Logique :
//   Si commutSemaphore === 'N' (normal) :
//     - SWITCH_SEMAPHORE_BLOC position='R'
//     - Si DERANGEMENT_BLOC : stop là.
//     - Sinon, si test==='A' && voieLibre==='A' && annonce!=='A' :
//       SWITCH_SEMAPHORE_LIGHT_BLOC position='A' + dispatch updateAffectationPosition signal='O'
//   Sinon (R) :
//     - SWITCH_SEMAPHORE_BLOC position='N'
//     - SWITCH_SEMAPHORE_LIGHT_BLOC position='E'
//     - dispatch updateAffectationPosition signal='F'
//
// Note : pas de garde explicite NON_RECEPTION_VOIE_LIBRE ni ANNONCE_IMPOSSIBLE
// ici (ces gardes existent dans d'autres handlers, pas dans switchSemaphoreBouton).

export function switchSemaphoreBouton(state: PlayerData, blocId: string): PlayerData {
  const idx = findBlocIdx(state, blocId);
  if (idx < 0) return state;
  const bloc = state.blocs[idx];
  let s = state;
  if (bloc.commutSemaphore === 'N') {
    s = patchBloc(s, idx, { commutSemaphore: 'R' });
    if (bloc.disturbances.indexOf('DERANGEMENT_BLOC') !== -1) return s;
    if (bloc.test === 'A' && bloc.voieLibre === 'A' && bloc.annonce !== 'A') {
      s = patchBloc(s, idx, { commutSemaphore: 'R', commutSemaphoreLight: 'A' });
      if (bloc.semaphoreId) {
        s = updateAffectationPosition(s, {
          affectationId: bloc.semaphoreId,
          position: 'O',
        });
      }
    }
  } else {
    s = patchBloc(s, idx, {
      commutSemaphore: 'N',
      commutSemaphoreLight: 'E',
    });
    if (bloc.semaphoreId) {
      s = updateAffectationPosition(s, {
        affectationId: bloc.semaphoreId,
        position: 'F',
      });
    }
  }
  return s;
}

// ===== switchVoieLibreBouton (action Gessie) =====
//
// Trouvée @230600 dans le contexte d'un train arrivant à une gare : si la
// disturbance NON_RECEPTION_VOIE_LIBRE n'est pas active, et l'annonce vaut
// 'A', alors SWITCH_VOIE_LIBRE_BLOC position='A' + SWITCH_ANNONCE_BLOC position='E'.
//
// Pour un toggle manuel, on conserve la sémantique simple : si
// NON_RECEPTION_VOIE_LIBRE, no-op ; sinon toggle voieLibre A↔E.

export function switchVoieLibreBouton(state: PlayerData, blocId: string): PlayerData {
  const idx = findBlocIdx(state, blocId);
  if (idx < 0) return state;
  const bloc = state.blocs[idx];
  if (bloc.disturbances.indexOf('NON_RECEPTION_VOIE_LIBRE') !== -1) return state;
  const newVal = bloc.voieLibre === 'A' ? 'E' : 'A';
  return patchBloc(state, idx, { voieLibre: newVal });
}

// ===== pressAnnonceBouton (action Gessie) =====
//
// renderer.js @224500 : `if (ANNONCE_IMPOSSIBLE not in disturbances) and
// commutSemaphore === 'N'` → SWITCH_ANNONCE_BLOC position='A'.

export function pressAnnonceBouton(state: PlayerData, blocId: string): PlayerData {
  const idx = findBlocIdx(state, blocId);
  if (idx < 0) return state;
  const bloc = state.blocs[idx];
  if (bloc.disturbances.indexOf('ANNONCE_IMPOSSIBLE') !== -1) return state;
  if (bloc.commutSemaphore !== 'N') return state;
  return patchBloc(state, idx, { annonce: 'A' });
}
