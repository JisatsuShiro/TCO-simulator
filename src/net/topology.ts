// Topologie du cantonnement multijoueur : adjacence des gares et points de
// passage des trains d'une gare à l'autre.
//
// Ligne (nord → sud) : Vif — Monestier — Clelles.
// Convention de sens : `pair` = vers Vif (nord) ; `impair` = vers Clelles (sud).
//
// Pour chaque gare et chaque sens :
//   - `exit*`  : zone terminale où un train de ce sens QUITTE la gare.
//   - `entry*` : zone où un train ARRIVANT dans ce sens APPARAÎT (début de son
//                parcours interne).
// Ces ids de zone proviennent de l'analyse des `parcours` des stations (et non
// de leurs noms, peu fiables car les 3 gares partagent un gabarit). Vérifié :
// chaque zone d'entrée possède bien un parcours sortant dans le sens d'entrée.
//
// Quand un train atteint la zone de sortie d'un sens et qu'une gare voisine
// existe de ce côté, on le transfère : il réapparaît dans la voisine à sa zone
// d'entrée correspondante, même sens.

import type { Gare } from './gares';
import type { TrainPayload } from './protocol';

interface GareNet {
  /** Voisine côté Vif (nord) — destination des trains `pair`. */
  north: Gare | null;
  /** Voisine côté Clelles (sud) — destination des trains `impair`. */
  south: Gare | null;
  /** Zone terminale de sortie `pair` (nord). */
  exitPair: string;
  /** Zone terminale de sortie `impair` (sud). */
  exitImpair: string;
  /** Zone d'apparition d'un train `pair` entrant (par le sud). */
  entryPair: string;
  /** Zone d'apparition d'un train `impair` entrant (par le nord). */
  entryImpair: string;
}

export const GARE_NET: Record<Gare, GareNet> = {
  Vif: {
    north: null,
    south: 'Monestier',
    exitPair: 'z interposte Vif',
    exitImpair: 'z interposte Clelles',
    entryPair: 'z Veynes',
    entryImpair: 'z Monestier',
  },
  Monestier: {
    north: 'Vif',
    south: 'Clelles',
    exitPair: 'z Vif',
    exitImpair: 'z Clelles',
    entryPair: 'z Clelles',
    entryImpair: 'z Vif',
  },
  Clelles: {
    north: 'Monestier',
    south: null,
    exitPair: 'z interposte Vif',
    exitImpair: 'z interposte Clelles',
    entryPair: 'z Veynes',
    entryImpair: 'z Monestier',
  },
};

export interface Handoff {
  toGare: Gare;
  train: TrainPayload;
}

/**
 * Détermine si un train qui vient de quitter la zone `zone` (dans le sens
 * `train.direction`) de la gare `gare` doit être transféré à une voisine.
 * Retourne le transfert (gare cible + train avec sa zone d'entrée), ou `null`
 * si ce n'est pas une sortie inter-gare (sortie hors-périmètre, zone interne,
 * ou mauvais sens).
 */
export function computeHandoff(
  gare: Gare,
  zone: string,
  train: { name?: string; direction: 'pair' | 'impair'; size: TrainPayload['size']; speed: number },
): Handoff | null {
  const net = GARE_NET[gare];
  if (train.direction === 'pair' && zone === net.exitPair && net.north) {
    const toGare = net.north;
    return {
      toGare,
      train: {
        name: train.name,
        direction: 'pair',
        size: train.size,
        speed: train.speed,
        startingPoint: GARE_NET[toGare].entryPair,
      },
    };
  }
  if (train.direction === 'impair' && zone === net.exitImpair && net.south) {
    const toGare = net.south;
    return {
      toGare,
      train: {
        name: train.name,
        direction: 'impair',
        size: train.size,
        speed: train.speed,
        startingPoint: GARE_NET[toGare].entryImpair,
      },
    };
  }
  return null;
}
