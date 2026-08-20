// Répliques des conducteurs — portage de `dial()`, `dialv()`, `dialj()`,
// `dialok()` et `dialokz()` de `gaestro.js`.
//
// Le simulateur d'origine ne récite pas ses messages : il en **compose** une
// bonne partie. Un conducteur qui appelle le poste tire au sort sa formule
// d'attaque (huit ouvertures, dont deux qui changent selon l'heure), la façon
// dont il annonce son arrêt (sept suites), sa formule de politesse (quatre) et
// son collationnement (quatre). Cela fait plusieurs centaines de phrases
// possibles pour une seule situation, et c'est ce qui donne au poste son
// impression de vie radio.
//
// **Un tirage reproductible plutôt qu'aléatoire.** L'original appelle
// `Math.round(Math.random()*7)` à chaque réplique. Ici le tirage dérive du
// numéro du train et d'une clé de réplique : la variété est la même d'un train
// à l'autre et d'une réplique à l'autre, mais une même situation redonne
// toujours la même phrase. Sans quoi le moteur cesserait d'être une fonction
// de son état, et les essais de conformité deviendraient instables.

import type { SignalId } from './topology';

/**
 * Tirage reproductible dans `[0, modulo[` — FNV-1a sur la graine.
 *
 * La graine porte le numéro du train et la nature de la réplique, si bien que
 * deux trains dans la même situation ne s'expriment pas pareil, et qu'un même
 * train ne dit pas la même chose au C 81 et au Cv 85.
 */
export function tirage(graine: string, modulo: number): number {
  let h = 2166136261;
  for (let i = 0; i < graine.length; i += 1) {
    h ^= graine.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Brassage final : sans lui, des graines voisines — deux numéros de train
  // consécutifs — retombent sur la même réplique, et le poste se met à
  // bégayer.
  h ^= h >>> 16;
  h = Math.imul(h, 0x21f0aaad);
  h ^= h >>> 15;
  h = Math.imul(h, 0x735a2d97);
  h ^= h >>> 15;
  return (h >>> 0) % modulo;
}

/**
 * Ouvertures d'appel (`dphra`).
 *
 * Les deux premières saluent, et la salutation dépend de l'heure. La dernière
 * — « Mécanicien du » — n'existe que pour les carrés : `dial()` tire sur huit
 * entrées, `dialv()` sur sept.
 */
const OUVERTURES: (string | { jour: string; soir: string })[] = [
  { jour: 'Salut, le conducteur du', soir: 'Bonsoir, le conducteur du' },
  { jour: 'Bonjour, conducteur du', soir: 'Bonsoir, conducteur du' },
  'Conducteur du',
  'Le train n°',
  'Conducteur du train',
  'Le',
  'Salut, le',
  'Mécanicien du',
];

/**
 * Suites d'appel (`fphra`), une nomenclature par nature de signal.
 *
 * L'entrée d'indice 1 est particulière : elle salue à son tour, mais seulement
 * si l'ouverture ne l'a pas déjà fait — le conducteur ne dit pas bonjour deux
 * fois.
 */
const SUITES = {
  carre: [
    'appelle Springfield, je suis arrêté au pied du C',
    { neutre: 'pour le PRS de Springfield, je suis arrêté au C', salut: 'pour le PRS de Springfield %S, je suis arrêté au C' },
    'pour Springfield, je suis arrêté au Carré',
    'appelle le PRS, je suis arrêté devant le Carré',
    'au carré',
    'arrêté devant le C',
    'au pied du Carré',
  ],
  violet: [
    'appelle Springfield, je suis arrêté au pied du Cv',
    { neutre: 'pour le PRS de Springfield, je suis arrêté au Cv', salut: 'pour le PRS de Springfield %S, je suis arrêté au Cv' },
    'pour Springfield, je suis devant le Carré violet',
    'appelle le PRS, je suis arrêté devant le Carré violet',
    'au carré violet',
    'arrêté devant le Carré violet',
    'au pied du Carré violet',
  ],
} as const;

/** Formules de politesse finales (`dialj()`, `phraj`). */
const SALUTATIONS = ['%JOURNEE', 'bon courage', 'bonne continuation', ''];

/** Collationnements (`dialokz()`, `phraokz`). */
const COLLATIONNEMENTS = ['compris', 'bien reçu', 'entendu', 'bien compris'];

/** Nature du signal : le carré violet a sa propre nomenclature. */
const VIOLET: Partial<Record<SignalId, true>> = { cv83: true, cv85: true, cv88: true };

/** Numéro du signal tel que le conducteur l'énonce. */
const NUMERO: Record<SignalId, string> = {
  c81: '81',
  c82: '82',
  c84: '84',
  cv83: '83',
  cv85: '85',
  cv88: '88',
};

/**
 * Le conducteur salue-t-il le jour ou le soir ?
 *
 * `dial()` bascule à 18 h, `dialv()` à 19 h — une incohérence du source qu'on
 * reprend telle quelle. Hors scénario l'original laisse `hh` **indéfini**, si
 * bien que la comparaison est fausse et que le poste répond toujours « bonsoir » ;
 * ici l'heure du poste sert de repère, ce qui est plus juste.
 */
const estLeSoir = (heure: number, bascule: number) => heure >= bascule;

/** Formule de journée de `dialj()`, calée sur l'heure. */
function formuleDeJournee(heure: number): string {
  if (heure < 9) return 'bonne matinée';
  if (heure < 12) return 'bonne journée';
  if (heure < 13) return 'bon appétit';
  if (heure < 16) return 'bon après-midi';
  return 'bonne soirée';
}

/**
 * Appel d'un conducteur arrêté devant un signal — `dial()` pour un carré,
 * `dialv()` pour un carré violet, suivis de la phrase du signal.
 *
 * Rend la réplique **entière** : elle commence par l'ouverture, pas par un
 * préfixe ajouté après coup.
 */
export function appelSignal(opts: {
  num: number;
  signal: SignalId;
  /** `eteint` ajoute la mention de l'œilleton, propre aux carrés. */
  motif: 'ferme' | 'eteint';
  heure: number;
  /** Distingue deux répliques d'un même train. */
  cle: string;
}): string {
  const violet = VIOLET[opts.signal] === true;
  const graine = `${opts.num}-${opts.signal}-${opts.cle}`;
  // `dial()` tire sur huit ouvertures, `dialv()` sur sept.
  const iOuv = tirage(graine + '-o', violet ? 7 : 8);
  const iSuite = tirage(graine + '-s', 7);
  const soir = estLeSoir(opts.heure, violet ? 19 : 18);

  const ouv = OUVERTURES[iOuv];
  const ouverture = typeof ouv === 'string' ? ouv : soir ? ouv.soir : ouv.jour;

  const brute = SUITES[violet ? 'violet' : 'carre'][iSuite];
  const suite =
    typeof brute === 'string'
      ? brute
      : // Le conducteur ne salue pas deux fois : si l'ouverture l'a déjà fait,
        // la suite reste neutre.
        iOuv <= 1
        ? brute.neutre
        : brute.salut.replace('%S', soir ? 'bonsoir' : 'bonjour');

  const fin =
    opts.motif === 'eteint'
      ? violet
        ? 'éteint'
        : 'éteint ainsi que son œilleton'
      : 'fermé';

  return `${ouverture} ${opts.num} ${suite} ${NUMERO[opts.signal]} ${fin}, à toi !`;
}

/** Les trois annonces de départ de la voie centrale attestées au source. */
const DEPARTS = [
  'prêt au départ de la voie centrale, à toi !',
  'au C 84 fermé, je suis prêt au départ, à toi !',
  'au C 84 fermé, je suis prêt au départ de la voie centrale, à toi !',
];

/** Appel du conducteur prêt à quitter la voie centrale — `tctrois()`. */
export function appelDepartVoieCentrale(num: number, heure: number, cle: string): string {
  const graine = `${num}-depart-${cle}`;
  const ouv = OUVERTURES[tirage(graine + '-o', 8)];
  const ouverture = typeof ouv === 'string' ? ouv : estLeSoir(heure, 18) ? ouv.soir : ouv.jour;
  return `${ouverture} ${num} ${DEPARTS[tirage(graine + '-d', DEPARTS.length)]}`;
}

/** Collationnement du conducteur (`phraokz`) : « compris », « bien reçu »… */
export function collationnement(graine: string): string {
  return COLLATIONNEMENTS[tirage(graine, COLLATIONNEMENTS.length)];
}

/**
 * Formule de politesse finale (`phraj`), vide une fois sur quatre — le
 * conducteur ne prend pas toujours la peine.
 */
export function salutation(graine: string, heure: number): string {
  const s = SALUTATIONS[tirage(graine, SALUTATIONS.length)];
  return s === '%JOURNEE' ? formuleDeJournee(heure) : s;
}
