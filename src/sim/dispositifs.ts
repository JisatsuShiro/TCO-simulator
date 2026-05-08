// Dispositifs d'attention — étiquettes mémo posées par l'opérateur sur un
// levier (DA, DSA, DR) ou un bloc (DA, DR) pour signaler "attention", "spécial
// attention" ou "rappel". Aucun effet sur les enclenchements ; pure couche
// d'annotation pour le suivi opérateur.
//
// Reproduction fidèle de l'action Vuex `toggleDispositifAttention` (renderer.js) :
//   toggleDispositifAttention(e, t) {
//     var n=t.leverId, a=t.blocId, i=t.dispositif;
//     if (n === void 0) {
//       if (a !== void 0) e.commit("TOGGLE_BLOC_DISPOSITIF", { blocId: a, dispositif: i });
//     } else {
//       e.commit("TOGGLE_DISPOSITIF", { leverId: n, dispositif: i });
//     }
//   }
//
// Mutations (renderer.js) :
//   TOGGLE_DISPOSITIF(state, {leverId, dispositif}) :
//     toggle dispositif dans state.levers[leverId].dispositifs
//   TOGGLE_BLOC_DISPOSITIF(state, {blocId, dispositif}) :
//     toggle dispositif dans state.blocs[<idx>].dispositifs

import type { PlayerData } from './types';

export interface ToggleDispositifPayload {
  /** ID du levier — exclusif avec `blocId`. */
  leverId?: string;
  /** ID du bloc — exclusif avec `leverId`. */
  blocId?: string;
  /** Code du dispositif : 'DA' | 'DSA' | 'DR'. */
  dispositif: string;
}

function toggleInList(list: string[] | undefined, item: string): string[] {
  const safe = list ?? [];
  const idx = safe.indexOf(item);
  if (idx === -1) return [...safe, item];
  return safe.slice(0, idx).concat(safe.slice(idx + 1));
}

export function toggleDispositifAttention(
  state: PlayerData,
  payload: ToggleDispositifPayload,
): PlayerData {
  const { leverId, blocId, dispositif } = payload;
  if (!dispositif) return state;

  if (leverId !== undefined) {
    const lever = state.levers[leverId];
    if (!lever) return state;
    const current = (lever.dispositifs as string[] | undefined) ?? [];
    const next = toggleInList(current, dispositif);
    return {
      ...state,
      levers: {
        ...state.levers,
        [leverId]: { ...lever, dispositifs: next },
      },
    };
  }

  if (blocId !== undefined) {
    const idx = state.blocs.findIndex((b) => b.id === blocId);
    if (idx === -1) return state;
    const bloc = state.blocs[idx];
    const next = toggleInList(bloc.dispositifs, dispositif);
    const updatedBloc = { ...bloc, dispositifs: next };
    const blocs = state.blocs.slice();
    blocs[idx] = updatedBloc;
    return { ...state, blocs };
  }

  return state;
}
