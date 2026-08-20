// Moteur de trafic du PRS de Springfield — « trafic souple ».
//
// Portage des chaînes de `setTimeout` de `PRS/construc/gaestro.js` (§9.3 de
// `docs/springfield-prs-spec.md`) en machine à états pilotée par le tick de
// `engine.tick()`.
//
// L'original enchaîne une fonction par étape (`tun` → `tunbis` → `tdeux` → …),
// chacune se replanifiant elle-même quand le train est immobilisé. On garde
// **exactement** ce découpage : une étape ici = une fonction là-bas, même nom,
// mêmes temporisations, mêmes conditions. Ce qui change est seulement la
// mécanique de planification (une échéance dans l'état, au lieu d'un timer).
//
// Les trois leviers pédagogiques du trafic sont préservés :
//   1. la **temporisation dépend de l'état du signal** — un train ralentit
//      devant un carré fermé (12 s / 18 s) ;
//   2. le train **s'arrête et parle** quand il ne peut pas avancer (carré
//      fermé, aiguille contraire) ;
//   3. le passage du train **détruit l'itinéraire** (ou reforme le T.P.) —
//      c'est là que `pedNN` entre en jeu.
//
// Les quatre fils du poste sont portés : voie 1 depuis AG (A), voie 2 depuis
// N2 (B), voie centrale (C) et voie mère (M).

import { ROUTE_BY_ID } from './topology';
import type { AigId, AigPos, SignalId } from './topology';
import {
  destroyRoute,
  formRoute,
  logAppel,
  logEvent,
  logIncident,
  refreshState,
  SAAT_CELLS,
  saatLibere,
  saatPose,
} from './engine';
import type { PrsState, SaatCell } from './engine';
import { simSeconds } from './scenarios';
import type { TrainCounter } from './scenarios';
import {
  appelDepartVoieCentrale,
  appelSignal,
  collationnement,
  salutation,
} from './dialogue';

// ===== Modèle ================================================================

/**
 * Fil de circulation, une origine chacun :
 * `A` voie 1 depuis AG, `B` voie 2 depuis N2, `C` voie centrale (voie NU),
 * `M` voie mère.
 */
export type ThreadId = 'A' | 'B' | 'C' | 'M';

/**
 * Branche de parcours. Chaque fil a une **tête** — l'approche jusqu'à son
 * signal — puis bascule sur la **sortie** que les aiguilles lui donnent.
 *
 *   `a`    AG → N1              `ac`  AG → voie NU
 *   `b`    N2 → DG
 *   `c`    tête voie centrale   `c1`  NU → DG voie 1   (`tca*`)
 *                                `c2`  NU → DG voie 2   (`tcb*`)
 *                                `cvm` NU → voie mère   (`tcm*`)
 *   `m`    tête voie mère       `m1`  AM → voie 1      (`tma*`)
 *                                `mnu` AM → voie NU     (`tmc*`)
 */
export type BranchId = 'a' | 'ac' | 'b' | 'c' | 'c1' | 'c2' | 'cvm' | 'm' | 'm1' | 'mnu';

/**
 * Destination prévue au graphique de circulation.
 *
 * L'original a trois entrées pour la voie centrale — `traficc()` engage le
 * train « où qu'on l'envoie », `traficcb()` un train **pour DG** et
 * `traficcm()` un train **pour la voie mère** — et deux pour la voie mère.
 * Un train qui connaît sa destination refuse l'itinéraire qui ne va pas là :
 * « tu t'es trompé, je vais sur Capital-city ».
 */
export type Dest = 'dg' | 'vm' | 'v1' | 'nu' | null;

export interface Train {
  /** Clé interne stable (rendu React, journal). */
  key: number;
  thread: ThreadId;
  branch: BranchId;
  /** Compteur de circulation dont ce train est issu (`trainv1a`, `trainv2`…). */
  counter: TrainCounter;
  /** Index de l'étape courante dans la branche. */
  step: number;
  /** Numéro de circulation. */
  num: number;
  /** Échéance de la prochaine étape. */
  dueAt: number;
  /**
   * Le train est immobilisé et attend que la voie se libère. Sert à afficher
   * l'état et à n'émettre le message du conducteur qu'une fois.
   */
  stopped: boolean;
  /**
   * Carré **ouvert** au moment du franchissement (`memv1` / `memv2`).
   *
   * `attvi()` : `if (c81==0){memv1=1;} else{memv1=0;}`. Un train qui franchit
   * sur ordre, en marche à vue (`auto81`), engage donc avec `memv = 0` : il
   * s'arrêtera au pied d'une aiguille contraire au lieu de la talonner. À la
   * vitesse du signal ouvert, il ne le peut pas.
   */
  cleared: boolean;
  /** Le train roulait quand le carré s'est refermé (`messa == 3`). */
  running: boolean;
  /**
   * Le train a **franchi un carré fermé** (`fric81`). Tant que ce drapeau
   * tient, un ordre verbal ne suffit plus à le relever : il faut un Cba.
   * L'original l'efface au pied de l'aiguille 85b (`taquatre()`).
   */
  overran: boolean;
  /** Carré vu ouvert à l'annonce (`vuva` / `vuvb`), pour le message d'approche. */
  sawOpen: boolean;
  /**
   * Le conducteur est disposé à repartir (`aamarche` / `bbmarche`). Un ordre
   * « ne pas se remettre en marche » le met à `false` ; « vous pouvez vous
   * remettre en marche » le remet à `true`.
   */
  marche: boolean;
  /** Aiguille que le train franchit au pas (`trainapas` / `trainbpas`). */
  auPas: AigId | null;
  /** Destination prévue, `null` si le train prend ce qu'on lui donne. */
  dest: Dest;
  /**
   * Le conducteur a déjà signalé qu'on l'envoyait au mauvais endroit
   * (`eritivc` / `eritivm`) : il ne le redira pas, et il confirmera la
   * fermeture du signal au lieu de la constater.
   */
  wrongWay: boolean;
  /**
   * Le conducteur a collationné un ordre « vous pouvez vous remettre en
   * marche » qui n'a pas encore été consommé — `com == 1000` / `auto82`.
   */
  restartOrder: boolean;
  /**
   * Un bulletin Cba autorise ce train à franchir son carré fermé
   * (`auto81` / `auto82`). Effacé au pied de la première aiguille.
   */
  auto: boolean;
  /** Idem pour le **Cv 88** du parcours NU-AM (`auto88`), qui a son propre bulletin. */
  auto88: boolean;
  /** Point kilométrique de la tête du train (`kmttv1` / `kmttv2`). */
  km: string;
  /** Messages déjà émis (`aamessN` / `bbmessN`), pour ne pas les répéter. */
  said: Record<string, true>;
}

/** Résultat d'une étape : quand et où reprendre. */
interface StepResult {
  /** Délai avant la prochaine exécution, en ms. */
  delay: number;
  /**
   * Étape suivante. Par défaut l'étape suivante de la branche courante.
   * `'stay'` réexécute la même étape (train immobilisé), un nombre saute à
   * un index, un objet change de branche.
   */
  to?: number | 'stay' | { branch: BranchId; step?: number };
  /** Le train quitte la simulation ; un nouveau est engagé sur le fil. */
  done?: boolean;
}

interface Step {
  /** Nom de la fonction correspondante dans `gaestro.js`. */
  id: string;
  run: (s: PrsState, t: Train) => StepResult;
}

// ===== Utilitaires d'étape ===================================================

/** Le carré est-il ouvert ? (`cXX == 0` dans l'original). */
const open = (s: PrsState, sig: SignalId) => s.signals[sig] === 0;

/** Signal d'entrée de chaque fil, et ce qui s'y rattache. */
const SIG_OF_THREAD: Record<ThreadId, SignalId> = {
  A: 'c81',
  B: 'c82',
  C: 'c84',
  M: 'cv85',
};
const SIG_LABEL: Record<SignalId, string> = {
  c81: 'C 81',
  c82: 'C 82',
  c84: 'C 84',
  cv83: 'Cv 83',
  cv85: 'Cv 85',
  cv88: 'Cv 88',
};
/**
 * Case du graphique où le train attend son engagement — celle que l'étape
 * d'engagement vide. `comvi()` la teste pour refuser un ordre verbal.
 */
const ANNONCE_CELL: Record<ThreadId, SaatCell> = {
  A: 'v1ag',
  B: 'v2n2',
  C: 'nu',
  M: 'vm',
};

/** Message du conducteur, émis une seule fois par train (`aamessN`). */
function say(s: PrsState, t: Train, key: string, text: string): void {
  if (t.said[key]) return;
  t.said[key] = true;
  logAppel(s, t.num, text);
}

/** Le train s'arrête : message une fois, puis on réessaie. */
function halt(s: PrsState, t: Train, key: string, text: string, retry = 1000): StepResult {
  t.stopped = true;
  say(s, t, key, text);
  return { delay: retry, to: 'stay' };
}

/**
 * Heure du poste, telle que le conducteur la perçoit — le `hh` de l'original.
 *
 * En scénario c'est l'horloge simulée, que chaque `scaph*()` recale ; sinon
 * l'heure du poste. Elle décide des salutations : « bonjour » ou « bonsoir ».
 */
function heurePoste(s: PrsState, t: Train): number {
  if (s.scenario) {
    const sec = simSeconds(s.scenario.startSec, s.scenario.startedAt, t.dueAt);
    return Math.floor(sec / 3600) % 24;
  }
  return new Date(t.dueAt).getHours();
}

/**
 * Le train s'arrête sur une réplique **déjà complète** — celles que `dial()`
 * et `dialv()` composent, ouverture comprise : elles ne prennent pas le
 * préfixe « Conducteur du N — ».
 */
function haltAppel(s: PrsState, t: Train, cle: string, phrase: string, retry = 1000): StepResult {
  t.stopped = true;
  if (!t.said[cle]) {
    t.said[cle] = true;
    logAppel(s, t.num, phrase, true);
  }
  return { delay: retry, to: 'stay' };
}

/**
 * Appel du conducteur arrêté devant son signal, composé comme dans l'original.
 * `eteint` quand le dérangement en cours est l'extinction de ce signal.
 */
function appelArret(s: PrsState, t: Train, signal: SignalId, cle: string): string {
  const f = s.faults.signal;
  return appelSignal({
    num: t.num,
    signal,
    motif: f && f.id === signal && f.kind === 'ex' ? 'eteint' : 'ferme',
    heure: heurePoste(s, t),
    cle,
  });
}

/** Le train repart. */
function go(t: Train, delay: number, to?: StepResult['to']): StepResult {
  t.stopped = false;
  return { delay, to };
}

/**
 * Déraillement : dans l'original le simulateur se recharge (`location.reload()`).
 * On préserve l'état pour que l'aiguilleur voie ce qu'il a fait, mais on
 * arrête le trafic — il n'y a plus rien à simuler.
 */
function derail(s: PrsState, t: Train, aig: AigId): StepResult {
  // `dsoalert()` : la sirène retentit. C'est le même son que l'alerte radio,
  // et c'est son usage le plus fréquent dans l'original — 94 appels, presque
  // tous sur déraillement.
  s.sfx.derail += 1;
  logIncident(s, t.num, `Le ${t.num} a déraillé sur l'aiguille ${aig.replace('aig', '')} — trafic interrompu.`);
  s.traffic = false;
  return { delay: 0, done: true };
}

/**
 * Talonnage : le train a **déjà franchi le signal** (`memvN == 1`) et se
 * présente sur une aiguille qui n'est pas dans sa position — il la prend par
 * le talon. Le simulateur d'origine se recharge lui aussi, mais **sans
 * sirène** : le `dsoalert()` du déraillement n'y est pas.
 *
 * Ce n'est pas un déraillement, et la distinction compte pour l'exercice :
 * l'aiguille talonnée est forcée par le matériel, elle n'a pas bougé sous le
 * train.
 */
function talon(s: PrsState, t: Train, aig: AigId): StepResult {
  logIncident(s, t.num, `Le ${t.num} a talonné l'aiguille ${aig.replace('aig', '')} — trafic interrompu.`);
  s.traffic = false;
  return { delay: 0, done: true };
}

/**
 * Occupation des zones du faisceau 81 sous le train, selon la position
 * **commandée** des aiguilles — repris tel quel des `t*quatren()` :
 * `z81b=2; if (cag81a=="d"){z81a=2;} if (cag81a=="g"){z81d=2;} …`
 */
function setFaisceau81(s: PrsState, v: 0 | 1 | 2): void {
  s.zones.z81b = v;
  if (s.cag.aig81a === 'd') s.zones.z81a = v;
  if (s.cag.aig81a === 'g') s.zones.z81d = v;
  if (s.cag.aig83a === 'g') s.zones.z81c = v;
}

/** Idem côté voie 2 (`tbsix()` / `attvz()`). */
function setFaisceau82(s: PrsState, v: 0 | 1 | 2): void {
  s.zones.z82a = v;
  if (s.cag.aig81b === 'g') {
    s.zones.z82d = v;
  } else {
    s.zones.z82b = v;
    if (s.cag.aig82 === 'g') s.zones.z82e = v;
    else s.zones.z82c = v;
  }
}

/** Un itinéraire est-il établi *ou* encore commandé au bouton ? */
const heldOrCommanded = (s: PrsState, ids: readonly string[]) =>
  ids.some((id) => s.established[id as never] || s.b[id as never] === 1);

/** Position réelle d'une aiguille au terrain (`levNN`). */
const lev = (s: PrsState, id: AigId): AigPos => s.lev[id];

/** Destruction déclenchée par le passage du train : la pédale force la garde. */
function destroyByPedal(s: PrsState, id: string, now: number, reason: string): void {
  destroyRoute(s, ROUTE_BY_ID[id as never], now, reason, true);
}


/**
 * Collationnement d'un ordre par son destinataire — `comvi()` / `comvz()`.
 * Appelé avant chaque étape, comme l'original le fait à chaque `t*`.
 * L'ordre est **consommé** (`com = 0`) dès que le conducteur a répondu.
 */
function readOrdre(s: PrsState, t: Train): void {
  const o = s.ordre;
  if (o.com < 1 || o.train !== t.num) return;
  const sig = SIG_OF_THREAD[t.thread];
  const label = SIG_LABEL[sig];
  const wantsGo = o.com === 1000 || o.com === 1100;
  const say2 = (text: string) => logAppel(s, t.num, text);
  // `dialokz()` : « c'est compris », « c'est bien reçu »… Le tirage suit le
  // numéro de l'ordre, si bien que deux ordres au même train ne reçoivent pas
  // le même accusé.
  const ok = collationnement(`${t.num}-ordre-${o.no}`);

  // `comvz()` : pendant un arrêt accidentel, le conducteur refuse de repartir
  // tant qu'une aiguille de son parcours est disposée à contre-sens.
  if (wantsGo && s.accidentalStop === 2 && t.thread === 'B') {
    if (lev(s, 'aig82') === 'g') {
      say2(`c'est ${ok}, mais tu veux bien redresser l'aiguille 82 avant ?`);
      s.ordre = { ...o, com: 0 };
      return;
    }
    if (lev(s, 'aig81b') === 'g') {
      say2(`c'est ${ok}, mais tu veux bien redresser l'aiguille 81b avant ?`);
      s.ordre = { ...o, com: 0 };
      return;
    }
  }

  // Après franchissement d'un carré fermé, il faut un bulletin Cba (`fric81`).
  if (wantsGo && t.overran) {
    say2('je ne me remettrai pas en marche sans un bulletin Cba.');
    s.ordre = { ...o, com: 0 };
    return;
  }
  // Refus : un ordre verbal ne relève pas un train arrêté devant un carré fermé.
  // `comvi()` : `(c81==1)&&(document.saat.case1.value==trainv1)` — le numéro
  // encore dans la case d'annonce signifie que le train n'est pas engagé.
  const annonce = s.saat[ANNONCE_CELL[t.thread]] === String(t.num);
  if (wantsGo && !open(s, sig) && annonce && s.accidentalStop === 0) {
    say2(
      `je veux bien me remettre en marche mais je suis au ${label} fermé, il faudra plus qu'un ordre verbal.`,
    );
    s.ordre = { ...o, com: 0 };
    return;
  }

  const parts: string[] = [];
  if (o.com === 1 || o.com === 11) {
    parts.push('je te donne l’assurance que je ne me remettrai pas en marche de moi-même');
    t.marche = false;
  }
  if (o.com === 10 || o.com === 11) {
    parts.push(`la tête de mon train se situe au Km ${t.km || '—'}`);
  }
  if (o.com === 1000 || o.com === 1100) {
    parts.push('je me remets en marche');
    t.marche = true;
    t.restartOrder = true;
  }
  if (o.com === 100 || o.com === 1100) {
    parts.push(`je franchis l'aiguille ${(o.aigpas ?? '').replace('aig', '')} au pas`);
    t.auPas = o.aigpas;
  }
  if (parts.length === 0) {
    // L'original ne traite que les six combinaisons de la table ; les autres
    // masques restent sans réponse et l'ordre se périme.
    s.ordre = { ...o, com: 0 };
    return;
  }
  // `comvi()` : les trois masques qui commencent par un accusé de réception
  // — franchir au pas, se remettre en marche, les deux — et, pour ceux qui
  // portent la marche au pas, la formule de politesse finale.
  const accuse = o.com === 100 || o.com === 1000 || o.com === 1100;
  const poli = o.com === 100 || o.com === 1100;
  const fin = poli ? salutation(`${t.num}-ordre-${o.no}`, heurePoste(s, t)) : '';
  say2(
    (accuse ? `c'est ${ok} ` : '') +
      parts.join(', ') +
      (fin ? `, ${fin}` : '') +
      ', terminé.',
  );
  s.ordre = { ...o, com: 0, aigpas: o.com === 100 || o.com === 1100 ? o.aigpas : null };
}

/**
 * Prise en compte d'un bulletin Cba par le train arrêté devant son carré —
 * bloc `if (bcba==1)` de `ttrois()` / `tbtrois()`. Le bulletin est consommé
 * dans tous les cas : correct, il autorise le franchissement ; erroné, le
 * conducteur signale l'erreur.
 */
function readCba(s: PrsState, t: Train, signal: number): void {
  const c = s.cba;
  if (!c.pending || c.forCv88) return;
  const label = 'C ' + signal;

  if (c.signal === signal && c.train === t.num) {
    t.auto = true;
    t.overran = false;
    s.cba = { ...c, pending: false, no: c.no + 1 };
    const ok = collationnement(`${t.num}-cba-${c.no}`);
    const fin = salutation(`${t.num}-cba-${c.no}`, heurePoste(s, t));
    logEvent(
      s,
      'info',
      `Ordre est donné au conducteur du train n° ${c.train} de franchir fermé le signal ` +
        `${c.carre ? 'carré' : 'guidon d’arrêt'} ${signal}, et de marcher à vue jusqu'à la fin ` +
        `du canton qui suit ce signal, autorisation n° ${c.no}. Poste de Springfield, ${c.trans}. ` +
        `— C'est ${ok} Springfield${fin ? `, ${fin}` : ''}, terminé.`,
    );
    return;
  }
  if (c.train === t.num) {
    say(s, t, 'cba-signal', `tu t'es trompé dans le bulletin Cba, je suis arrêté au ${label}.`);
    s.cba = { ...c, pending: false };
    return;
  }
  // Le n° de train du bulletin ne correspond à aucune circulation en cours.
  if (c.signal === signal && !s.trains.some((x) => x.num === c.train)) {
    say(s, t, 'cba-train', `je suis le train n° ${t.num}, tu t'es trompé dans le bulletin Cba.`);
    s.cba = { ...c, pending: false };
  }
}

/**
 * Étape « au pied d'une aiguille » — le motif le plus répandu du moteur de
 * trafic, une quarantaine de fonctions bâties dessus.
 *
 *   l'aiguille est dans sa position  → le train avance (plus lentement s'il
 *                                      franchit au pas), et une aiguille déjà
 *                                      **sous** lui peut le faire dérailler ;
 *   elle ne l'est pas, train engagé  → **talonnage** (`memvN == 1`) ;
 *   elle ne l'est pas, sinon         → arrêt au pied, message une fois.
 *
 * `talonnable: false` pour les quelques étapes où le source n'a pas la
 * branche `memvN` : le train y attend indéfiniment.
 */
function auPied(o: {
  /** Aiguille observée et position qu'elle doit tenir. */
  aig: AigId;
  pos: AigPos;
  /** Aiguilles dont la marche au pas ralentit ce franchissement. */
  pas: readonly AigId[];
  delai: number;
  delaiAuPas: number;
  /** Point kilométrique de la tête du train à l'arrêt. */
  km: string;
  /** Clé et texte du message d'arrêt. */
  cle: string;
  message: string;
  /** Aiguille sous le train qui déraille si elle se dérobe en avançant. */
  sous?: { aig: AigId; pos: AigPos };
  talonnable?: boolean;
}): Step['run'] {
  return (s, t) => {
    km(t, o.km);
    if (lev(s, o.aig) !== o.pos) {
      if (t.cleared && o.talonnable !== false) return talon(s, t, o.aig);
      return halt(s, t, o.cle, o.message);
    }
    if (!t.marche) return { delay: 1000, to: 'stay' };
    if (o.sous && lev(s, o.sous.aig) !== o.sous.pos) return derail(s, t, o.sous.aig);
    return go(t, auPasParmi(t, o.pas) ? o.delaiAuPas : o.delai);
  };
}

/**
 * Étape « train engagé **sur** l'aiguille » — `taquatreat()`,
 * `tacquatreat()`, `tbsixat()`.
 *
 * Le train est à cheval sur l'appareil : si celui-ci se dérobe, il déraille.
 * Et il ne s'immobilise là que si rien ne le presse. Le source lie les deux
 * conditions dans la même garde —
 * `if ((lev85b=="g")&&(aamarche==1)) {…} else {dérailler}` — si bien qu'un
 * conducteur qui franchit **au pas** sur ordre et à qui l'on demande ensuite
 * de s'arrêter déraille lui aussi : on n'arrête pas un train à cheval sur une
 * aiguille. Hors marche au pas, en revanche, l'ordre est respecté et le train
 * attend.
 */
function surLAiguille(o: {
  aig: AigId;
  pos: AigPos;
  /** Aiguilles dont la marche au pas ralentit ce franchissement. */
  pas: readonly AigId[];
  delai: number;
  delaiAuPas: number;
}): Step['run'] {
  return (s, t) => {
    const enPlace = lev(s, o.aig) === o.pos;
    if (auPasParmi(t, o.pas)) {
      // Au pas, la garde est unique : mauvaise position **ou** ordre d'arrêt.
      if (!enPlace || !t.marche) return derail(s, t, o.aig);
      return go(t, o.delaiAuPas);
    }
    if (!enPlace) return derail(s, t, o.aig);
    if (!t.marche) return { delay: 1_000, to: 'stay' };
    return go(t, o.delai);
  };
}

/** Le train traverse-t-il la zone au pas ? (`trainapas` dans une liste d'aiguilles) */
const auPasParmi = (t: Train, ids: readonly AigId[]) =>
  t.auPas != null && ids.includes(t.auPas);

/**
 * Nez-à-nez : le train est envoyé sur une voie déjà occupée et n'a plus la
 * distance pour s'arrêter — `tacsix()`, `tmcsix()`, `tcmseptn()` :
 * `if (trpresvc==1){dsoalert(); alert("tu m'a envoyé sur une voie occupée…")}`.
 */
function nezANez(s: PrsState, t: Train): StepResult {
  s.sfx.derail += 1;
  logIncident(
    s,
    t.num,
    `Le ${t.num} a été envoyé sur une voie occupée et ne peut plus s'arrêter — trafic interrompu.`,
  );
  s.traffic = false;
  return { delay: 0, done: true };
}

/**
 * Bulletin Cba portant sur le **Cv 88** — `bcba88` dans `tcmsixb()`.
 *
 * C'est le seul signal du poste qui se franchit sur un bulletin distinct de
 * celui du carré d'entrée : le train de la voie centrale en reçoit un pour le
 * C 84, et un autre pour le Cv 88 qui suit.
 */
function readCba88(s: PrsState, t: Train): void {
  const c = s.cba;
  if (!c.pending || !c.forCv88) return;
  s.cba = { ...c, pending: false, no: c.no + 1 };
  t.auto88 = true;
  const ok = collationnement(`${t.num}-cba88-${c.no}`);
  logEvent(
    s,
    'info',
    `Ordre est donné au conducteur du train n° ${c.train} de franchir fermé le signal ` +
      `carré violet 88, et de marcher à vue jusqu'à la fin du canton qui suit ce signal, ` +
      `autorisation n° ${c.no}. Poste de Springfield, ${c.trans}. ` +
      `— C'est ${ok} Springfield, terminé.`,
  );
}

/** Marque le point kilométrique de la tête du train (`kmttvX`). */
function km(t: Train, value: string): void {
  t.km = value;
}

// ===== Fil A — voie 1 depuis AG =============================================
//
// Tronc commun jusqu'au carré 81, puis deux destinations selon la position
// commandée de l'aiguille 83a : voie 1 (branche `a`) ou voie NU (branche `ac`).

const BRANCH_A: Step[] = [
  {
    // `tun()` — le train est annoncé au graphique de circulation.
    id: 'tun',
    run: (s, t) => {
      logEvent(s, 'info', `Train ${t.num} en approche de Springfield par AG.`);
      // `tun()` : `document.saat.case1.value = trainv1`.
      saatPose(s, t.num, 'v1ag');
      return go(t, open(s, 'c81') ? 12_000 : 18_000);
    },
  },
  {
    // `tunbis()` — annonce voie 1.
    id: 'tunbis',
    run: (s, t) => {
      s.annv1 = true;
      t.sawOpen = open(s, 'c81');
      return go(t, open(s, 'c81') ? 10_000 : 16_000);
    },
  },
  {
    // `tdeux()` — occupation de la zone d'approche z79. `messa = 3` mémorise
    // que le train roulait : s'il trouve le carré fermé à l'étape suivante,
    // il ne pourra plus s'arrêter.
    id: 'tdeux',
    run: (s, t) => {
      s.zones.z79 = 2;
      km(t, '13,150');
      // `taboucle()` : le conducteur signale la fermeture vue de loin.
      if (t.sawOpen && !open(s, 'c81') && s.zones.z81bis !== 2) {
        say(s, t, 'ferme-loin', 'je viens de constater la fermeture du C 81, je serai en mesure de m’arrêter devant.');
      }
      const running = open(s, 'c81') && !s.bs81;
      t.running = running;
      return go(t, running ? 11_000 : 18_000);
    },
  },
  {
    // `ttrois()` — le point de décision au carré 81.
    id: 'ttrois',
    run: (s, t) => {
      if (!open(s, 'c81') && t.running) {
        // Franchissement de carré fermé : le train était lancé.
        s.annv1 = false;
        s.zones.z79 = 0;
        s.zones.z81 = 2;
        if (s.cag.aig85b === 'g') s.zones.z81bis = 2;
        t.running = false;
        t.overran = true;
        km(t, '13,275');
        // `dsodeto()` : le détonateur claque sous le train.
        s.sfx.deto += 1;
        logIncident(s, t.num, `Le ${t.num} a FRANCHI le C 81 fermé — détonateur.`);
        // `messa = 1` : le conducteur a parlé, il ne redira pas qu'il est
        // arrêté au carré. Il attend maintenant un ordre pour repartir.
        t.said['arret-c81'] = true;
        return halt(s, t, 'franchi', 'je viens de franchir le C 81 fermé, je suis arrêté.', 1000);
      }
      readCba(s, t, 81);
      if (!open(s, 'c81') && !t.auto) {
        return haltAppel(s, t, 'arret-c81', appelArret(s, t, 'c81', 'arret'));
      }
      const clear = s.established.agnu ? s.zones.z83b !== 2 : s.zones.z85 !== 2;
      return go(t, clear ? 2_000 : 4_000);
    },
  },
  {
    // `attvi()` — le train s'engage, si la destination est dégagée.
    id: 'attvi',
    run: (s, t) => {
      if (!open(s, 'c81') && !t.auto) {
        say(s, t, 'referme', 'le C 81 vient de se refermer, je suis arrêté devant.');
        t.stopped = true;
        return { delay: 1_000, to: 3 };
      }
      t.cleared = open(s, 'c81');
      const toNu = s.cag.aig83a === 'd';
      if (!toNu && (s.zones.z85 === 2 || s.zones.z87 === 2 || s.zones.z81b === 2)) {
        t.stopped = true;
        return { delay: 2_000, to: 'stay' };
      }
      s.annv1 = false;
      // `attvi()` : le numéro passe de la case d'annonce à celle du parcours.
      saatPose(s, t.num, toNu ? 'nu' : 'v1n1');
      s.zones.z81 = 2;
      if (s.cag.aig85b === 'g') s.zones.z81bis = 2;
      return go(t, 7_000, toNu ? { branch: 'ac' } : undefined);
    },
  },
  {
    // `taquatre()` — au pied de l'aiguille 85b.
    id: 'taquatre',
    run: (s, t) => {
      km(t, '13,310');
      t.overran = false; // `fric81 = 0` en tête de `taquatre()`
      t.auto = false; // `auto81 = 0`
      if (lev(s, 'aig85b') !== 'g') {
        if (t.cleared) return talon(s, t, 'aig85b');
        return halt(s, t, 'a85b', 'je suis arrêté au pied de l’aiguille 85b disposée à droite.');
      }
      // Ordre « ne pas se remettre en marche » : le train patiente.
      if (!t.marche) return { delay: 1000, to: 'stay' };
      return go(t, auPasParmi(t, ['aig81a', 'aig85b', 'aig83a']) ? 12_000 : 3_000);
    },
  },
  {
    // `taquatrep()` — libération de la zone d'approche (le T.P. la reforme).
    id: 'taquatrep',
    run: (s, t) => {
      if (s.faults.zone !== 'z79') s.zones.z79 = s.established.agnitp ? 1 : 0;
      if (s.dmt && s.dmt.route === 'agnida') s.dmt = null;
      return go(t, 1_000);
    },
  },
  {
    // `taquatreat()` — le train est sur l'aiguille.
    id: 'taquatreat',
    run: surLAiguille({
      aig: 'aig85b',
      pos: 'g',
      pas: ['aig81a', 'aig85b', 'aig83a'],
      delai: 1_000,
      delaiAuPas: 8_000,
    }),
  },
  {
    // `taquatren()` — occupation du faisceau 81.
    id: 'taquatren',
    run: (s, t) => {
      setFaisceau81(s, 2);
      return go(t, 6_000);
    },
  },
  {
    // `tacinqat()` — au pied de l'aiguille 81a.
    id: 'tacinqat',
    run: (s, t) => {
      km(t, '13,540');
      if (lev(s, 'aig81a') !== 'd') {
        if (t.cleared) return talon(s, t, 'aig81a');
        return halt(s, t, 'a81a', 'je suis arrêté au pied de l’aiguille 81a disposée à gauche.');
      }
      // Ordre « ne pas se remettre en marche » : le train patiente.
      if (!t.marche) return { delay: 1000, to: 'stay' };
      return go(t, auPasParmi(t, ['aig81a', 'aig85b', 'aig83a']) ? 12_000 : 5_000);
    },
  },
  {
    // `tacinqatn()` — la queue du train dégage z81 : **destruction automatique**
    // de AG-N1, ou **reformation** du tracé permanent.
    id: 'tacinqatn',
    run: (s, t) => {
      if (lev(s, 'aig81a') === 'g') return derail(s, t, 'aig81a');
      if (s.faults.zone === 'z81a') return go(t, 6_000);

      const fr = s.faults.route;
      const rateDestruction = fr?.kind === 'destruction' && fr.id === 'agnida';

      if (s.established.agnitp) {
        // Le T.P. se reforme derrière le train.
        s.zones.z81 = 1;
        if (s.cag.aig85b === 'g') s.zones.z81bis = 1;
        formRoute(s, ROUTE_BY_ID.agnitp);
      } else if (s.established.agnida) {
        if (rateDestruction && s.b.agnida === 1) {
          // Raté de destruction automatique : l'itinéraire reste tracé.
          s.zones.z81 = 1;
          if (s.cag.aig85b === 'g') s.zones.z81bis = 1;
          logEvent(s, 'error', 'AG-N1 — raté de destruction automatique au passage du train.');
        } else {
          s.zones.z81 = 0;
          s.zones.z81bis = 0;
          destroyByPedal(s, 'agnida', t.dueAt, `AG-N1 détruit au passage du ${t.num}.`);
        }
      } else {
        s.zones.z81 = 0;
        s.zones.z81bis = 0;
      }
      return go(t, 6_000);
    },
  },
  {
    // `tacinqp()` — au pied de l'aiguille 83a, en direction de la voie 1.
    id: 'tacinqp',
    run: (s, t) => {
      km(t, '13,840');
      if (lev(s, 'aig83a') !== 'g') {
        // Déraillement, pas talonnage : le source dit bien « dérailler » ici,
        // et allume z83b — le train part de travers vers la voie centrale.
        if (t.cleared) {
          s.zones.z83b = 2;
          return derail(s, t, 'aig83a');
        }
        return halt(s, t, 'a83a', 'je suis arrêté devant l’aiguille 83a disposée à droite.');
      }
      // Ordre « ne pas se remettre en marche » : le train patiente.
      if (!t.marche) return { delay: 1000, to: 'stay' };
      return go(t, auPasParmi(t, ['aig81a', 'aig85b', 'aig83a']) ? 12_000 : 5_000);
    },
  },
  {
    id: 'tacinq',
    run: (s, t) => {
      s.zones.z85 = 2;
      return go(t, 8_000);
    },
  },
  { id: 'tasixat', run: (_s, t) => go(t, 800) },
  {
    id: 'tasix',
    run: (s, t) => {
      s.zones.z87 = 2;
      return go(t, 2_000);
    },
  },
  {
    // `tasixbis()` — dégagement du faisceau 81 : le tracé revient si un
    // itinéraire le tient encore, sinon tout est libéré.
    id: 'tasixbis',
    run: (s, t) => {
      // `tasixbis()` : `dtrainv1 = trainv1` — la circulation a dégagé, la
      // phase de scénario qui l'attendait peut engager la suivante.
      s.dtrain.v1 = t.num;
      if (s.faults.zone === 'z81b') return go(t, 16_000); // zone en dérangement : reste occupée
      if (heldOrCommanded(s, ['agnitp', 'agnida', 'amni'])) {
        setFaisceau81(s, 1);
        if (s.established.agnida && s.b.agnida === 0) {
          destroyByPedal(s, 'agnida', t.dueAt, `AG-N1 détruit au dégagement du ${t.num}.`);
        }
        if (s.established.amni && s.b.amni === 0) {
          destroyByPedal(s, 'amni', t.dueAt, `AM-N1 détruit au dégagement du ${t.num}.`);
        }
      } else {
        setFaisceau81(s, 0);
        if (s.established.agnida) {
          destroyByPedal(s, 'agnida', t.dueAt, `AG-N1 détruit au dégagement du ${t.num}.`);
        }
      }
      return go(t, 19_000);
    },
  },
  {
    id: 'tasept',
    run: (s, t) => {
      s.zones.z85 = heldOrCommanded(s, ['agnitp', 'dgni', 'agnida', 'amni']) ? 1 : 0;
      // `tasept()` : `case3` se vide, le train a quitté le poste.
      saatLibere(s, t.num);
      return go(t, 7_000);
    },
  },
  {
    // `tahuit()` — le train est parti vers N1 ; le fil relance un nouveau train.
    id: 'tahuit',
    run: (s, t) => {
      s.zones.z87 = heldOrCommanded(s, ['agnitp', 'dgni', 'agnida', 'amni']) ? 1 : 0;
      logEvent(s, 'info', `Le ${t.num} a quitté Springfield vers N1.`);
      return { delay: 6_000, done: true };
    },
  },
];

// ===== Fil A, branche NU (`tacquatre` … `tacneuf`) ==========================

const BRANCH_AC: Step[] = [
  {
    id: 'tacquatre',
    run: (s, t) => {
      km(t, '13,325');
      t.overran = false; // `fric81 = 0` en tête de `tacquatre()`
      t.auto = false; // `auto81 = 0`
      if (lev(s, 'aig85b') !== 'g') {
        if (t.cleared) return talon(s, t, 'aig85b');
        return halt(s, t, 'a85b', 'je suis arrêté au pied de l’aiguille 85b disposée à droite.');
      }
      // Ordre « ne pas se remettre en marche » : le train patiente.
      if (!t.marche) return { delay: 1000, to: 'stay' };
      return go(t, auPasParmi(t, ['aig81a', 'aig85b', 'aig83a']) ? 12_000 : 3_000);
    },
  },
  {
    id: 'tacquatrep',
    run: (s, t) => {
      if (s.faults.zone !== 'z79') s.zones.z79 = 0;
      if (s.dmt && s.dmt.route === 'agnu') s.dmt = null;
      return go(t, s.established.nudgvz ? 2_000 : 1_000);
    },
  },
  {
    // `tacquatreat()` — le train est sur l'aiguille.
    id: 'tacquatreat',
    run: surLAiguille({
      aig: 'aig85b',
      pos: 'g',
      pas: ['aig81a', 'aig85b', 'aig83a'],
      delai: 1_000,
      delaiAuPas: 8_000,
    }),
  },
  {
    id: 'tacquatren',
    run: (s, t) => {
      setFaisceau81(s, 2);
      return go(t, 6_000);
    },
  },
  {
    id: 'taccinqat',
    run: (s, t) => {
      km(t, '13,550');
      if (lev(s, 'aig81a') !== 'd') {
        if (t.cleared) return talon(s, t, 'aig81a');
        return halt(s, t, 'a81a', 'je suis arrêté au pied de l’aiguille 81a disposée à gauche.');
      }
      // Ordre « ne pas se remettre en marche » : le train patiente.
      if (!t.marche) return { delay: 1000, to: 'stay' };
      return go(t, auPasParmi(t, ['aig81a', 'aig85b', 'aig83a']) ? 12_000 : 6_000);
    },
  },
  {
    // `taccinqatn()` — dégagement de z81 et destruction automatique de AG-NU.
    id: 'taccinqatn',
    run: (s, t) => {
      if (lev(s, 'aig81a') === 'g') return derail(s, t, 'aig81a');
      if (s.faults.zone === 'z81a') return go(t, 8_000);

      const fr = s.faults.route;
      if (fr?.kind === 'destruction' && fr.id === 'agnu' && s.b.agnu === 1) {
        s.zones.z81 = 1;
        if (s.cag.aig85b === 'g') s.zones.z81bis = 1;
        logEvent(s, 'error', 'AG-NU — raté de destruction automatique au passage du train.');
      } else {
        s.zones.z81 = 0;
        s.zones.z81bis = 0;
        if (s.established.agnu) {
          destroyByPedal(s, 'agnu', t.dueAt, `AG-NU détruit au passage du ${t.num}.`);
        }
      }
      return go(t, 6_000);
    },
  },
  {
    id: 'taccinqp',
    run: (s, t) => {
      km(t, '13,850');
      if (lev(s, 'aig83a') !== 'd') {
        if (t.cleared) return derail(s, t, 'aig83a');
        return halt(
          s,
          t,
          'a83a-nu',
          'je suis arrêté au pied de l’aiguille 83a disposée à gauche alors que je dois aller voie centrale.',
        );
      }
      // Ordre « ne pas se remettre en marche » : le train patiente.
      if (!t.marche) return { delay: 1000, to: 'stay' };
      return go(t, auPasParmi(t, ['aig81a', 'aig85b', 'aig83a']) ? 12_000 : 6_000);
    },
  },
  {
    id: 'taccinq',
    run: (s, t) => {
      if (lev(s, 'aig83a') === 'g') return derail(s, t, 'aig83a');
      s.zones.z83a = 2;
      s.zones.z83b = 2;
      return go(t, 5_000);
    },
  },
  {
    id: 'tacsixat',
    run: (s, t) => {
      km(t, '13,900');
      if (lev(s, 'aig83b') !== 'd') {
        if (t.cleared) return talon(s, t, 'aig83b');
        return halt(s, t, 'a83b', 'je suis arrêté au pied de l’aiguille 83b disposée à gauche.');
      }
      // Ordre « ne pas se remettre en marche » : le train patiente.
      if (!t.marche) return { delay: 1000, to: 'stay' };
      return go(t, auPasParmi(t, ['aig81a', 'aig83a', 'aig83b']) ? 12_000 : 5_000);
    },
  },
  {
    id: 'tacsix',
    run: (s, t) => {
      // `if (trpresvc==1){…"tu m'a envoyé sur une voie occupée…"}`
      if (s.trpresvc) return nezANez(s, t);
      s.zones.z84 = 2;
      return go(t, 2_000);
    },
  },
  {
    // `tacsixbis()` — dégagement du faisceau 81.
    id: 'tacsixbis',
    run: (s, t) => {
      if (s.faults.zone === 'z81b') return go(t, 6_000);
      setFaisceau81(s, 1);
      if (!heldOrCommanded(s, ['nuam', 'amnu', 'agnu'])) {
        if (s.established.agnu) {
          destroyByPedal(s, 'agnu', t.dueAt, `AG-NU détruit au dégagement du ${t.num}.`);
        }
      } else if (s.established.amnu && s.b.amnu === 0) {
        destroyByPedal(s, 'amnu', t.dueAt, `AM-NU détruit au dégagement du ${t.num}.`);
      }
      return go(t, 6_000);
    },
  },
  {
    id: 'tacsept',
    run: (s, t) => {
      // `tacsept()` : `dtrainv1 = trainv1`, comme `tasixbis()` sur l'autre
      // sortie de la voie 1.
      s.dtrain.v1 = t.num;
      if (lev(s, 'aig83b') === 'g') return derail(s, t, 'aig83b');
      s.zones.z86 = 2;
      return go(t, 7_000);
    },
  },
  {
    // `tachuit()` — le train est garé voie NU, les zones 83 repassent au tracé.
    id: 'tachuit',
    run: (s, t) => {
      if (s.faults.zone === 'z83' || s.faults.zone === 'z8382') return go(t, 8_000);
      s.zones.z83a = 1;
      s.zones.z83b = 1;
      const held = heldOrCommanded(s, ['nuam', 'amnu', 'agnu', 'nudgvi']);
      if (s.established.agnu && (!held || s.b.agnu === 0)) {
        destroyByPedal(s, 'agnu', t.dueAt, `AG-NU détruit au dégagement du ${t.num}.`);
      }
      if (s.established.amnu && s.b.amnu === 0) {
        destroyByPedal(s, 'amnu', t.dueAt, `AM-NU détruit au dégagement du ${t.num}.`);
      }
      s.trpresvc = true;
      return go(t, held ? 9_000 : 8_000);
    },
  },
  {
    id: 'tacneuf',
    run: (s, t) => {
      logEvent(s, 'info', `Le ${t.num} est garé voie NU.`);
      // `tacneuf()` : `if (btrafic==1){trafica();traficc();}`. Le train garé
      // devient une circulation du fil C ; l'ordonnanceur relance le fil A.
      if (s.traffic) spawnTrain(s, { thread: 'C', branch: 'c', counter: 'vcb' }, t.dueAt, 4_000);
      return { delay: 0, done: true };
    },
  },
];

// ===== Fil B — voie 2 depuis N2 =============================================

const BRANCH_B: Step[] = [
  {
    id: 'tbun',
    run: (s, t) => {
      // `refreshann()` : l'annonce voie 2 déclenche le gong.
      if (!s.annv2) s.sfx.gong += 1;
      s.annv2 = true;
      logEvent(s, 'info', `Train ${t.num} en approche de Springfield par N2.`);
      // `tbun()` : `document.saat.case2.value = trainv2`.
      saatPose(s, t.num, 'v2n2');
      return go(t, open(s, 'c82') ? 12_000 : 20_000);
    },
  },
  {
    id: 'tbunbis',
    run: (s, t) => {
      t.sawOpen = open(s, 'c82');
      return go(t, open(s, 'c82') ? 12_000 : 19_000);
    },
  },
  {
    id: 'tbunter',
    run: (s, t) => {
      s.zones.z88 = 2;
      if (t.sawOpen && !open(s, 'c82') && s.zones.z82b !== 2) {
        say(s, t, 'ferme-loin', 'je viens de constater la fermeture du C 82, je serai en mesure de m’arrêter devant.');
      }
      return go(t, 11_000);
    },
  },
  {
    id: 'tbdeux',
    run: (s, t) => {
      s.annv2 = false;
      km(t, '14,020');
      return go(t, open(s, 'c82') ? 20_000 : 25_000);
    },
  },
  {
    id: 'tbtrois',
    run: (s, t) => {
      readCba(s, t, 82);
      if (!open(s, 'c82') && !t.auto) {
        return haltAppel(s, t, 'arret-c82', appelArret(s, t, 'c82', 'arret'));
      }
      return go(t, s.zones.z80 !== 2 ? 4_000 : 12_000);
    },
  },
  {
    // `attvz()` — engagement sur le faisceau 82.
    id: 'attvz',
    run: (s, t) => {
      if (!open(s, 'c82') && !t.auto) {
        say(s, t, 'referme', 'le C 82 vient de se refermer, je suis arrêté devant.');
        t.stopped = true;
        return { delay: 2_000, to: 4 };
      }
      t.cleared = open(s, 'c82');
      // `attvz()` : `case2` se vide, `case4` reçoit le numéro.
      saatPose(s, t.num, 'v2dg');
      setFaisceau82(s, 2);
      // `attvz()`, branche `arreacci == 1` : le train s'engage puis tombe en
      // panne sur le faisceau 82. La zone passe en dérangement, le carré se
      // referme derrière lui, et il ne repartira que sur ordre.
      if (s.accidentalStop === 1) {
        s.faults.zone = 'z82';
        logEvent(s, 'error', `Le ${t.num} s'immobilise sur le faisceau 82 — zone z82 en dérangement.`);
        return go(t, 15_000, { branch: 'b', step: stepIndex('b', 'arraccia') });
      }
      return go(t, 6_000);
    },
  },
  {
    id: 'tbquatre',
    run: (s, t) => {
      km(t, '13,950');
      t.auto = false; // `auto82 = 0` en tête de `tbquatre()`
      if (lev(s, 'aig82') !== 'd') {
        if (t.cleared) return talon(s, t, 'aig82');
        return halt(s, t, 'a82', 'je suis arrêté au pied de l’aiguille 82 disposée à gauche.');
      }
      // Ordre « ne pas se remettre en marche » : le train patiente.
      if (!t.marche) return { delay: 1000, to: 'stay' };
      return go(t, auPasParmi(t, ['aig82', 'aig81b']) ? 15_000 : 5_000);
    },
  },
  {
    id: 'tbquatrep',
    run: (s, t) => {
      if (lev(s, 'aig82') === 'g') return derail(s, t, 'aig82');
      s.zones.z88 = s.established.nzdgtp ? 1 : 0;
      if (s.dmt && (s.dmt.route === 'nzdgda' || s.dmt.route === 'nzdgtp')) s.dmt = null;
      return go(t, 8_000);
    },
  },
  {
    id: 'tbcinqat',
    run: (s, t) => {
      km(t, '13,620');
      if (lev(s, 'aig81b') !== 'd') {
        if (t.cleared) return talon(s, t, 'aig81b');
        return halt(s, t, 'a81b', 'je suis arrêté au pied de l’aiguille 81b disposée à gauche.');
      }
      // Ordre « ne pas se remettre en marche » : le train patiente.
      if (!t.marche) return { delay: 1000, to: 'stay' };
      return go(t, auPasParmi(t, ['aig82', 'aig81b']) ? 12_000 : 3_000);
    },
  },
  {
    id: 'tbcinq',
    run: (s, t) => {
      if (lev(s, 'aig81b') === 'g') return derail(s, t, 'aig81b');
      s.zones.z80 = 2;
      return go(t, 6_000);
    },
  },
  {
    // `tbsixat()` — le train est sur l'aiguille 81b.
    id: 'tbsixat',
    run: surLAiguille({
      aig: 'aig81b',
      pos: 'd',
      pas: ['aig82', 'aig81b'],
      delai: 4_000,
      delaiAuPas: 12_000,
    }),
  },
  {
    // `tbsix()` — dégagement du faisceau 82 : destruction automatique de N2-DG
    // ou reformation de son tracé permanent.
    id: 'tbsix',
    run: (s, t) => {
      // `tbsix()` : `dtrainv2 = trainv2`.
      s.dtrain.v2 = t.num;
      if (s.faults.zone === 'z82' || s.faults.zone === 'z8382') return go(t, 14_000);

      const fr = s.faults.route;
      if (s.established.nzdgtp && s.b.nzdgtp === 1) {
        setFaisceau82(s, 1);
        formRoute(s, ROUTE_BY_ID.nzdgtp);
      } else if (s.established.nzdgda) {
        if (fr?.kind === 'destruction' && fr.id === 'nzdgda' && s.b.nzdgda === 1) {
          setFaisceau82(s, 1);
          logEvent(s, 'error', 'N2-DG — raté de destruction automatique au passage du train.');
        } else {
          setFaisceau82(s, 0);
          destroyByPedal(s, 'nzdgda', t.dueAt, `N2-DG détruit au passage du ${t.num}.`);
        }
      } else {
        setFaisceau82(s, 0);
      }
      return go(t, 14_000);
    },
  },
  {
    id: 'tbsept',
    run: (s, t) => {
      s.zones.z80 = heldOrCommanded(s, ['nzdgda', 'nzdgtp', 'nudgvi', 'nudgvz']) ? 1 : 0;
      logEvent(s, 'info', `Le ${t.num} a quitté Springfield vers DG.`);
      saatLibere(s, t.num);
      return { delay: 8_000, done: true };
    },
  },
];

// ===== Arrêt accidentel (scénario 3) ========================================
//
// `arraccia()` délivre les deux messages ; le train reste sur place tant que le
// conducteur n'a pas dépanné (`arreacci = 2`) **et** que l'aiguilleur n'a pas
// dégagé la voie centrale. `arraccib()` attend ensuite un ordre de remise en
// marche, en vérifiant la position des aiguilles 82 et 81b.

BRANCH_B.push(
  {
    id: 'arraccia',
    run: (s, t) => {
      say(
        s,
        t,
        'panne',
        'j’ai une insuffisance de traction, je dois appliquer mon guide, je te tiens au courant.',
      );
      km(t, '13,975');
      if (!t.said['regul']) {
        t.said['regul'] = true;
        logEvent(
          s,
          'warn',
          `Régulateur — faites sortir le train de la voie centrale en attendant que le ${t.num} dépanne son train.`,
        );
      }
      // Le dépannage n'est annoncé qu'une fois un itinéraire NU-DG établi.
      if (s.accidentalStop !== 2) return { delay: 10_000, to: 'stay' };
      if (!s.established.nudgvi && !s.established.nudgvz) return { delay: 10_000, to: 'stay' };
      say(s, t, 'depanne', 'j’ai réussi à dépanner, j’attends tes instructions pour repartir.');
      return { delay: 1_000 };
    },
  },
  {
    id: 'arraccib',
    run: (s, t) => {
      // `arraccib()` accepte indifféremment l'ordre verbal ou un Cba sur le C 82.
      readCba(s, t, 82);
      if (!t.restartOrder && !t.auto) return { delay: 2_000, to: 'stay' };
      if (lev(s, 'aig82') !== 'd' || lev(s, 'aig81b') !== 'd') {
        // Les répliques sur les aiguilles sont émises par `readOrdre()`.
        return { delay: 2_000, to: 'stay' };
      }
      t.restartOrder = false;
      t.auto = false;
      s.accidentalStop = 0;
      s.faults.zone = null;
      logEvent(s, 'info', `Le ${t.num} se remet en marche — arrêt accidentel terminé.`);
      return go(t, 9_000, { branch: 'b', step: stepIndex('b', 'tbquatre') });
    },
  },
);

// ===== Dégagements communs aux fils C et M ==================================

/**
 * Dégagement des zones 83 derrière un train parti de la voie centrale —
 * `tcasixb()` / `tcbsix()`.
 *
 * Sous dérangement de zone, rien ne se libère. Sinon la pédale du C 84 est
 * franchie et l'itinéraire tombe, sauf raté de destruction automatique : il
 * reste tracé et les zones repassent en enclenchement au lieu de se libérer.
 */
function libereZones83(s: PrsState, t: Train, route: 'nudgvi' | 'nudgvz'): void {
  if (s.faults.zone === 'z83' || s.faults.zone === 'z8382') return;
  if (!s.established[route]) {
    s.zones.z83a = 0;
    s.zones.z83b = 0;
    return;
  }
  const fr = s.faults.route;
  if (fr?.kind === 'destruction' && fr.id === route && s.b[route] === 1) {
    s.zones.z83a = route === 'nudgvz' ? 0 : 1;
    s.zones.z83b = 1;
    s.ped['84'] = 2;
    logEvent(s, 'error', `${ROUTE_BY_ID[route].label} — raté de destruction automatique au passage du train.`);
    return;
  }
  s.zones.z83a = 0;
  s.zones.z83b = 0;
  destroyByPedal(s, route, t.dueAt, `${ROUTE_BY_ID[route].label} détruit au passage du ${t.num}.`);
}

/** Dégagement du faisceau 81 derrière un train de la voie centrale (`tcaseptbis()`). */
function libereFaisceau81ApresC(s: PrsState, t: Train, route: 'nudgvi'): void {
  if (s.faults.zone === 'z81b') return;
  if (!s.established[route]) {
    setFaisceau81(s, 0);
    return;
  }
  // `if (z83b==0)` : la queue du train a-t-elle dégagé l'entrée du faisceau ?
  if (s.zones.z83b === 0) {
    setFaisceau81(s, 0);
    destroyByPedal(s, route, t.dueAt, `${ROUTE_BY_ID[route].label} détruit au dégagement du ${t.num}.`);
  } else {
    setFaisceau81(s, 1);
    if (s.b[route] !== 1) {
      destroyByPedal(s, route, t.dueAt, `${ROUTE_BY_ID[route].label} détruit au dégagement du ${t.num}.`);
    }
  }
}

/** Dégagement du faisceau 82 (`tcahuit()` / `tcbhuit()`). */
function libereFaisceau82ApresC(s: PrsState, t: Train, route: 'nudgvi' | 'nudgvz'): void {
  const entree = route === 'nudgvi' ? s.zones.z81b : s.zones.z83b;
  if (s.faults.zone !== 'z82' && s.faults.zone !== 'z8382') {
    if (!s.established[route]) {
      setFaisceau82(s, 0);
    } else if (entree === 0) {
      setFaisceau82(s, 0);
      destroyByPedal(s, route, t.dueAt, `${ROUTE_BY_ID[route].label} détruit au dégagement du ${t.num}.`);
    } else {
      setFaisceau82(s, 1);
      if (s.b[route] !== 1) {
        destroyByPedal(s, route, t.dueAt, `${ROUTE_BY_ID[route].label} détruit au dégagement du ${t.num}.`);
      }
    }
  }
  if (s.saat.v2dg === String(t.num)) s.saat.v2dg = '';
}

/** Fin de parcours vers DG (`tcaneuf()` / `tcbneuf()`). */
function finVersDg(s: PrsState, t: Train): StepResult {
  s.zones.z80 = heldOrCommanded(s, ['nzdgda', 'nzdgtp', 'nudgvi', 'nudgvz']) ? 1 : 0;
  if (s.established.dgni && s.b.dgni === 2) {
    destroyRoute(s, ROUTE_BY_ID.dgni, t.dueAt, 'DG-N1 détruit — annulation en cours.');
  }
  logEvent(s, 'info', `Le ${t.num} a quitté Springfield vers DG.`);
  saatLibere(s, t.num);
  return { delay: 0, done: true };
}

// ===== Fil C — voie centrale (voie NU) ======================================
//
// Un train garé voie NU qui repart. Il est arrêté au **C 84** et l'aiguilleur
// décide de sa sortie : `attvc()` lit les aiguilles 83b puis 81a.
//
//   83b à droite + 81a à gauche  →  NU-DG V1   (branche `c1`, `tca*`)
//   83b à droite + 81a à droite  →  NU-AM      (branche `cvm`, `tcm*`)
//   83b à gauche                 →  NU-DG V2   (branche `c2`, `tcb*`)
//
// Trois entrées dans l'original — `traficc()` engage un train qui prend ce
// qu'on lui donne, `traficcb()` un train **pour DG**, `traficcm()` un train
// **pour la voie mère**. Les deux derniers refusent l'itinéraire qui ne mène
// pas là où ils vont ; c'est `t.dest` qui porte cette intention ici.

/** Le conducteur signale qu'on l'aiguille au mauvais endroit. */
function mauvaiseDirection(s: PrsState, t: Train, ou: string, retour: number): StepResult {
  if (t.wrongWay) return { delay: 4_000, to: 'stay' };
  t.wrongWay = true;
  t.stopped = true;
  logEvent(
    s,
    'warn',
    `Conducteur du ${t.num} — tu t'es trompé, je vais ${ou}.` +
      (t.auto
        ? ' Tu pourras refaire le Cba, je reste arrêté au pied du signal.'
        : ' Je suis arrêté au pied du signal.'),
  );
  // « tu pourra refaire le Cba » : l'autorisation tombe avec la protestation.
  if (t.auto) {
    t.auto = false;
    s.cba = { ...s.cba, pending: false };
  }
  return { delay: 4_000, to: retour };
}

const BRANCH_C: Step[] = [
  {
    // `tcun()` / `tcbun()` / `tcmun()`
    id: 'tcun',
    run: (_s, t) => go(t, 6_000),
  },
  {
    // `tcdeux()` — le numéro s'inscrit voie centrale.
    id: 'tcdeux',
    run: (s, t) => {
      saatPose(s, t.num, 'nu');
      // 12 s pour `tcdeux()`, 15 s pour `tcbdeux()`, 10 s pour `tcmdeux()`.
      return go(t, t.dest === 'dg' ? 15_000 : t.dest === 'vm' ? 10_000 : 12_000);
    },
  },
  {
    // `tctrois()` — le train demande le départ au C 84.
    id: 'tctrois',
    run: (s, t) => {
      km(t, t.dest ? '14,050' : '14,030');
      readCba(s, t, 84);
      if (!open(s, 'c84') && !t.auto) {
        // `if ((eritivc==1)&&(c84==1)&&(conf84==1))` : après s'être fait
        // renvoyer, le conducteur confirme au lieu de redemander le départ.
        if (t.wrongWay) {
          say(s, t, 'confirme-84', 'je te confirme la fermeture du C 84, terminé.');
          return { delay: 4_000, to: 'stay' };
        }
        const f = s.faults.signal;
        return haltAppel(
          s,
          t,
          'depart-vc',
          f && f.id === 'c84' && f.kind === 'ex'
            ? appelArret(s, t, 'c84', 'depart')
            : appelDepartVoieCentrale(t.num, heurePoste(s, t), 'depart'),
        );
      }
      return go(t, 4_000);
    },
  },
  {
    // `attvc()` / `cbattvc()` / `cmattvc()` — engagement.
    id: 'attvc',
    run: (s, t) => {
      if (!open(s, 'c84') && !t.auto) {
        say(s, t, 'referme', 'le C 84 vient de se refermer, je suis arrêté devant.');
        t.stopped = true;
        return { delay: 1_000, to: stepIndex('c', 'tctrois') };
      }
      t.cleared = open(s, 'c84');
      // `if (c84==1){dsodetoa();}` : franchi sur ordre, le détonateur claque.
      const detonateur = () => {
        if (!open(s, 'c84')) s.sfx.deto += 1;
      };
      // 7 s pour `attvc()`, 10 s pour les deux variantes à destination.
      const engage = t.dest ? 10_000 : 7_000;
      const retour = stepIndex('c', 'tctrois');

      if (s.cag.aig83b === 'd' && s.cag.aig81a === 'd') {
        // NU-AM — vers la voie mère.
        if (t.dest === 'dg') return mauvaiseDirection(s, t, 'sur Capital-city', retour);
        s.zones.z83b = 2;
        s.zones.z83a = 2;
        detonateur();
        saatPose(s, t.num, 'vm');
        return go(t, engage, { branch: 'cvm' });
      }
      if (t.dest === 'vm') return mauvaiseDirection(s, t, "sur l'EP MOE", retour);
      // Les deux sorties vers DG attendent que le canton 80 soit libre.
      if (s.zones.z80 === 2) return { delay: 4_000, to: 'stay' };
      s.zones.z83b = 2;
      detonateur();
      saatPose(s, t.num, 'v2dg');
      if (s.cag.aig83b === 'd') {
        s.zones.z83a = 2;
        return go(t, engage, { branch: 'c1' });
      }
      return go(t, engage, { branch: 'c2' });
    },
  },
];

// --- NU → DG par la voie 1 (`tca*`) -----------------------------------------

const PAS_C1 = ['aig81a', 'aig81b', 'aig83a', 'aig83b'] as const;

const BRANCH_C1: Step[] = [
  {
    // `tcaquatre()` — au pied de 83b. Si elle est à gauche et que NU-DG V1
    // n'est pas formé, le train part par l'autre sortie plutôt que d'attendre.
    id: 'tcaquatre',
    run: (s, t) => {
      t.auto = false;
      s.trpresvc = false;
      if (lev(s, 'aig83b') !== 'd') {
        if (!s.established.nudgvi) return go(t, 1_000, { branch: 'c2' });
        km(t, '13,980');
        return halt(
          s,
          t,
          'c83b',
          "je suis arrêté au pied de l'aiguille 83b disposée à gauche, tu m'envoies où là ?",
        );
      }
      if (!t.marche) return { delay: 1_000, to: 'stay' };
      return go(t, auPasParmi(t, PAS_C1) ? 10_000 : 3_000);
    },
  },
  {
    id: 'tcaquatrep',
    run: (s, t) => {
      if (lev(s, 'aig83b') === 'g') return derail(s, t, 'aig83b');
      s.zones.z86 = 0;
      return go(t, 2_000);
    },
  },
  {
    id: 'tcaquatreat',
    run: (s, t) =>
      lev(s, 'aig83b') === 'g'
        ? derail(s, t, 'aig83b')
        : go(t, auPasParmi(t, PAS_C1) ? 6_000 : 1_000),
  },
  {
    id: 'tcaquatrebis',
    run: (s, t) => {
      if (lev(s, 'aig83b') === 'g') return derail(s, t, 'aig83b');
      setFaisceau81(s, 2);
      return go(t, 6_000);
    },
  },
  {
    id: 'tcacinqat',
    run: auPied({
      aig: 'aig83a',
      pos: 'd',
      sous: { aig: 'aig83b', pos: 'd' },
      pas: PAS_C1,
      delai: 5_000,
      delaiAuPas: 10_000,
      km: '13,900',
      cle: 'c83a',
      message: "je suis arrêté au pied de l'aiguille 83a disposée à gauche.",
    }),
  },
  {
    // `tcacinq()` — la voie centrale se libère derrière le train.
    id: 'tcacinq',
    run: (s, t) => {
      if (lev(s, 'aig83a') === 'g') return derail(s, t, 'aig83a');
      if (lev(s, 'aig83b') === 'g') return derail(s, t, 'aig83b');
      if (s.faults.zone === 'z84') return go(t, 8_000);
      s.zones.z84 = 0;
      return go(t, 6_000);
    },
  },
  {
    id: 'tcasixat',
    run: (s, t) => {
      if (lev(s, 'aig83a') === 'g') return derail(s, t, 'aig83a');
      if (lev(s, 'aig83b') === 'g') return derail(s, t, 'aig83b');
      return go(t, auPasParmi(t, PAS_C1) ? 6_000 : 1_000);
    },
  },
  {
    // `tcasixb()` — dégagement des zones 83, destruction de NU-DG V1.
    id: 'tcasixb',
    run: (s, t) => {
      if (lev(s, 'aig83a') === 'g') return derail(s, t, 'aig83a');
      if (lev(s, 'aig83b') === 'g') return derail(s, t, 'aig83b');
      libereZones83(s, t, 'nudgvi');
      return go(t, 10_000);
    },
  },
  {
    // `tcasixp()` — au pied de 81a. Le source dit ici **dérailler** et non
    // talonner : le train se présente par la pointe de l'aiguille.
    id: 'tcasixp',
    run: (s, t) => {
      km(t, '13,650');
      if (lev(s, 'aig81a') !== 'g') {
        if (t.cleared) return derail(s, t, 'aig81a');
        return halt(s, t, 'c81a', "je suis arrêté au pied de l'aiguille 81a disposée à droite.");
      }
      if (!t.marche) return { delay: 1_000, to: 'stay' };
      if (lev(s, 'aig83a') === 'g') return derail(s, t, 'aig83a');
      return go(t, auPasParmi(t, ['aig81a', 'aig81b', 'aig83a']) ? 10_000 : 2_000);
    },
  },
  {
    id: 'tcasix',
    run: (s, t) => {
      if (lev(s, 'aig81a') === 'd') return derail(s, t, 'aig81a');
      if (lev(s, 'aig83a') === 'g') return derail(s, t, 'aig83a');
      setFaisceau82(s, 2);
      saatPose(s, t.num, 'v2dg');
      return go(t, 6_000);
    },
  },
  {
    id: 'tcaseptat',
    run: auPied({
      aig: 'aig81b',
      pos: 'g',
      sous: { aig: 'aig81a', pos: 'g' },
      pas: ['aig81a', 'aig81b', 'aig83a'],
      delai: 2_000,
      delaiAuPas: 10_000,
      km: '13,560',
      cle: 'c81b',
      message: "je suis arrêté au pied de l'aiguille 81b disposée à droite.",
    }),
  },
  {
    id: 'tcasept',
    run: (s, t) => {
      if (lev(s, 'aig81a') === 'd') return derail(s, t, 'aig81a');
      if (lev(s, 'aig81b') === 'd') return derail(s, t, 'aig81b');
      s.zones.z80 = 2;
      return go(t, 2_000);
    },
  },
  {
    id: 'tcaseptbisat',
    run: (s, t) => {
      if (lev(s, 'aig81a') === 'd') return derail(s, t, 'aig81a');
      if (lev(s, 'aig81b') === 'd') return derail(s, t, 'aig81b');
      return go(t, auPasParmi(t, ['aig81a', 'aig81b', 'aig83a']) ? 6_000 : 1_000);
    },
  },
  {
    // `tcaseptbis()` — dégagement du faisceau 81.
    id: 'tcaseptbis',
    run: (s, t) => {
      if (lev(s, 'aig81a') === 'd') return derail(s, t, 'aig81a');
      if (lev(s, 'aig81b') === 'd') return derail(s, t, 'aig81b');
      libereFaisceau81ApresC(s, t, 'nudgvi');
      return go(t, 12_000);
    },
  },
  {
    id: 'tcahuitat',
    run: (s, t) =>
      lev(s, 'aig81b') === 'd'
        ? derail(s, t, 'aig81b')
        : go(t, auPasParmi(t, ['aig81a', 'aig81b']) ? 6_000 : 1_000),
  },
  {
    // `tcahuit()` — dégagement du faisceau 82.
    id: 'tcahuit',
    run: (s, t) => {
      if (lev(s, 'aig81b') === 'd') return derail(s, t, 'aig81b');
      libereFaisceau82ApresC(s, t, 'nudgvi');
      return go(t, 10_000);
    },
  },
  {
    id: 'tcaneuf',
    run: (s, t) => finVersDg(s, t),
  },
];

// --- NU → DG par la voie 2 (`tcb*`) -----------------------------------------

const PAS_C2 = ['aig81b', 'aig82', 'aig83b'] as const;

const BRANCH_C2: Step[] = [
  {
    // `tcbquatre()` — au pied de 83b, symétrique de `tcaquatre()`.
    id: 'tcbquatre',
    run: (s, t) => {
      t.auto = false;
      s.trpresvc = false;
      if (lev(s, 'aig83b') !== 'g') {
        if (!s.established.nudgvz) return go(t, 1_000, { branch: 'c1' });
        km(t, '13,980');
        return halt(
          s,
          t,
          'c83b',
          "je suis arrêté au pied de l'aiguille 83b disposée à droite, tu m'envoies où là ?",
        );
      }
      if (!t.marche) return { delay: 1_000, to: 'stay' };
      return go(t, auPasParmi(t, PAS_C2) ? 10_000 : 3_000);
    },
  },
  {
    id: 'tcbquatrep',
    run: (s, t) => {
      if (lev(s, 'aig83b') === 'd') return derail(s, t, 'aig83b');
      s.zones.z86 = 0;
      return go(t, 2_000);
    },
  },
  {
    id: 'tcbquatreb',
    run: (s, t) =>
      lev(s, 'aig83b') === 'd'
        ? derail(s, t, 'aig83b')
        : go(t, auPasParmi(t, PAS_C2) ? 6_000 : 1_000),
  },
  {
    id: 'tcbquatrebp',
    run: (s, t) => {
      if (lev(s, 'aig83b') === 'd') return derail(s, t, 'aig83b');
      setFaisceau82(s, 2);
      return go(t, 6_000);
    },
  },
  {
    id: 'tcbcinqat',
    run: auPied({
      aig: 'aig82',
      pos: 'g',
      sous: { aig: 'aig83b', pos: 'g' },
      pas: PAS_C2,
      delai: 2_000,
      delaiAuPas: 6_000,
      km: '13,910',
      cle: 'c82',
      message: "je suis arrêté au pied de l'aiguille 82 disposée à droite.",
    }),
  },
  {
    id: 'tcbcinq',
    run: (s, t) => {
      if (lev(s, 'aig83b') === 'd') return derail(s, t, 'aig83b');
      if (lev(s, 'aig82') === 'd') return derail(s, t, 'aig82');
      if (s.faults.zone !== 'z84') s.zones.z84 = 0;
      return go(t, 8_000);
    },
  },
  {
    id: 'tcbsixat',
    run: (s, t) => {
      if (lev(s, 'aig83b') === 'd') return derail(s, t, 'aig83b');
      if (lev(s, 'aig82') === 'd') return derail(s, t, 'aig82');
      return go(t, auPasParmi(t, PAS_C2) ? 6_000 : 1_000);
    },
  },
  {
    id: 'tcbsix',
    run: (s, t) => {
      if (lev(s, 'aig83b') === 'd') return derail(s, t, 'aig83b');
      if (lev(s, 'aig82') === 'd') return derail(s, t, 'aig82');
      libereZones83(s, t, 'nudgvz');
      return go(t, 8_000);
    },
  },
  {
    id: 'tcbseptat',
    run: auPied({
      aig: 'aig81b',
      pos: 'd',
      sous: { aig: 'aig82', pos: 'g' },
      pas: PAS_C2,
      delai: 2_000,
      delaiAuPas: 8_000,
      km: '13,580',
      cle: 'c81b',
      message: "je suis arrêté au pied de l'aiguille 81b disposée à gauche.",
    }),
  },
  {
    id: 'tcbsept',
    run: (s, t) => {
      if (lev(s, 'aig81b') === 'g') return derail(s, t, 'aig81b');
      s.zones.z80 = 2;
      return go(t, 12_000);
    },
  },
  {
    id: 'tcbhuit',
    run: (s, t) => {
      if (lev(s, 'aig81b') === 'g') return derail(s, t, 'aig81b');
      libereFaisceau82ApresC(s, t, 'nudgvz');
      return go(t, 10_000);
    },
  },
  {
    id: 'tcbneuf',
    run: (s, t) => finVersDg(s, t),
  },
];

// --- NU → voie mère (`tcm*`) ------------------------------------------------
//
// Le seul parcours du poste qui traverse **deux** signaux : le C 84 pour
// sortir de la voie centrale, puis le Cv 88 pour aborder la voie mère.

const PAS_CVM = ['aig81a', 'aig83a', 'aig83b', 'aig85a', 'aig85b'] as const;

const BRANCH_CVM: Step[] = [
  {
    id: 'tcmquatre',
    run: (s, t) => {
      t.auto = false;
      s.trpresvc = false;
      km(t, '13,990');
      // Pas de branche `memvc` ici : le train attend, il ne talonne jamais.
      if (lev(s, 'aig83b') !== 'd') {
        return halt(s, t, 'c83b', "je suis arrêté au pied de l'aiguille 83b disposée à gauche.");
      }
      if (!t.marche) return { delay: 1_000, to: 'stay' };
      return go(t, auPasParmi(t, PAS_CVM) ? 10_000 : 3_000);
    },
  },
  {
    // `tcmquatrep()` — la zone 86 ne se libère que si rien ne la tient.
    id: 'tcmquatrep',
    run: (s, t) => {
      s.zones.z86 = s.established.agnu || s.established.amnu ? 1 : 0;
      return go(t, 4_000);
    },
  },
  {
    id: 'tcmquatreat',
    run: (s, t) =>
      lev(s, 'aig83b') === 'g'
        ? derail(s, t, 'aig83b')
        : go(t, auPasParmi(t, PAS_CVM) ? 6_000 : 1_000),
  },
  {
    id: 'tcmquatreb',
    run: (s, t) => {
      if (lev(s, 'aig83b') === 'g') return derail(s, t, 'aig83b');
      setFaisceau81(s, 2);
      return go(t, 6_000);
    },
  },
  {
    id: 'tcmcinqat',
    run: auPied({
      aig: 'aig83a',
      pos: 'd',
      sous: { aig: 'aig83b', pos: 'd' },
      pas: PAS_CVM,
      delai: 5_000,
      delaiAuPas: 10_000,
      km: '13,910',
      cle: 'c83a',
      message: "je suis arrêté au pied de l'aiguille 83a disposée à gauche.",
    }),
  },
  {
    id: 'tcmcinq',
    run: (s, t) => {
      if (lev(s, 'aig83a') === 'g') return derail(s, t, 'aig83a');
      if (lev(s, 'aig83b') === 'g') return derail(s, t, 'aig83b');
      if (s.faults.zone !== 'z84') {
        s.zones.z84 = s.established.agnu || s.established.amnu ? 1 : 0;
      }
      return go(t, 9_000);
    },
  },
  {
    id: 'tcmsixat',
    run: (s, t) => {
      if (lev(s, 'aig83a') === 'g') return derail(s, t, 'aig83a');
      if (lev(s, 'aig83b') === 'g') return derail(s, t, 'aig83b');
      return go(t, auPasParmi(t, PAS_CVM) ? 6_000 : 1_000);
    },
  },
  {
    // `tcmsix()` — les zones 83 restent enclenchées tant que NU-AM ou AM-NU
    // les tient ; sinon elles se libèrent. NU-AM tombe ici.
    id: 'tcmsix',
    run: (s, t) => {
      if (lev(s, 'aig83a') === 'g') return derail(s, t, 'aig83a');
      if (lev(s, 'aig83b') === 'g') return derail(s, t, 'aig83b');
      if (s.faults.zone !== 'z83' && s.faults.zone !== 'z8382') {
        const tenu = s.established.nuam || s.established.amnu;
        s.zones.z83a = tenu ? 1 : 0;
        s.zones.z83b = tenu ? 1 : 0;
      }
      if (s.established.nuam && s.b.nuam !== 1) {
        destroyByPedal(s, 'nuam', t.dueAt, `NU-AM détruit au passage du ${t.num}.`);
      }
      return go(t, 8_000);
    },
  },
  {
    id: 'tcmsixp',
    run: auPied({
      aig: 'aig81a',
      pos: 'd',
      sous: { aig: 'aig83a', pos: 'd' },
      pas: PAS_CVM,
      delai: 5_000,
      delaiAuPas: 10_000,
      km: '13,650',
      cle: 'c81a',
      message: "je suis arrêté au pied de l'aiguille 81a disposée à gauche.",
      talonnable: false,
    }),
  },
  {
    // `tcmsixb()` — deuxième signal du parcours : le Cv 88.
    id: 'tcmsixb',
    run: (s, t) => {
      if (!open(s, 'cv88') && !t.auto88) {
        readCba88(s, t);
        if (!t.auto88) {
          return haltAppel(s, t, 'cv88', appelArret(s, t, 'cv88', 'arret'), 4_000);
        }
      }
      if (lev(s, 'aig81a') === 'g') return derail(s, t, 'aig81a');
      return go(t, 2_000);
    },
  },
  {
    // `attvam()` — franchissement du Cv 88.
    id: 'attvam',
    run: (s, t) => {
      if (lev(s, 'aig81a') === 'g') return derail(s, t, 'aig81a');
      s.zones.z81 = 2;
      t.auto88 = false;
      return go(t, 6_000);
    },
  },
  {
    id: 'tcmseptat',
    run: auPied({
      aig: 'aig85b',
      pos: 'd',
      sous: { aig: 'aig81a', pos: 'd' },
      pas: PAS_CVM,
      delai: 5_000,
      delaiAuPas: 10_000,
      km: '13,430',
      cle: 'c85b',
      message: "je suis arrêté au pied de l'aiguille 85b disposée à gauche.",
      talonnable: false,
    }),
  },
  {
    // `tcmseptn()` — abordage de la voie mère : elle doit être libre.
    id: 'tcmseptn',
    run: (s, t) => {
      if (lev(s, 'aig85b') === 'g') return derail(s, t, 'aig85b');
      if (s.trpresvm) return nezANez(s, t);
      s.zones.z89 = 2;
      saatPose(s, t.num, 'vm');
      return go(t, 6_000);
    },
  },
  {
    id: 'tcmseptp',
    run: auPied({
      aig: 'aig85a',
      pos: 'd',
      sous: { aig: 'aig85b', pos: 'd' },
      pas: PAS_CVM,
      delai: 5_000,
      delaiAuPas: 10_000,
      km: '13,320',
      cle: 'c85a',
      message: "je suis arrêté au pied de l'aiguille 85a disposée à gauche.",
      talonnable: false,
    }),
  },
  {
    id: 'tcmsept',
    run: (s, t) => {
      if (lev(s, 'aig85b') === 'g') return derail(s, t, 'aig85b');
      if (lev(s, 'aig85a') === 'g') return derail(s, t, 'aig85a');
      if (s.faults.zone !== 'z81b') {
        setFaisceau81(s, s.established.nuam || s.established.amnu ? 1 : 0);
        if (s.established.nuam && s.b.nuam !== 1) {
          destroyByPedal(s, 'nuam', t.dueAt, `NU-AM détruit au dégagement du ${t.num}.`);
        }
      }
      return go(t, 10_000);
    },
  },
  {
    id: 'tcmhuit',
    run: (s, t) => {
      if (lev(s, 'aig85b') === 'g') return derail(s, t, 'aig85b');
      if (lev(s, 'aig85a') === 'g') return derail(s, t, 'aig85a');
      if (s.faults.zone !== 'z81a') {
        s.zones.z81 = 1;
        if (s.established.nuam && s.b.nuam !== 1) {
          destroyByPedal(s, 'nuam', t.dueAt, `NU-AM détruit au dégagement du ${t.num}.`);
        }
      }
      return go(t, 6_000);
    },
  },
  {
    id: 'tcmhuitp',
    run: (s, t) =>
      lev(s, 'aig85a') === 'g'
        ? derail(s, t, 'aig85a')
        : go(t, auPasParmi(t, ['aig81a', 'aig85a', 'aig85b']) ? 6_000 : 1_000),
  },
  {
    // `tcmhuitn()` — le train est sur la voie mère, il a quitté le poste.
    id: 'tcmhuitn',
    run: (s, t) => {
      if (lev(s, 'aig85a') === 'g') return derail(s, t, 'aig85a');
      if (s.faults.zone !== 'z89') s.zones.z89 = s.established.nuam ? 1 : 0;
      if (s.established.amnu && s.b.amnu === 0) {
        destroyByPedal(s, 'amnu', t.dueAt, `AM-NU détruit au dégagement du ${t.num}.`);
      }
      if (s.established.amni && s.b.amni === 0) {
        destroyByPedal(s, 'amni', t.dueAt, `AM-N1 détruit au dégagement du ${t.num}.`);
      }
      logEvent(s, 'info', `Le ${t.num} a quitté Springfield par la voie mère.`);
      saatLibere(s, t.num);
      return { delay: 0, done: true };
    },
  },
];

// ===== Fil M — voie mère ====================================================
//
// Un train qui arrive de AM, arrêté au **Cv 85**. `attvm()` exige que le
// couple 85 soit renversé — sinon « c'est tracé vers le butoir » — puis lit
// l'aiguille 83a : à gauche AM-N1 (branche `m1`), à droite AM-NU (`mnu`).

const PAS_M = ['aig81a', 'aig83a', 'aig85a', 'aig85b'] as const;
const PAS_MNU = ['aig81a', 'aig83a', 'aig83b', 'aig85a', 'aig85b'] as const;

const BRANCH_M: Step[] = [
  {
    id: 'tmun',
    run: (s, t) => {
      saatPose(s, t.num, 'vm');
      logEvent(s, 'info', `Train ${t.num} en approche de Springfield par la voie mère.`);
      return go(t, open(s, 'cv85') ? 9_000 : 18_000);
    },
  },
  {
    id: 'tmdeux',
    run: (s, t) => {
      km(t, t.dest === 'v1' ? '13,140' : '13,120');
      // `messm = 3` : le train roule, il ne pourra plus s'arrêter au Cv 85.
      const lance =
        open(s, 'cv85') &&
        (t.dest === 'nu'
          ? s.established.amnu
          : s.zones.z81b !== 2 && s.zones.z85 !== 2 && (t.dest !== 'v1' || s.established.amni));
      t.running = lance;
      return go(t, lance ? 11_000 : 19_000);
    },
  },
  {
    // `tmtrois()` — arrêt au Cv 85, ou franchissement s'il est trop tard.
    id: 'tmtrois',
    run: (s, t) => {
      if (t.running && !open(s, 'cv85')) {
        // `if ((cv85==1)&&(messm==3)) {z89=2; fricv85=1; …}`
        t.running = false;
        t.overran = true;
        s.zones.z89 = 2;
        km(t, '13,200');
        s.sfx.deto += 1;
        logIncident(s, t.num, `Le ${t.num} a FRANCHI le Cv 85 fermé — détonateur.`);
        t.said['arret-85'] = true;
        return halt(s, t, 'franchi85', 'je viens de franchir le Cv 85 fermé, à toi.');
      }
      readCba(s, t, 85);
      if (!open(s, 'cv85') && !t.auto) {
        if (t.wrongWay) {
          say(s, t, 'confirme-85', 'je te confirme la fermeture du Cv 85, terminé.');
          return { delay: 4_000, to: 'stay' };
        }
        return haltAppel(s, t, 'arret-85', appelArret(s, t, 'cv85', 'arret'));
      }
      return go(t, 4_000);
    },
  },
  {
    // `attvm()` / `maattvm()` / `mcattvm()` — engagement.
    id: 'attvm',
    run: (s, t) => {
      if (!open(s, 'cv85') && !t.auto) {
        say(s, t, 'referme', 'le Cv 85 vient de se refermer, je suis arrêté devant.');
        t.stopped = true;
        return { delay: 1_000, to: 'stay' };
      }
      t.cleared = open(s, 'cv85');
      const retour = stepIndex('m', 'tmtrois');

      // `if ((cag85a=="g")||((cag85a=="d")&&(lev85a=="g")))` : le couple 85
      // n'est pas renversé, l'itinéraire mène au butoir du tiroir.
      if (s.cag.aig85a !== 'd' || lev(s, 'aig85a') !== 'd') {
        say(s, t, 'butoir', "tu m'envoies où Springfield, c'est tracé vers le butoir !");
        t.stopped = true;
        return { delay: 1_000, to: retour };
      }
      if (s.cag.aig83a === 'g') {
        // AM-N1 — vers la voie 1.
        if (t.dest === 'nu') return mauvaiseDirection(s, t, 'vers la voie centrale', retour);
        // `maattvm()` : `document.saat.case3.value==""` — la voie 1 côté N1
        // doit être libre pour recevoir le train.
        if (s.saat.v1n1 !== '') return { delay: 1_000, to: retour };
        s.zones.z89 = 2;
        s.trpresvm = false;
        saatPose(s, t.num, 'v1n1');
        return go(t, 10_000, { branch: 'm1' });
      }
      // AM-NU — vers la voie centrale.
      if (t.dest === 'v1') return mauvaiseDirection(s, t, 'vers Capital-city', retour);
      s.zones.z89 = 2;
      s.trpresvm = false;
      saatPose(s, t.num, 'nu');
      return go(t, 10_000, { branch: 'mnu' });
    },
  },
];

// --- AM → voie 1 (`tma*`) ---------------------------------------------------

const BRANCH_M1: Step[] = [
  {
    id: 'tmaquatre',
    run: (s, t) => {
      t.overran = false;
      t.auto = false;
      km(t, '13,250');
      if (lev(s, 'aig85a') !== 'd') {
        return halt(
          s,
          t,
          'm85a',
          "je suis arrêté au pied de l'aiguille 85a disposée à gauche, tu m'envoies où là ?",
        );
      }
      if (!t.marche) return { delay: 1_000, to: 'stay' };
      return go(t, auPasParmi(t, PAS_M) ? 10_000 : 3_000);
    },
  },
  {
    id: 'tmaquatreat',
    run: (s, t) => {
      if (lev(s, 'aig85a') === 'g') return derail(s, t, 'aig85a');
      s.zones.z81 = 2;
      return go(t, 5_000);
    },
  },
  {
    id: 'tmaquatrebat',
    run: auPied({
      aig: 'aig85b',
      pos: 'd',
      sous: { aig: 'aig85a', pos: 'd' },
      pas: PAS_M,
      delai: 3_000,
      delaiAuPas: 10_000,
      km: '13,380',
      cle: 'm85b',
      message: "je suis arrêté au pied de l'aiguille 85b disposée à gauche.",
      talonnable: false,
    }),
  },
  {
    id: 'tmaquatrebatn',
    run: (s, t) => {
      if (lev(s, 'aig85a') === 'g') return derail(s, t, 'aig85a');
      if (lev(s, 'aig85b') === 'g') return derail(s, t, 'aig85b');
      setFaisceau81(s, 2);
      return go(t, 2_000);
    },
  },
  {
    id: 'tmaquatrep',
    run: (s, t) => {
      if (lev(s, 'aig85a') === 'g') return derail(s, t, 'aig85a');
      if (lev(s, 'aig85b') === 'g') return derail(s, t, 'aig85b');
      return go(t, auPasParmi(t, PAS_M) ? 4_000 : 1_000);
    },
  },
  {
    // `tmaquatreb()` — la zone 89 se libère, la pédale du Cv 85 est franchie.
    id: 'tmaquatreb',
    run: (s, t) => {
      if (s.faults.zone === 'z89') return go(t, 6_000);
      const fr = s.faults.route;
      if (fr?.kind === 'destruction' && fr.id === 'amni' && s.b.amni === 1) {
        s.zones.z89 = 1;
        logEvent(s, 'error', 'AM-N1 — raté de destruction automatique au passage du train.');
        return go(t, 6_000);
      }
      s.zones.z89 = 0;
      if (s.established.amni) {
        destroyByPedal(s, 'amni', t.dueAt, `AM-N1 détruit au passage du ${t.num}.`);
      }
      return go(t, 6_000);
    },
  },
  {
    id: 'tmacinqat',
    run: auPied({
      aig: 'aig81a',
      pos: 'd',
      sous: { aig: 'aig85b', pos: 'd' },
      pas: PAS_M,
      delai: 3_000,
      delaiAuPas: 10_000,
      km: '13,560',
      cle: 'm81a',
      message: "je suis arrêté au pied de l'aiguille 81a disposée à gauche.",
    }),
  },
  {
    id: 'tmacinqn',
    run: (s, t) => {
      if (lev(s, 'aig85b') === 'g') return derail(s, t, 'aig85b');
      if (lev(s, 'aig81a') === 'g') return derail(s, t, 'aig81a');
      if (s.faults.zone === 'z81a' || t.overran) return go(t, 8_000);
      if (s.b.amni !== 1 && s.b.amni !== 2) {
        s.zones.z81 = 0;
        s.ped['85'] = 2;
        if (s.established.amni) {
          destroyByPedal(s, 'amni', t.dueAt, `AM-N1 détruit au dégagement du ${t.num}.`);
        }
      } else {
        s.zones.z81 = 1;
        s.ped['85'] = 2;
      }
      return go(t, 8_000);
    },
  },
  {
    id: 'tmacinqp',
    run: auPied({
      aig: 'aig83a',
      pos: 'g',
      sous: { aig: 'aig81a', pos: 'd' },
      pas: PAS_M,
      delai: 3_000,
      delaiAuPas: 10_000,
      km: '13,830',
      cle: 'm83a',
      message: "je suis arrêté au pied de l'aiguille 83a disposée à droite.",
      talonnable: false,
    }),
  },
  {
    id: 'tmacinq',
    run: (s, t) => {
      if (lev(s, 'aig83a') === 'd') return derail(s, t, 'aig83a');
      s.zones.z85 = 2;
      return go(t, 8_000);
    },
  },
  {
    id: 'tmasixat',
    run: (s, t) =>
      lev(s, 'aig83a') === 'd'
        ? derail(s, t, 'aig83a')
        : go(t, auPasParmi(t, PAS_M) ? 4_000 : 1_000),
  },
  {
    // `tmasix()` — dégagement du faisceau 81, occupation du canton 87.
    id: 'tmasix',
    run: (s, t) => {
      if (lev(s, 'aig83a') === 'd') return derail(s, t, 'aig83a');
      s.zones.z87 = 2;
      if (s.faults.zone === 'z81b') return go(t, 15_000);
      setFaisceau81(s, 1);
      if (!heldOrCommanded(s, ['agnida', 'agnitp']) && s.b.amni !== 2 && s.established.amni) {
        destroyByPedal(s, 'amni', t.dueAt, `AM-N1 détruit au dégagement du ${t.num}.`);
      }
      return go(t, 16_000);
    },
  },
  {
    id: 'tmaseptat',
    run: (_s, t) => go(t, auPasParmi(t, ['aig81a', 'aig83a']) ? 4_000 : 1_000),
  },
  {
    id: 'tmasept',
    run: (s, t) => {
      s.zones.z85 = heldOrCommanded(s, ['agnitp', 'dgni', 'amni', 'agnida']) ? 1 : 0;
      saatLibere(s, t.num);
      return go(t, 7_000);
    },
  },
  {
    id: 'tmahuit',
    run: (s, t) => {
      s.zones.z87 = heldOrCommanded(s, ['agnitp', 'dgni', 'amni', 'agnida']) ? 1 : 0;
      logEvent(s, 'info', `Le ${t.num} a quitté Springfield vers N1.`);
      return { delay: 0, done: true };
    },
  },
];

// --- AM → voie NU (`tmc*`) --------------------------------------------------

const BRANCH_MNU: Step[] = [
  {
    id: 'tmcquatre',
    run: (s, t) => {
      t.overran = false;
      t.auto = false;
      km(t, '13,250');
      if (lev(s, 'aig85a') !== 'd') {
        return halt(
          s,
          t,
          'm85a',
          "je suis arrêté au pied de l'aiguille 85a disposée à gauche, tu m'envoies où là ?",
        );
      }
      if (!t.marche) return { delay: 1_000, to: 'stay' };
      return go(t, auPasParmi(t, PAS_MNU) ? 10_000 : 3_000);
    },
  },
  {
    id: 'tmcquatreb',
    run: (s, t) => {
      if (lev(s, 'aig85a') === 'g') return derail(s, t, 'aig85a');
      s.zones.z81 = 2;
      return go(t, 5_000);
    },
  },
  {
    id: 'tmcquatrebat',
    run: auPied({
      aig: 'aig85b',
      pos: 'd',
      sous: { aig: 'aig85a', pos: 'd' },
      pas: PAS_MNU,
      delai: 3_000,
      delaiAuPas: 10_000,
      km: '13,380',
      cle: 'm85b',
      message: "je suis arrêté au pied de l'aiguille 85b disposée à gauche.",
      talonnable: false,
    }),
  },
  {
    id: 'tmcquatrebatn',
    run: (s, t) => {
      if (lev(s, 'aig85a') === 'g') return derail(s, t, 'aig85a');
      if (lev(s, 'aig85b') === 'g') return derail(s, t, 'aig85b');
      setFaisceau81(s, 2);
      return go(t, 2_000);
    },
  },
  {
    id: 'tmcquatrep',
    run: (s, t) => {
      if (lev(s, 'aig85a') === 'g') return derail(s, t, 'aig85a');
      if (lev(s, 'aig85b') === 'g') return derail(s, t, 'aig85b');
      return go(t, auPasParmi(t, PAS_MNU) ? 4_000 : 1_000);
    },
  },
  {
    // `tmccinq()` — la zone 89 reste enclenchée derrière AM-NU.
    id: 'tmccinq',
    run: (s, t) => {
      if (s.faults.zone === 'z89') return go(t, 8_000);
      const fr = s.faults.route;
      if (fr?.kind === 'destruction' && fr.id === 'amnu' && s.b.amnu === 1) {
        s.zones.z89 = 1;
        logEvent(s, 'error', 'AM-NU — raté de destruction automatique au passage du train.');
        return go(t, 8_000);
      }
      s.zones.z89 = 1;
      s.ped['85'] = 2;
      if (s.established.amnu) {
        destroyByPedal(s, 'amnu', t.dueAt, `AM-NU détruit au passage du ${t.num}.`);
      }
      return go(t, 8_000);
    },
  },
  {
    id: 'tmccinqat',
    run: auPied({
      aig: 'aig81a',
      pos: 'd',
      sous: { aig: 'aig85b', pos: 'd' },
      pas: PAS_MNU,
      delai: 3_000,
      delaiAuPas: 10_000,
      km: '13,560',
      cle: 'm81a',
      message: "je suis arrêté au pied de l'aiguille 81a disposée à gauche.",
    }),
  },
  {
    id: 'tmccinqn',
    run: (s, t) => {
      if (lev(s, 'aig85b') === 'g') return derail(s, t, 'aig85b');
      if (lev(s, 'aig81a') === 'g') return derail(s, t, 'aig81a');
      if (s.faults.zone === 'z81a' || t.overran) return go(t, 8_000);
      s.zones.z81 = 1;
      if (!s.established.nuam && s.b.amnu !== 1 && s.b.amnu !== 2 && s.established.amnu) {
        destroyByPedal(s, 'amnu', t.dueAt, `AM-NU détruit au dégagement du ${t.num}.`);
      }
      return go(t, 8_000);
    },
  },
  {
    id: 'tmcsixbat',
    run: auPied({
      aig: 'aig83a',
      pos: 'd',
      sous: { aig: 'aig81a', pos: 'd' },
      pas: PAS_M,
      delai: 3_000,
      delaiAuPas: 10_000,
      km: '13,830',
      cle: 'm83a',
      message: "je suis arrêté au pied de l'aiguille 83a disposée à gauche.",
      talonnable: false,
    }),
  },
  {
    id: 'tmcsixb',
    run: (s, t) => {
      if (lev(s, 'aig83a') === 'g') return derail(s, t, 'aig83a');
      s.zones.z83a = 2;
      s.zones.z83b = 2;
      return go(t, 10_000);
    },
  },
  {
    id: 'tmcsixat',
    run: auPied({
      aig: 'aig83b',
      pos: 'd',
      sous: { aig: 'aig83a', pos: 'd' },
      pas: PAS_MNU,
      delai: 3_000,
      delaiAuPas: 10_000,
      km: '13,920',
      cle: 'm83b',
      message: "je suis arrêté au pied de l'aiguille 83b disposée à gauche.",
    }),
  },
  {
    // `tmcsix()` — abordage de la voie centrale : elle doit être libre.
    id: 'tmcsix',
    run: (s, t) => {
      if (lev(s, 'aig83a') === 'g') return derail(s, t, 'aig83a');
      if (lev(s, 'aig83b') === 'g') return derail(s, t, 'aig83b');
      if (s.trpresvc) return nezANez(s, t);
      s.zones.z84 = 2;
      return go(t, 3_000);
    },
  },
  {
    id: 'tmcsixbisat',
    run: (s, t) => {
      if (lev(s, 'aig83a') === 'g') return derail(s, t, 'aig83a');
      if (lev(s, 'aig83b') === 'g') return derail(s, t, 'aig83b');
      return go(t, auPasParmi(t, ['aig81a', 'aig83a', 'aig83b', 'aig85b']) ? 4_000 : 1_000);
    },
  },
  {
    // `tmcsixbis()` — dégagement du faisceau 81.
    id: 'tmcsixbis',
    run: (s, t) => {
      if (lev(s, 'aig83a') === 'g') return derail(s, t, 'aig83a');
      if (lev(s, 'aig83b') === 'g') return derail(s, t, 'aig83b');
      if (s.faults.zone === 'z81b') return go(t, 15_000);
      setFaisceau81(s, 1);
      if (!heldOrCommanded(s, ['agnu', 'amnu']) && !s.established.nuam && s.established.amnu) {
        destroyByPedal(s, 'amnu', t.dueAt, `AM-NU détruit au dégagement du ${t.num}.`);
      }
      return go(t, 12_000);
    },
  },
  {
    id: 'tmcseptat',
    run: (s, t) =>
      lev(s, 'aig83b') === 'g'
        ? derail(s, t, 'aig83b')
        : go(t, auPasParmi(t, ['aig81a', 'aig83a', 'aig83b']) ? 4_000 : 1_000),
  },
  {
    id: 'tmcsept',
    run: (s, t) => {
      if (lev(s, 'aig83b') === 'g') return derail(s, t, 'aig83b');
      s.zones.z86 = 2;
      return go(t, 6_000);
    },
  },
  {
    // `tmchuit()` — le train est garé voie centrale et y repart aussitôt
    // comme circulation du fil C : `if (btrafic==1){traficc();}`.
    id: 'tmchuit',
    run: (s, t) => {
      if (lev(s, 'aig83b') === 'g') return derail(s, t, 'aig83b');
      if (s.faults.zone !== 'z83' && s.faults.zone !== 'z8382') {
        s.zones.z83a = 1;
        s.zones.z83b = 1;
        if (!heldOrCommanded(s, ['agnu', 'amnu']) && s.established.amnu) {
          destroyByPedal(s, 'amnu', t.dueAt, `AM-NU détruit au dégagement du ${t.num}.`);
        }
      }
      s.trpresvc = true;
      if (s.established.nudgvi && s.b.nudgvi === 0) {
        destroyByPedal(s, 'nudgvi', t.dueAt, `NU-DG V1 détruit au dégagement du ${t.num}.`);
      }
      if (s.established.nuam && s.b.nuam === 0) {
        destroyByPedal(s, 'nuam', t.dueAt, `NU-AM détruit au dégagement du ${t.num}.`);
      }
      logEvent(s, 'info', `Le ${t.num} est garé voie centrale.`);
      spawnTrain(s, { thread: 'C', branch: 'c', counter: 'vcb' }, t.dueAt, 4_000);
      return { delay: 0, done: true };
    },
  },
];

const BRANCHES: Record<BranchId, Step[]> = {
  a: BRANCH_A,
  ac: BRANCH_AC,
  b: BRANCH_B,
  c: BRANCH_C,
  c1: BRANCH_C1,
  c2: BRANCH_C2,
  cvm: BRANCH_CVM,
  m: BRANCH_M,
  m1: BRANCH_M1,
  mnu: BRANCH_MNU,
};

/** Index d'une étape dans sa branche, par son nom d'origine. */
function stepIndex(branch: BranchId, id: string): number {
  const i = BRANCHES[branch].findIndex((st) => st.id === id);
  return i === -1 ? 0 : i;
}

// ===== Ordonnanceur ==========================================================

/** Numéros de départ du trafic souple (globales de `gaestro.js`, ligne 8). */
export const TRAFFIC_START_NUM: Record<TrainCounter, number> = {
  v1a: 135_357,
  v1c: 135_357,
  v2: 135_872,
  vcb: 135_000,
  vcm: 135_000,
  vm: 403_000,
};

/** Délai d'engagement du premier train de chaque fil (`trafica()`/`traficb()`). */
const SPAWN_DELAY: Record<ThreadId, number> = { A: 4_000, B: 6_000, C: 6_000, M: 1_000 };

const BRANCH_OF_THREAD: Record<ThreadId, BranchId> = { A: 'a', B: 'b', C: 'c', M: 'm' };

/**
 * Engage un train (`traficX()` : le numéro du compteur avance de 2, ce qui
 * donne la numérotation impaire/paire par sens). `extraDelay` est l'attente
 * demandée par l'étape finale avant le rappel de `traficX()`.
 *
 * `num` impose le numéro au lieu de le prendre à la suite — une circulation
 * annoncée à la main au graphique. Le compteur est recalé dessus, si bien que
 * la suivante reprend la numérotation à partir d'elle : c'est ce que font déjà
 * les treize phases de scénario qui portent un `nums`.
 */
export function spawnTrain(
  s: PrsState,
  target: { thread: ThreadId; branch: BranchId; counter: TrainCounter; dest?: Dest; num?: number },
  now: number,
  extraDelay = 0,
): void {
  const { thread, branch, counter } = target;
  if (target.num === undefined) s.trainNum[counter] += 2;
  else s.trainNum[counter] = target.num;
  s.trainSeq += 1;
  s.trains.push({
    key: s.trainSeq,
    thread,
    branch,
    counter,
    step: 0,
    num: s.trainNum[counter],
    dueAt: now + extraDelay + SPAWN_DELAY[thread],
    stopped: false,
    cleared: false,
    running: false,
    overran: false,
    sawOpen: false,
    marche: true,
    auPas: null,
    dest: target.dest ?? null,
    wrongWay: false,
    restartOrder: false,
    auto: false,
    auto88: false,
    km: '',
    said: {},
  });
}

/**
 * Les quatre cases du graphique par lesquelles une circulation **entre** dans
 * le poste, et le fil qu'elle y prend.
 *
 * Les deux autres cases — `v1n1` et `v2dg` — sont des sorties : un train y est
 * inscrit une fois le poste franchi. On n'y annonce donc rien.
 *
 * `dest` reste nulle : une circulation annoncée à la main n'a pas de
 * destination imposée, elle suivra les aiguilles telles qu'elles seront
 * commandées à son passage. Les phases de scénario, elles, en fixent une —
 * `traficcb()` engage un train **qui va à DG** et refusera la voie mère.
 */
export const SAAT_ENTREES: Partial<
  Record<SaatCell, { thread: ThreadId; counter: TrainCounter; label: string }>
> = {
  v1ag: { thread: 'A', counter: 'v1a', label: 'voie 1 depuis AG' },
  v2n2: { thread: 'B', counter: 'v2', label: 'voie 2 depuis N2' },
  nu: { thread: 'C', counter: 'vcb', label: 'voie centrale' },
  vm: { thread: 'M', counter: 'vm', label: 'voie mère' },
};

/** Refus opposé à une annonce faite au graphique, ou `null` si elle passe. */
export type RefusAnnonce = 'case' | 'numero' | 'double';

/**
 * Annonce une circulation à la main, depuis le graphique.
 *
 * L'original n'offre pas ce geste : les six cases y sont de simples champs que
 * le trafic remplit et que l'aiguilleur peut corriger. Les remplir n'engage
 * rien — c'est `traficaa()` et ses sœurs qui créent les trains, appelées par
 * les scénarios ou par le trafic souple.
 *
 * L'annonce manuelle prolonge le geste sans le contredire : elle appelle la
 * même fonction d'engagement, sur le même fil, avec le numéro saisi. Le train
 * qui en naît est en tout point celui qu'un scénario aurait engagé — il
 * s'annonce, occupe la zone d'approche, bute au carré s'il est fermé.
 */
export function annoncerAuGraphique(
  s: PrsState,
  cell: SaatCell,
  saisie: string,
  now: number,
): RefusAnnonce | null {
  const entree = SAAT_ENTREES[cell];
  if (!entree) return 'case';
  const num = Number(saisie);
  if (!/^\d{6}$/.test(saisie) || !Number.isFinite(num)) return 'numero';
  if (s.trains.some((t) => t.num === num)) return 'double';
  // La case doit être libre : deux circulations ne s'annoncent pas au même
  // endroit. C'est la garde `libre` des phases de scénario.
  if (SAAT_CELLS.some((c) => c.id !== cell && s.saat[c.id] === saisie)) return 'double';

  spawnTrain(
    s,
    { thread: entree.thread, branch: BRANCH_OF_THREAD[entree.thread], counter: entree.counter, num },
    now,
  );
  logEvent(s, 'info', `Circulation ${num} annoncée à la main — ${entree.label}.`);
  return null;
}

/** Lance le trafic souple (`ltrafic()`). */
export function startTraffic(s: PrsState, now: number): void {
  s.traffic = true;
  s.trainNum = { ...TRAFFIC_START_NUM };
  s.trains = [];
  spawnTrain(s, { thread: 'A', branch: 'a', counter: 'v1a' }, now);
  spawnTrain(s, { thread: 'B', branch: 'b', counter: 'v2' }, now);
  logEvent(s, 'info', 'Lancement du trafic souple.');
}

/** Arrête le trafic : les trains en cours disparaissent. */
export function stopTraffic(s: PrsState): void {
  s.traffic = false;
  s.trains = [];
  logEvent(s, 'info', 'Fin du trafic.');
}

/** Prochaine échéance de trafic, ou `null` s'il n'y a rien en attente. */
export function nextTrafficDue(s: PrsState): number | null {
  let min: number | null = null;
  for (const t of s.trains) if (min == null || t.dueAt < min) min = t.dueAt;
  return min;
}

/** Nombre maximal d'étapes jouées par tick, garde-fou anti-boucle. */
const MAX_STEPS_PER_TICK = 200;

/**
 * Fait avancer tous les trains dont l'échéance est atteinte.
 * Retourne `true` si l'état a changé.
 */
export function advanceTraffic(s: PrsState, now: number): boolean {
  let changed = false;
  let budget = MAX_STEPS_PER_TICK;

  for (;;) {
    const t = s.trains.find((x) => x.dueAt <= now);
    if (!t || budget-- <= 0) break;
    changed = true;

    const branch = BRANCHES[t.branch];
    const step = branch[t.step];
    if (!step) {
      s.trains = s.trains.filter((x) => x !== t);
      continue;
    }

    readOrdre(s, t);
    const r = step.run(s, t);

    if (r.done) {
      const thread = t.thread;
      s.trains = s.trains.filter((x) => x !== t);
      // `delay` = attente avant le rappel de `traficX()`, qui ajoute encore
      // son propre délai d'engagement. En scénario, c'est la table des phases
      // qui engage les trains : pas de relance automatique.
      //
      // Seuls les fils A et B se relancent d'eux-mêmes (`tasept()` appelle
      // `trafica()`, `tbsept()` appelle `traficb()`). Une circulation de la
      // voie centrale n'existe que si un train s'y est garé, et une
      // circulation de la voie mère que si l'EP MOE l'a engagée : leurs
      // étapes de fin s'en chargent elles-mêmes quand il y a lieu.
      if (s.traffic && (thread === 'A' || thread === 'B')) {
        spawnTrain(s, { thread, branch: BRANCH_OF_THREAD[thread], counter: t.counter }, now, r.delay);
      }
      refreshState(s);
      continue;
    }

    if (typeof r.to === 'object') {
      t.branch = r.to.branch;
      t.step = r.to.step ?? 0;
    } else if (typeof r.to === 'number') {
      t.step = r.to;
    } else if (r.to !== 'stay') {
      t.step += 1;
    }
    t.dueAt = now + r.delay;
    refreshState(s);
  }

  return changed;
}

/**
 * Un train est-il effectivement immobilisé par l'arrêt accidentel ?
 *
 * L'original conditionne `arreacci = 2` (le dépannage) à la sortie du train
 * de la voie centrale — un fil non porté. On le conditionne ici à ce qui
 * compte vraiment : la panne doit avoir eu lieu. Sans cette garde, le
 * dépannage peut tomber pendant que le train est encore en approche, et la
 * panne ne se produit jamais.
 */
export function hasBrokenDownTrain(s: PrsState): boolean {
  return s.trains.some((t) => BRANCHES[t.branch][t.step]?.id === 'arraccia');
}

/** Libellé court de la position d'un train, pour le bandeau d'état. */
export function trainStatus(t: Train): string {
  const step = BRANCHES[t.branch][t.step];
  const where = step ? step.id : 'fin';
  return t.stopped ? `${t.num} — arrêté (${where})` : `${t.num} — ${where}`;
}
