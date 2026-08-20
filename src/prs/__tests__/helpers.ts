// Outillage commun aux essais de conformité du PRS.
//
// Ces essais confrontent le moteur porté au simulateur d'origine
// (`PRS/construc/gaestro.js`), enclenchement par enclenchement, en suivant le
// relevé de `enclenchement.md`. Chaque `describe` porte le numéro de section du
// rapport, chaque `it` cite la condition du source qu'il vérifie.

import { annulAtr, armAtr, createInitialState, pressRoute } from '../engine';
import type { PrsState } from '../engine';
import type { AigId, RouteId, ZoneId } from '../topology';

/** Horodatage fixe : le moteur travaille sur des échéances absolues. */
export const T = 1_000_000;

/** Transformation d'état, composable — le vocabulaire de mise en situation. */
export type Situation = (s: PrsState) => PrsState;

export const depuisRepos = (...fs: Situation[]): PrsState =>
  fs.reduce<PrsState>((s, f) => f(s), createInitialState());

export const et =
  (...fs: Situation[]): Situation =>
  (s) =>
    fs.reduce<PrsState>((a, f) => f(a), s);

/**
 * Occupe des circuits de voie directement.
 *
 * On ne passe **pas** par `setZoneFault` : le formulaire de dérangement ne
 * couvre que 7 des 21 circuits, et son propagateur (`fimm()`) en occupe
 * plusieurs à la fois. Pour éprouver une garde, il faut pouvoir n'occuper
 * qu'une zone.
 */
export const occupe =
  (...zs: ZoneId[]): Situation =>
  (s) => {
    for (const z of zs) s.zones[z] = 2;
    return s;
  };

/**
 * Annonce reçue du poste voisin.
 *
 * Ce n'est pas une commande : dans l'original elle est posée par le moteur de
 * trafic (`tunbis()`, `tbunbis()`), allume le voyant du TCO et, pour la voie
 * 2, déclenche le gong. Aucun commutateur ne l'active au pupitre.
 */
export const annonce =
  (which: 'annv1' | 'annv2'): Situation =>
  (s) => {
    s[which] = true;
    return s;
  };

/** Arme puis actionne un annulateur de transit. */
export const atr =
  (n: 1 | 2 | 3): Situation =>
  (s) =>
    annulAtr(armAtr(s, n), n, T);

/**
 * Place des aiguilles dans la position contraire à leur position de repos.
 *
 * Sans quoi la moitié des essais ne demanderaient aucune manœuvre : au repos
 * les aiguilles 81a, 81b et 82 sont déjà à droite, les 83a, 83b, 85a et 85b à
 * gauche. Une garde ne se voit que si le groupe doit effectivement bouger.
 */
export const contraire =
  (...as: AigId[]): Situation =>
  (s) => {
    for (const a of as) {
      const o = s.cag[a] === 'g' ? 'd' : 'g';
      s.cag[a] = o;
      s.lev[a] = o;
      s.aig[a] = o;
    }
    return s;
  };

/**
 * Le groupe de l'aiguille observée a-t-il été manœuvré par cet itinéraire ?
 *
 * On regarde la **commande** (`cag`) et non le contrôle : c'est elle que
 * `ffX()` pose, et elle bouge même quand le contrôle se perd.
 */
export function manoeuvre(situation: Situation, route: RouteId, aig: AigId): boolean {
  const s = depuisRepos(situation);
  const avant = s.cag[aig];
  return pressRoute(s, route, T + 5_000).cag[aig] !== avant;
}
