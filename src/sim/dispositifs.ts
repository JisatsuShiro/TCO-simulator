// Dispositifs d'attention — étiquettes mémo posées par l'opérateur sur un
// levier (DA, DSA, DR) ou un bloc (DA, DR) pour signaler "attention", "spécial
// attention" ou "rappel". Aucun effet sur les enclenchements ; pure couche
// d'annotation pour le suivi opérateur.
//
// Contrairement au comportement Gessie d'origine (un simple toggle présent /
// absent), on autorise PLUSIEURS exemplaires du même dispositif sur une même
// cible — ex. 3 DR sur un levier. Le stockage reste un `string[]`, mais il
// peut désormais contenir des doublons (`['DR', 'DR', 'DR']`). L'opérateur
// ajoute (`op: 'add'`) ou retire (`op: 'remove'`) un exemplaire à la fois via
// le menu contextuel ; un "retirer" enlève une seule occurrence.

import type { PlayerData } from './types';

export interface ChangeDispositifPayload {
  /** ID du levier — exclusif avec `blocId`. */
  leverId?: string;
  /** ID du bloc — exclusif avec `leverId`. */
  blocId?: string;
  /** Code du dispositif : 'DA' | 'DSA' | 'DR'. */
  dispositif: string;
  /** 'add' ajoute un exemplaire, 'remove' en retire un (premier trouvé). */
  op: 'add' | 'remove';
}

/** Ajoute un exemplaire (en queue) ou retire la première occurrence. */
function applyOp(list: string[] | undefined, item: string, op: 'add' | 'remove'): string[] {
  const safe = list ?? [];
  if (op === 'add') return [...safe, item];
  const idx = safe.indexOf(item);
  if (idx === -1) return safe;
  return safe.slice(0, idx).concat(safe.slice(idx + 1));
}

export function changeDispositifAttention(
  state: PlayerData,
  payload: ChangeDispositifPayload,
): PlayerData {
  const { leverId, blocId, dispositif, op } = payload;
  if (!dispositif) return state;

  if (leverId !== undefined) {
    const lever = state.levers[leverId];
    if (!lever) return state;
    const current = (lever.dispositifs as string[] | undefined) ?? [];
    const next = applyOp(current, dispositif, op);
    if (next === current) return state;
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
    const next = applyOp(bloc.dispositifs, dispositif, op);
    if (next === bloc.dispositifs) return state;
    const updatedBloc = { ...bloc, dispositifs: next };
    const blocs = state.blocs.slice();
    blocs[idx] = updatedBloc;
    return { ...state, blocs };
  }

  return state;
}
