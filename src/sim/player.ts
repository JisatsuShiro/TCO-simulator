// Player slice : état dynamique de la simulation.
//
// Pour cette étape (1 du portage), c'est purement un *state holder* — on
// n'expose pas encore d'actions métier (toggleLever, moveTrainIn, etc.). Ces
// actions arriveront aux étapes suivantes.
//
// Le Player est construit à partir d'une Station via `stationToPlayerData`
// (cf. builder.ts). Tant qu'on n'a pas de scénario chargé, le `mode` reste
// `"edit"` et le Player est `null`.

import type { PlayerData } from './types';

/** Mode de l'application : `edit` = TCO statique, `play` = sim active. */
export type AppMode = 'edit' | 'play';

export interface PlayerState {
  mode: AppMode;
  /** PlayerData hydraté à `initPlayer()`. null en mode edit. */
  data: PlayerData | null;
}

export const initialPlayerState: PlayerState = {
  mode: 'edit',
  data: null,
};
