// Moteur d'enclenchement du PRS de Springfield.
//
// Réimplémentation propre et déterministe de la logique de
// `PRS/construc/gaestro.js` (v3bis). L'original est un enchevêtrement de
// fonctions mutuellement récursives sur des globales ; on garde ici le
// **comportement observable** décrit dans `docs/springfield-prs-spec.md`
// (§4 à §8) mais exprimé en état immuable + fonctions pures.
//
// Correspondances avec l'original :
//   ffX()  → `formation()`      : manœuvre des aiguilles, verrouillage des zones
//   feX()  → `recomputeSignals()` : ouverture/fermeture des signaux
//   dX()   → `destroy()`
//   dtX()  → `startDmt()` / `tick()`
//   refreshza/zb/zc() → `recomputeZaps()`
//   disco()/fasndi()  → `recomputeDi()` / `acknowledgeDi()`
//
// Invariant capital : **`signals[s] === 0` signifie OUVERT**, `1` signifie
// FERMÉ. C'est la convention du code d'origine ; l'inverser casse tout
// silencieusement.

import {
  AIG_IDS,
  CORE_LOCKS,
  RELEASE_BLOCKERS,
  RELEASE_ORDER,
  GROUP_OF_AIG,
  REPLAY_ON_DESTROY,
  ROUTES,
  ROUTE_BY_ID,
  ROUTE_IDS,
  SIGNALS,
  SIGNAL_IDS,
  STATEFUL_ZONES,
  SWITCH_GROUPS,
  ZAPS,
  ZONES,
  routeFullLabel,
  routesConflict,
  TRANSIT_SUBSTITUTES,
} from './topology';
import {
  SAAT_ENTREES,
  TRAFFIC_START_NUM,
  advanceTraffic,
  annoncerAuGraphique,
  hasBrokenDownTrain,
  spawnTrain,
  startTraffic as startTrafficImpl,
  stopTraffic as stopTrafficImpl,
} from './traffic';
import type { BranchId, RefusAnnonce, Train } from './traffic';
import {
  SCENARIO_BY_ID,
  SPAWN_TARGET,
  formatRapelh,
  simSeconds,
  startSeconds,
} from './scenarios';
import type { PhaseGuard, TrainCounter } from './scenarios';
import type {
  AigId,
  AigPos,
  RouteDef,
  RouteId,
  SignalId,
  SignalState,
  ZapState,
  ZoneId,
  ZoneState,
} from './topology';

// ===== Dérangements ==========================================================

/** Clés du menu « dérangement de zone » (valeurs de `fderangmt()`). */
export type ZoneFaultKey = 'z79' | 'z81a' | 'z81b' | 'z82' | 'z83' | 'z84' | 'z89' | 'z8382';

export type AigFaultKind = 'noCtrlD' | 'noCtrlG' | 'elec';
export type SignalFaultKind = 'ro' | 'ex';
export type RouteFaultKind = 'formation' | 'destruction';

export interface Faults {
  zone: ZoneFaultKey | null;
  aig: { id: AigId; kind: AigFaultKind } | null;
  signal: { id: SignalId; kind: SignalFaultKind } | null;
  route: { id: RouteId; kind: RouteFaultKind } | null;
}

export const ZONE_FAULT_LABELS: Record<ZoneFaultKey, string> = {
  z79: 'z79',
  z81a: 'z81a',
  z81b: 'z81b',
  z82: 'z82',
  z83: 'z83',
  z84: 'z84',
  z89: 'z89',
  z8382: 'z82 + z83',
};

/**
 * Correspondance **pastille du TCO → zone réelle**.
 *
 * Deux nomenclatures cohabitent dans l'original, et il ne faut pas les
 * confondre :
 *
 * - les **pastilles** (`z81`, `z81bis`, `z81a`, `z81b`, `z81c`, `z81d`…) sont
 *   les voyants du tableau, nommés d'après les sprites `tco/*.gif` ;
 * - les **zones** sont les circuits de voie, nommés dans le menu
 *   `fderangmt()` : 79, 81a, 81b, 82, 83, 84, 89.
 *
 * Une zone allume plusieurs pastilles, selon le chemin emprunté — cf.
 * `fimm()` et les `t*quatren()` :
 * `z81b=2; if (cag81a=="d"){z81a=2;} if (cag81a=="g"){z81d=2;} if (cag83a=="g"){z81c=2;}`.
 * La zone **81a** est ainsi portée par les pastilles `z81` et `z81bis`, et la
 * zone **81b** par tout le faisceau `z81a`/`z81b`/`z81c`/`z81d`.
 *
 * Les pastilles absentes de cette table (`z80`, `z85`, `z86`, `z87`, `z88`)
 * sont des cantons de block sans dérangement au menu d'origine.
 */
export const ZONE_FAULT_OF_ZONE: Partial<Record<ZoneId, ZoneFaultKey>> = {
  z79: 'z79',
  z79b: 'z79',
  z81: 'z81a',
  z81bis: 'z81a',
  z81a: 'z81b',
  z81b: 'z81b',
  z81c: 'z81b',
  z81d: 'z81b',
  z82a: 'z82',
  z82b: 'z82',
  z82bb: 'z82',
  z82c: 'z82',
  z82d: 'z82',
  z82e: 'z82',
  z83a: 'z83',
  z83b: 'z83',
  z84: 'z84',
  z89: 'z89',
};

export const AIG_FAULT_LABELS: Record<AigFaultKind, string> = {
  noCtrlD: 'Absence de contrôle pour la direction de droite',
  noCtrlG: 'Absence de contrôle pour la direction de gauche',
  elec: 'Dérangement de la partie électrique de la commande',
};

export const SIGNAL_FAULT_LABELS: Record<SignalFaultKind, string> = {
  ro: "Raté d'ouverture",
  ex: 'Extinction',
};

export const ROUTE_FAULT_LABELS: Record<RouteFaultKind, string> = {
  formation: 'Raté de formation',
  destruction: 'Raté de destruction automatique',
};

// ===== État ==================================================================

export interface LogEntry {
  /** Compteur monotone, sert de clé React. */
  seq: number;
  level: 'info' | 'warn' | 'error';
  text: string;
}

/**
 * Ce que le poste met sous les yeux de l'aiguilleur, sans qu'il l'ait demandé.
 *
 * - `appel` : un conducteur au téléphone. Il attend une réponse.
 * - `incident` : un accident de circulation, qui **interrompt le trafic**.
 *
 * L'original passe les deux en `alert()` — 745 dans `gaestro.js` — et la modale
 * bloque tout jusqu'au clic. C'est brutal, mais c'est juste sur le fond : ni un
 * conducteur arrêté au carré ni un déraillement n'attendent qu'on veuille bien
 * les lire. Bloquer ne se transpose pourtant pas — le poste tourne ici sur une
 * horloge réelle, et deux trains peuvent appeler à la même minute.
 *
 * Ces messages ont donc leur canal, distinct du journal : ils s'affichent, et
 * se ferment un par un. Ils partent aussi au journal, qui reste la trace.
 */
export type MessageKind = 'appel' | 'incident';

export interface PosteMessage {
  /** Compteur monotone, sert de clé React et d'identifiant d'acquittement. */
  seq: number;
  kind: MessageKind;
  /** Circulation concernée. */
  num: number;
  /** Ce qu'il y a à lire. */
  text: string;
}

/** Messages affichés en même temps ; au-delà, on en écarte un. */
const MESSAGES_MAX = 4;

/**
 * Borne la file, en sacrifiant un **appel** de préférence à un incident.
 *
 * Un déraillement arrête le trafic mais pas les trains déjà en ligne : ils
 * continuent d'appeler. Sans cette règle, l'accident qui explique l'arrêt du
 * poste serait chassé de l'écran par les appels qu'il a lui-même provoqués.
 */
function bornerMessages(list: PosteMessage[]): PosteMessage[] {
  if (list.length <= MESSAGES_MAX) return list;
  const i = list.findIndex((m) => m.kind === 'appel');
  return i === -1 ? list.slice(-MESSAGES_MAX) : [...list.slice(0, i), ...list.slice(i + 1)];
}

export interface PrsState {
  zones: Record<ZoneId, ZoneState>;
  /** Contrôle perçu au poste. `0` = absence de contrôle. */
  aig: Record<AigId, AigPos | 0>;
  /** Commande enregistrée (position demandée). */
  cag: Record<AigId, AigPos>;
  /** Position réelle au terrain. */
  lev: Record<AigId, AigPos>;
  /** `0` = commande moteur ; `'g'`/`'d'` = calée en manœuvre à main. */
  mm: Record<AigId, AigPos | 0>;

  /** État réel des signaux (0 = ouvert, 1 = fermé). */
  signals: Record<SignalId, SignalState>;
  /**
   * État **affiché** sur le TCO. Diffère de `signals` en cas de raté
   * d'ouverture ou d'extinction : le tableau ment à l'aiguilleur.
   */
  signalsDisplay: Record<SignalId, SignalState>;

  established: Record<RouteId, boolean>;
  /** Compteur d'état du bouton, 0 à 6 — cf. spec §4.2. */
  b: Record<RouteId, number>;

  zap: Record<'zap81' | 'zap82' | 'zap84', ZapState>;
  /** Mémoire d'ouverture de carré. */
  /**
   * Mémoire d'ouverture des carrés. `kit88` existe dans le source mais n'y est
   * **jamais lu** — écrit par `fenuam()` et `dnuam()`, consulté nulle part :
   * on ne le porte pas.
   */
  kit: Record<'81' | '82' | '84', 0 | 1>;

  /**
   * Pédales des carrés : 0 au repos, 1 armée à l'ouverture du signal, 2 une
   * fois franchie par le train. `pedNN == 2` **purge l'enclenchement
   * d'approche** — le train est passé, il n'y a plus rien à protéger.
   */
  ped: Record<'81' | '82' | '84' | '85', 0 | 1 | 2>;

  /**
   * Un train est-il présent sur la voie centrale / la voie mère
   * (`trpresvc` / `trpresvm`) ?
   *
   * Posés quand un train s'y gare, effacés quand il en repart. Ils servent au
   * **nez-à-nez** : un train envoyé sur une voie déjà occupée ne peut plus
   * s'arrêter (`tacsix()`, `tmcsix()`, `tcmseptn()`).
   */
  trpresvc: boolean;
  trpresvm: boolean;

  /**
   * Voie mère automatique du trafic souple — `ffaum()` :
   * `vaum1 = setTimeout("traficautom()", 10000)`.
   *
   * Dix secondes après la pose de l'Au.M, si la voie mère est libre, l'EP MOE
   * saisit l'autorisation : le voyant s'éteint (`vaum = 2`), un train est
   * engagé trois secondes plus tard, et douze secondes après le voyant
   * revient tandis que l'autorisation tombe (`traficautomd()`).
   */
  aumAutoAt: number | null;
  aumAutoEndAt: number | null;

  /**
   * Clé Main-Moteur retirée. `quXX()` n'ouvre la vue terrain que sous
   * `clemm == 1` : sans la clé, aucune aiguille ne se cale ni ne se renverse
   * à main.
   */
  clemm: boolean;

  /**
   * Graphique de circulation — le **S.A.A.T.** du poste d'origine.
   *
   * Un schéma de la gare portant six cases, une par tronçon, où s'inscrit le
   * numéro du train présent ou attendu. Ce n'est pas un simple affichage : le
   * simulateur d'origine y lit l'état de la circulation en 291 endroits, les
   * scénarios s'en servant de mémoire pour décider du train suivant et des
   * incidents.
   *
   * Correspondance avec les champs du formulaire `saat` :
   * `vm` = case0 · `v1ag` = case1 · `v1n1` = case3 · `nu` = casec ·
   * `v2dg` = case4 · `v2n2` = case2.
   */
  saat: Record<SaatCell, string>;

  /**
   * Mode de pose des dispositifs, variables `da` et `dr` de `dispda()` :
   * `null` en marche normale, sinon la nature du dispositif et le sens.
   * En mode **retrait**, un bouton dépourvu de dispositif se commande
   * normalement — `if (da==2) { if ((disp1==0)&&(dispr1==0)){fagnida();}
   * else {ragnida();} }`.
   */
  dispMode: null | { kind: DispositifKind; delta: 1 | -1 };

  /** Voyant de dérangement d'isolement : 0 éteint, 1 clignotant, 2 acquitté. */
  di: 0 | 1 | 2;

  annv1: boolean;
  annv2: boolean;

  /** Annulateurs de transit : armés / annulation active. Index 0..2 = ATR 1..3. */
  atrArmed: [boolean, boolean, boolean];
  atrAnnul: [boolean, boolean, boolean];
  /** Compteur de coupons plombés consommés (démarre à 3 dans l'original). */
  coupons: number;
  /** Échéance de purge automatique de l'ATR 1 (20 s). */
  atr1PurgeAt: number | null;

  /** Boutons de fermeture de carré maintenus. */
  fc: Record<'c81' | 'c82' | 'c84', boolean>;

  testAig: boolean;
  testZones: boolean;
  /**
   * Bouton `S 81` (`fsub()`) : ouverture de substitution du carré 81 pour
   * AG-NU. Verrou persistant, qui tombe dès qu'une zone du parcours s'occupe
   * ou que le bouton de fermeture est enfoncé.
   */
  bs81: boolean;

  /** Disponibilité de l'autorisation AU-M (1 = disponible). */
  vaum: 1 | 2;
  /** Autorisation d'accès accordée par l'EP MOE (requise pour C84 / NU-AM). */
  vauac: 0 | 1;
  /** Échéance d'octroi automatique de `vauac` (10 s après NU-AM). */
  vauacDueAt: number | null;

  /** Dispositifs d'attention / de réflection posés, par itinéraire. */
  da: Record<RouteId, number>;
  dr: Record<RouteId, number>;
  /**
   * Dispositifs de sécurité pour agents.
   *
   * Le poste d'origine n'en connaît que deux — `disp1` (D.A) et `dispr1`
   * (D.R) — et son menu « Dispositifs divers » n'offre que ces deux-là. Le
   * D.S.A est un **ajout** du portage : même mécanique, même plafond commun.
   */
  dsa: Record<RouteId, number>;

  faults: Faults;

  /** Destruction manuelle temporisée en cours. */
  dmt: { route: RouteId; dueAt: number } | null;

  /** Génération du poste : 0 = 2ᵉ (défaut), 1 = 1ʳᵉ. Change le sort de la D.M.T. */
  genPrs: 0 | 1;

  /**
   * Coupe-son global (`rapelson` dans la frame `tete`). Les cinq sons de
   * l'original sont conditionnés par ce drapeau (`if (rapelson == 1)`).
   */
  sound: boolean;
  /**
   * Compteurs de sons **ponctuels** : le détonateur (`dsodeto()`) et le gong
   * d'annonce voie 2 (`dsogong()`). L'état étant immuable, un déclenchement
   * s'exprime par un compteur qui s'incrémente ; la couche audio joue le son
   * quand la valeur change.
   */
  sfx: { deto: number; gong: number; derail: number };
  /**
   * Alerte radio en cours (`dsoalert()` / `fsoalert()`) : sirène en boucle.
   * Posée par le scénario sn4, levée par le régulateur.
   */
  alerteRadio: boolean;

  /**
   * Bulletin **Cba** transmis et pas encore pris en compte — `bcba` /
   * `bcba88`, `train`, `signal` et `nocba` de l'original (§10 de la spec).
   * C'est le seul document qui autorise un conducteur à franchir un carré
   * fermé, et le seul qui relève un train l'ayant déjà franchi.
   */
  cba: {
    /** Numéro d'autorisation. L'original démarre à 440 et imprime `nocba + 1`. */
    no: number;
    /** Bulletin en attente de prise en compte par son destinataire. */
    pending: boolean;
    /** Le bulletin vise le Cv 88 et non un carré (`bcba88`). */
    forCv88: boolean;
    train: number;
    /** Signal visé, normalisé : 81, 82, 84, 85, 88 — `0` si non reconnu. */
    signal: number;
    /** Nature retenue : carré (sinon guidon d'arrêt). */
    carre: boolean;
    /** Mode de transmission retenu (`trans`). */
    trans: string;
  };

  /**
   * Imprimé « Ordre / Avis » transmis et pas encore collationné par son
   * destinataire — `com` et `train2` de l'original (§10 de la spec).
   */
  ordre: {
    /** Numéro de l'imprimé ; démarre à 11 (`noordr`). */
    no: number;
    /**
     * Masque des propositions retenues, `propo()` :
     * `com1 + 10·com2 + 100·com3 + 1000·com4`.
     * `0` = aucun ordre en attente.
     */
    com: number;
    /** Numéro du train destinataire (`train2`). */
    train: number;
    /** Aiguille à franchir au pas (`aigpas`), proposition 3. */
    aigpas: AigId | null;
  };

  /**
   * Arrêt accidentel en cours (`arreacci` du scénario 3) :
   * `0` aucun · `1` le train va s'immobiliser en pleine voie ·
   * `2` le conducteur a dépanné et attend des instructions.
   */
  accidentalStop: 0 | 1 | 2;

  /** Trafic souple en cours (`btrafic`). */
  traffic: boolean;
  /** Circulations en cours — cf. `src/prs/traffic.ts`. */
  trains: Train[];
  /** Compteur de clés de train. */
  trainSeq: number;
  /** Numéros de circulation courants, un compteur par fil (`trainv1a`…). */
  trainNum: Record<TrainCounter, number>;
  /**
   * Dernière circulation à avoir dégagé le poste, par fil — `dtrainv1` et
   * `dtrainv2`, que `tasixbis()`, `tacsept()` et `tbsix()` posent au numéro du
   * train qui vient de passer. Les gardes de phase s'y réfèrent pour savoir si
   * la voie est prête à recevoir la suivante.
   */
  dtrain: { v1: number; v2: number };
  /**
   * Scénario en cours : heure de départ de l'horloge simulée, instant réel du
   * lancement, et suivi des phases (les gardes `phaa..phaz` de l'original,
   * dont les trois valeurs se retrouvent ici : 0 = à venir, 1 = armée,
   * 2 = armée et refusée au moins une fois).
   */
  scenario: {
    id: string;
    startSec: number;
    startedAt: number;
    /** Phase jouée : son train est engagé. */
    fired: Record<string, true>;
    /**
     * Phase dont l'heure est venue mais que sa garde n'a pas encore laissée
     * passer. L'original la represente toutes les dix secondes ; ici elle
     * reste candidate à chaque tick.
     */
    armed: Record<string, true>;
    /** Phase dont la garde a déjà refusé : son train partira avec 20 s de retard. */
    retarde: Record<string, true>;
    incidentAt: number | null;
    /** Guetteur d'alerte radio armé (sn4) : instant à partir duquel il veille. */
    alertArmedAt: number | null;
    /** Échéance de levée de l'alerte radio par le régulateur. */
    alertUntil: number | null;
    /** Échéance du dépannage, pour l'arrêt accidentel (`scaphce()`). */
    repairAt: number | null;
  } | null;

  log: LogEntry[];
  logSeq: number;
  /** Ce que le poste signale, en attente de lecture. */
  messages: PosteMessage[];
}

/** Plafond cumulé des dispositifs posés sur un même bouton (rectif v2). */
export const DISPOSITIF_MAX = 4;

/**
 * Les trois dispositifs qu'un bouton peut porter.
 *
 * `magnida()` : `disp1++; dar1 = disp1 + dispr1; if (dar1 > 4) {disp1--;}` —
 * le plafond est **commun**, pas par type. Le D.S.A s'y ajoute de la même
 * façon.
 */
export type DispositifKind = 'da' | 'dr' | 'dsa';

export const DISPOSITIF_LABELS: Record<DispositifKind, string> = {
  da: 'D.A',
  dr: 'D.R',
  dsa: 'D.S.A',
};

/** Les six cases du graphique de circulation, d'amont en aval. */
export type SaatCell = 'vm' | 'v1ag' | 'v1n1' | 'nu' | 'v2dg' | 'v2n2';

export const SAAT_CELLS: { id: SaatCell; label: string; origine: string }[] = [
  { id: 'vm', label: 'Voie mère', origine: 'case0' },
  { id: 'v1ag', label: 'Voie 1 — côté AG', origine: 'case1' },
  { id: 'v1n1', label: 'Voie 1 — côté N1', origine: 'case3' },
  { id: 'nu', label: 'Voie NU', origine: 'casec' },
  { id: 'v2dg', label: 'Voie 2 — côté DG', origine: 'case4' },
  { id: 'v2n2', label: 'Voie 2 — côté N2', origine: 'case2' },
];

const EMPTY_FAULTS: Faults = { zone: null, aig: null, signal: null, route: null };

function zeroBy<K extends string, V>(keys: readonly K[], v: V): Record<K, V> {
  return Object.fromEntries(keys.map((k) => [k, v])) as Record<K, V>;
}

export function createInitialState(): PrsState {
  return {
    zones: zeroBy(STATEFUL_ZONES, 0 as ZoneState),
    // Positions initiales relevées en tête de `gaestro.js` : le couple 81/82
    // à droite, les couples 83/85 à gauche.
    aig: { aig81a: 'd', aig81b: 'd', aig82: 'd', aig83a: 'g', aig83b: 'g', aig85a: 'g', aig85b: 'g' },
    cag: { aig81a: 'd', aig81b: 'd', aig82: 'd', aig83a: 'g', aig83b: 'g', aig85a: 'g', aig85b: 'g' },
    lev: { aig81a: 'd', aig81b: 'd', aig82: 'd', aig83a: 'g', aig83b: 'g', aig85a: 'g', aig85b: 'g' },
    mm: zeroBy(AIG_IDS, 0 as AigPos | 0),
    signals: zeroBy(SIGNAL_IDS, 1 as SignalState),
    signalsDisplay: zeroBy(SIGNAL_IDS, 1 as SignalState),
    established: zeroBy(ROUTE_IDS, false),
    b: zeroBy(ROUTE_IDS, 0),
    zap: { zap81: 0, zap82: 0, zap84: 0 },
    kit: { '81': 0, '82': 0, '84': 0 },
    ped: { '81': 0, '82': 0, '84': 0, '85': 0 },
    trpresvc: false,
    trpresvm: false,
    aumAutoAt: null,
    aumAutoEndAt: null,
    clemm: false,
    saat: { vm: '', v1ag: '', v1n1: '', nu: '', v2dg: '', v2n2: '' },
    dispMode: null,
    di: 0,
    annv1: false,
    annv2: false,
    atrArmed: [false, false, false],
    atrAnnul: [false, false, false],
    coupons: 3,
    atr1PurgeAt: null,
    fc: { c81: false, c82: false, c84: false },
    testAig: false,
    testZones: false,
    bs81: false,
    vaum: 1,
    vauac: 0,
    vauacDueAt: null,
    da: zeroBy(ROUTE_IDS, 0),
    dr: zeroBy(ROUTE_IDS, 0),
    dsa: zeroBy(ROUTE_IDS, 0),
    faults: { ...EMPTY_FAULTS },
    dmt: null,
    genPrs: 0,
    accidentalStop: 0,
    cba: { no: 441, pending: false, forCv88: false, train: 0, signal: 0, carre: true, trans: '' },
    ordre: { no: 11, com: 0, train: 0, aigpas: null },
    sound: true,
    sfx: { deto: 0, gong: 0, derail: 0 },
    alerteRadio: false,
    traffic: false,
    trains: [],
    trainSeq: 0,
    trainNum: { ...TRAFFIC_START_NUM },
    dtrain: { v1: 0, v2: 0 },
    scenario: null,
    log: [],
    logSeq: 0,
    messages: [],
  };
}

// ===== Utilitaires ===========================================================

function clone(s: PrsState): PrsState {
  return {
    ...s,
    zones: { ...s.zones },
    aig: { ...s.aig },
    cag: { ...s.cag },
    lev: { ...s.lev },
    mm: { ...s.mm },
    signals: { ...s.signals },
    signalsDisplay: { ...s.signalsDisplay },
    established: { ...s.established },
    b: { ...s.b },
    zap: { ...s.zap },
    ped: { ...s.ped },
    saat: { ...s.saat },
    kit: { ...s.kit },
    atrArmed: [...s.atrArmed] as [boolean, boolean, boolean],
    atrAnnul: [...s.atrAnnul] as [boolean, boolean, boolean],
    fc: { ...s.fc },
    da: { ...s.da },
    dr: { ...s.dr },
    dsa: { ...s.dsa },
    faults: { ...s.faults },
    cba: { ...s.cba },
    ordre: { ...s.ordre },
    sfx: { ...s.sfx },
    trains: s.trains.map((t) => ({ ...t, said: { ...t.said } })),
    trainNum: { ...s.trainNum },
    dtrain: { ...s.dtrain },
    scenario: s.scenario
      ? {
          ...s.scenario,
          fired: { ...s.scenario.fired },
          armed: { ...s.scenario.armed },
          retarde: { ...s.scenario.retarde },
        }
      : null,
    log: s.log,
    messages: s.messages,
  };
}

/** @internal — exposé pour le moteur de trafic. */
export function logEvent(s: PrsState, level: LogEntry['level'], text: string): void {
  log(s, level, text);
}

/**
 * Un conducteur appelle le poste.
 *
 * L'appel va au journal **et** dans la file des appels : la trace d'un côté,
 * la boîte de dialogue de l'autre. Le compteur du journal sert aux deux, si
 * bien qu'un appel et sa ligne de journal portent le même numéro.
 */
export function logAppel(s: PrsState, num: number, text: string, complet = false): void {
  // `complet` : les répliques que `dial()` et `dialv()` composent portent déjà
  // leur ouverture — « Bonjour, ici le conducteur du 135872… » — et ne prennent
  // pas le préfixe du journal.
  log(s, 'warn', complet ? text : `Conducteur du ${num} — ${text}`);
  s.messages = bornerMessages([...s.messages, { seq: s.logSeq, kind: 'appel', num, text }]);
}

/**
 * Un accident de circulation.
 *
 * Cinq en tout, et rien d'autre : **déraillement**, **talonnage**, **nez-à-nez**
 * — qui arrêtent le trafic, laissant sans cela le poste s'immobiliser sans que
 * rien n'en dise la raison — et les deux **franchissements de carré fermé**, au
 * C 81 et au Cv 85, où le détonateur claque sous un train qui ne pouvait plus
 * s'arrêter.
 *
 * Le détonateur du C 84 n'en est pas : il claque sur un franchissement
 * **autorisé**, en marche à vue sur bulletin, et l'original ne le journalise
 * même pas. Le poste ne signale que l'accident, pas la procédure.
 */
export function logIncident(s: PrsState, num: number, text: string): void {
  log(s, 'error', text);
  s.messages = bornerMessages([...s.messages, { seq: s.logSeq, kind: 'incident', num, text }]);
}

/** L'aiguilleur a pris le message : il quitte l'écran, pas le journal. */
export function acquitterMessage(state: PrsState, seq: number): PrsState {
  const s = clone(state);
  s.messages = s.messages.filter((m) => m.seq !== seq);
  return s;
}

function log(s: PrsState, level: LogEntry['level'], text: string): void {
  s.logSeq += 1;
  // Journal borné : on ne conserve que les 60 dernières lignes.
  s.log = [{ seq: s.logSeq, level, text }, ...s.log].slice(0, 60);
}

const opposite = (p: AigPos): AigPos => (p === 'g' ? 'd' : 'g');

/** Zone maîtresse d'une pastille (les miroirs suivent leur zone porteuse). */
export function masterZone(id: ZoneId): ZoneId {
  const def = ZONES.find((z) => z.id === id);
  return def?.mirrors ?? id;
}

/** État affiché d'une pastille, en tenant compte du test des zones. */
export function displayedZoneState(s: PrsState, id: ZoneId): ZoneState {
  const v = s.zones[masterZone(id)];
  // `testz()` : maintien du bouton → toutes les zones libres s'allument en blanc.
  if (s.testZones && v === 0) return 1;
  return v;
}

// ===== Enclenchement de transit ==============================================

/**
 * Un groupe d'aiguilles est manœuvrable si aucune de ses zones de garde
 * n'est prise, sauf annulateur de transit correspondant actionné.
 */
function groupIsFree(s: PrsState, groupId: string, r: RouteDef): boolean {
  const g = SWITCH_GROUPS.find((x) => x.id === groupId);
  if (!g) return true;

  // `ffamni`, `ffamnu` et `ffnuam` — les trois itinéraires qui ramènent les
  // aiguilles 85 vers la voie mère — portent une clause de plus sur la zone 89 :
  // `(z89==0)||((bannul1==1)&&(tannzii==1)&&(aum!=1))`. Une autorisation de
  // mouvement EP MOE en cours ferme donc l'échappatoire par l'annulateur 1,
  // sans interdire la manœuvre quand la zone est libre.
  const towardsVoieMere = r.switches.aig85a === 'd';

  for (const guard of g.guards) {
    const free = s.zones[guard.zone] === 0;
    let released = s.atrAnnul[guard.releasedBy - 1];
    if (released && guard.zone === 'z89' && towardsVoieMere && s.established.aum) {
      released = false;
    }
    if (!free && !released) return false;
  }
  if (g.blockedByAmOnZ81) {
    const amEstablished = s.established.amni || s.established.amnu;
    if (amEstablished && s.zones.z81 !== 0) return false;
  }
  return true;
}

// ===== Voyant de dérangement d'isolement =====================================

function recomputeDi(s: PrsState): void {
  const anyLost = AIG_IDS.some((a) => s.aig[a] === 0);
  if (!anyLost) {
    s.di = 0;
    return;
  }
  // Un dérangement déjà acquitté (2) le reste tant qu'il dure.
  if (s.di !== 2) s.di = 1;
}

/** Bouton `asndi` : acquitte la sonnerie, le voyant passe du clignotant au fixe. */
export function acknowledgeDi(state: PrsState): PrsState {
  const s = clone(state);
  if (s.di === 1) {
    s.di = 2;
    log(s, 'info', 'Sonnerie de dérangement acquittée — voyant DI fixe.');
  }
  return s;
}

// ===== Signaux ===============================================================

type KitKey = keyof PrsState['kit'];

/** Signal → mémoire d'ouverture correspondante (`kit81`, `kit82`…). */
const KIT_OF_SIGNAL: Partial<Record<SignalId, KitKey>> = {
  c81: '81',
  c82: '82',
  c84: '84',
};

/**
 * Pédale associée à chaque signal.
 *
 * Ce n'est **pas** la même table que `KIT_OF_SIGNAL` : le Cv 85 a bien une
 * pédale (`ped85`, posée par `feamni()` / `feamnu()`, franchie par les
 * étapes du fil voie mère) mais **pas** de mémoire d'ouverture `kitNN`.
 */
const PED_OF_SIGNAL: Partial<Record<SignalId, PedKey>> = {
  c81: '81',
  c82: '82',
  c84: '84',
  cv85: '85',
};

type PedKey = '81' | '82' | '84' | '85';

/**
 * `kitNN = 0` en tête de chaque `dX()` : la destruction de l'itinéraire efface
 * la mémoire d'ouverture de son carré. `dnuam()` en efface deux (84 et 88).
 */
function clearKit(s: PrsState, r: RouteDef): void {
  const key = r.signal ? KIT_OF_SIGNAL[r.signal] : undefined;
  if (key) s.kit[key] = 0;
}

/**
 * Conditions de **maintien** du bouton `S 81` (`fsub()`, 2ᵉ clause) : le
 * verrou tombe dès qu'une zone du parcours AG-NU s'occupe ou que le bouton de
 * fermeture du carré est enfoncé.
 */
function s81Holds(s: PrsState): boolean {
  return (
    s.established.agnu &&
    !s.fc.c81 &&
    s.zones.z81 !== 2 &&
    s.zones.z81b !== 2 &&
    s.zones.z83b !== 2 &&
    s.aig.aig81a === 'd' &&
    s.aig.aig83a === 'd' &&
    s.aig.aig83b === 'd'
  );
}

/**
 * Bouton `S 81` — ouverture de substitution du carré 81 sur AG-NU
 * (`fsub()`, `gaestro.js:372`). Il n'agit qu'avec une approche décelée et
 * l'itinéraire AG-NU formé ; il pose alors la mémoire d'ouverture `kit81`.
 */
export function pressS81(state: PrsState): PrsState {
  const s = clone(state);
  const approach = s.annv1 || s.zones.z79 === 2;
  if (!approach || !s81Holds(s)) {
    log(s, 'warn', 'S 81 — conditions non réunies : AG-NU formé, approche décelée, parcours libre.');
    return s;
  }
  s.bs81 = true;
  log(s, 'info', 'S 81 — ouverture de substitution du carré 81 sur AG-NU.');
  refresh(s);
  return s;
}

/** Conditions d'ouverture propres à un itinéraire (partie « géométrie »). */
function openConditionsMet(s: PrsState, r: RouteDef): boolean {
  for (const z of r.openNeedsFree) {
    if (s.zones[z] === 2) return false;
  }
  for (const [aig, pos] of Object.entries(r.openNeedsSwitches) as [AigId, AigPos][]) {
    if (s.aig[aig] !== pos) return false;
  }
  return true;
}

/**
 * Recalcule l'état de tous les signaux. Équivalent d'un appel groupé à tous
 * les `feX()` : un signal est ouvert dès qu'un itinéraire établi qui
 * l'emprunte réunit ses conditions, et refermé sinon.
 *
 * L'ordre compte : `Cv88` conditionne `C84`, qui conditionne `Cv85`.
 */
function recomputeSignals(s: PrsState): void {
  // Le verrou S 81 tombe de lui-même quand ses conditions ne sont plus réunies.
  if (s.bs81 && !s81Holds(s)) s.bs81 = false;

  const order: SignalId[] = ['cv88', 'c84', 'cv85', 'c81', 'c82', 'cv83'];

  for (const sig of order) {
    let open = false;

    if (sig === 'cv88') {
      // Le Cv 88 ne se calcule pas comme les autres : `fenuam()` ne teste son
      // ouverture **que s'il est fermé**, et sa condition d'ouverture est bien
      // plus légère que celle du C 84 qui le suit.
      //
      // ```js
      // if ((aig85a!="d")||(aig85b!="d")){cv88=1;kit88=0;}
      // if (cv88==1) {
      //   if ((nuam==1)&&(bnuam==1)&&(z81b!=0)&&(aig85a=="d")&&(aig85b=="d")
      //      &&((amnu!=1)||((bamnu!=1)&&(bamnu!=2)&&(z89!=2)&&(z81!=2)))) {cv88=0;}
      //   else {cv88=1;kit88=0;}
      // }
      // // dnuam()
      // if ((nuam==0)||((bnuam==0)&&(z81b!=2)&&(z83b!=2))) {kit88=0;cv88=1;}
      // ```
      //
      // Il **reste donc ouvert** tant que le couple 85 tient sa position et
      // que NU-AM n'est pas retombé — z81b peut se libérer entre-temps sans le
      // refermer.
      const doitFermer =
        s.aig.aig85a !== 'd' ||
        s.aig.aig85b !== 'd' ||
        !s.established.nuam ||
        (s.b.nuam === 0 && s.zones.z81b !== 2 && s.zones.z83b !== 2);

      const peutOuvrir =
        s.established.nuam &&
        s.b.nuam === 1 &&
        s.zones.z81b !== 0 &&
        // Enclenchement de sens contraire : un AM-NU en cours de commande
        // interdit l'ouverture, sauf s'il a lâché ses zones.
        (!s.established.amnu ||
          (s.b.amnu !== 1 && s.b.amnu !== 2 && s.zones.z89 !== 2 && s.zones.z81 !== 2));

      if (doitFermer) open = false;
      else if (s.signals.cv88 === 0) open = true;
      else open = peutOuvrir;
    } else {
      for (const r of ROUTES) {
        if (r.signal !== sig) continue;
        if (!s.established[r.id] || s.b[r.id] !== 1) continue;
        if (!openConditionsMet(s, r)) continue;

        // Conditions croisées propres à certains itinéraires.
        if (r.id === 'nuam') {
          if (s.signals.cv88 !== 0) continue; // Cv88 doit être ouvert
          if (s.vauac !== 1) continue; // autorisation d'accès EP MOE
        }
        if (r.id === 'amnu') {
          if (s.signals.cv88 !== 1 || s.signals.c84 !== 1 || s.kit['84'] === 1) continue;
        }
        open = true;
        break;
      }
    }

    // Ouverture de substitution par le bouton S 81, hors conditions normales.
    if (sig === 'c81' && s.bs81) open = true;

    // Bouton de fermeture de carré maintenu.
    if ((sig === 'c81' || sig === 'c82' || sig === 'c84') && s.fc[sig]) open = false;

    let actual: SignalState = open ? 0 : 1;
    let displayed: SignalState = actual;

    // Dérangements de signal : le TCO peut mentir.
    const f = s.faults.signal;
    if (f && f.id === sig) {
      if (f.kind === 'ro' || f.kind === 'ex') {
        // Raté d'ouverture / extinction : commandé ouvert, resté fermé au
        // terrain, mais affiché ouvert au tableau.
        if (open) {
          actual = 1;
          displayed = 0;
        }
      }
    }

    s.signals[sig] = actual;
    s.signalsDisplay[sig] = displayed;

    // Mémoire d'ouverture de carré (`kitNN`). Ce n'est **pas** un miroir de
    // l'état courant : `feX()` la pose à 1 dès que le carré est commandé
    // ouvert — y compris sous raté d'ouverture, où le signal reste fermé au
    // terrain — et seul `dX()` l'efface (`clearKit`). C'est cette mémoire qui
    // empêche de libérer un enclenchement d'approche en refermant simplement
    // le carré.
    const kitKey = KIT_OF_SIGNAL[sig];
    if (kitKey && open) s.kit[kitKey] = 1;

    // `feX()` arme la pédale en même temps qu'il pose la mémoire d'ouverture.
    // Le Cv 85 n'a pas de `kitNN` mais a bien une pédale : `feamni()` et
    // `feamnu()` posent `ped85 = 1`.
    const pk = PED_OF_SIGNAL[sig];
    if (open && pk && s.ped[pk] === 0) s.ped[pk] = 1;
  }

  // `fsub()` annule la substitution dès qu'un dérangement pèse sur le C 81 :
  // `if (dergmts=="rfc81") {…bs81=0;}` et de même pour `ro` et `ex`. On la
  // lève **après** le calcul, pour que la passe en cours affiche encore le
  // mensonge du TCO comme le fait `fsub()` avant de remettre `bs81` à zéro.
  if (s.bs81 && s.faults.signal?.id === 'c81') s.bs81 = false;
}

// ===== Zones d'approche ======================================================

/**
 * Recalcul des enclenchements d'approche — transcription de `refreshza()`,
 * `refreshzb()` et `refreshzc()`, qui ont exactement la même forme.
 *
 * `zap` est un **verrou à mémoire**, pas une fonction de l'état courant :
 *   0 — pas d'approche décelée ;
 *   1 — approche enclenchée : l'itinéraire ne se détruit que par D.M.T. ;
 *   2 — approche décelée mais libérable.
 *
 * Le pivot est `kitNN` : si le carré **a été ouvert** devant le train annoncé,
 * le refermer ne libère pas l'enclenchement (`else {zap=1}`) — il faut la
 * temporisation. Tant qu'il n'a jamais été ouvert (`kit == 0`), l'approche
 * reste libérable.
 */
function recomputeZaps(s: PrsState): void {
  for (const z of ZAPS) {
    const occupied = z.triggerZones.some((zone) => s.zones[zone] === 2);
    const announced = z.annonce ? s[z.annonce] : false;
    const approach = occupied || announced;
    const kitKey = KIT_OF_SIGNAL[z.signal];
    const kit = kitKey ? s.kit[kitKey] : 0;
    // Un itinéraire empruntant ce signal est-il encore commandé (`bX == 1`) ?
    const commanded = ROUTES.some((r) => r.signal === z.signal && s.b[r.id] === 1);

    if (!approach) s.zap[z.id] = 0;

    if (s.signals[z.signal] === 0) {
      if (approach) s.zap[z.id] = 1;
    } else {
      // `if (((zap81!=1)||(ped81==2)) && approche)` : une pédale franchie
      // purge l'enclenchement même s'il était armé.
      const pedKey = PED_OF_SIGNAL[z.signal];
      const franchie = pedKey ? s.ped[pedKey] === 2 : false;
      if (approach && (s.zap[z.id] !== 1 || franchie)) s.zap[z.id] = 2;
      if (approach && commanded) s.zap[z.id] = kit === 0 ? 2 : 1;
    }

    // Clause propre à `refreshza()` : AG-NU dont la destination NU est occupée,
    // carré jamais ouvert, reste libérable — sauf ouverture de substitution en
    // cours (`bs81 == 0` dans l'original).
    if (
      z.id === 'zap81' &&
      s.zap.zap81 === 1 &&
      s.zones.z84 === 2 &&
      s.zones.z81b === 1 &&
      s.b.agnu === 1 &&
      kit === 0 &&
      !s.bs81
    ) {
      s.zap.zap81 = 2;
    }
  }
}

/** Recalcul complet des sorties dépendantes de l'état. */
/** @internal — exposé pour le moteur de trafic. */
export function refreshState(s: PrsState): void {
  refresh(s);
}

function refresh(s: PrsState): void {
  recomputeSignals(s);
  recomputeZaps(s);
  recomputeDi(s);
}

// ===== Formation / destruction ==============================================

/** Itinéraires établis incompatibles avec `r`. */
function conflictingEstablished(s: PrsState, r: RouteDef): RouteDef[] {
  return ROUTES.filter((o) => s.established[o.id] && routesConflict(r, o));
}

/**
 * Zone retenue par un transit **nommé** au moment où `detruit` la rend.
 *
 * Ce n'est pas « tenue par n'importe quel autre itinéraire » : les `dX()`
 * citent des transits précis, zone par zone, et laissent la plupart des zones
 * sans réserve — voir `RELEASE_BLOCKERS`. Une règle générique rendrait le port
 * plus strict que le poste.
 */
function heldByOther(s: PrsState, zone: ZoneId, detruit: RouteId): boolean {
  const blockers = RELEASE_BLOCKERS[detruit][zone];
  if (!blockers) return false;
  return blockers.some((o) => o !== detruit && s.established[o]);
}

/**
 * Manœuvre des aiguilles + verrouillage des zones (équivalent `ffX()`).
 * Retourne `true` si l'itinéraire s'est formé, `false` s'il est refusé.
 */
/** @internal — équivalent `ffX()`, exposé pour la reformation des T.P. */
export function formRoute(s: PrsState, r: RouteDef): boolean {
  return formation(s, r);
}

function formation(s: PrsState, r: RouteDef): boolean {
  // — 1. Manœuvre des aiguilles, groupe par groupe.
  const byGroup = new Map<string, [AigId, AigPos][]>();
  for (const [aig, pos] of Object.entries(r.switches) as [AigId, AigPos][]) {
    const g = GROUP_OF_AIG[aig];
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push([aig, pos]);
  }

  for (const [groupId, members] of byGroup) {
    const alreadyPlaced = members.every(([aig, pos]) => s.cag[aig] === pos);
    if (alreadyPlaced) continue;
    if (!groupIsFree(s, groupId, r)) {
      // Enclenchement de transit : la manœuvre est interdite, l'aiguille
      // reste où elle est. Le test final tranchera.
      continue;
    }
    for (const [aig, pos] of members) {
      const previousLev = s.lev[aig];
      s.cag[aig] = pos;
      s.lev[aig] = pos;
      s.aig[aig] = pos;

      // Dérangement d'aiguille.
      const fa = s.faults.aig;
      if (fa && fa.id === aig) {
        const blocks =
          (fa.kind === 'noCtrlD' && pos === 'd') ||
          (fa.kind === 'noCtrlG' && pos === 'g') ||
          fa.kind === 'elec';
        if (blocks) {
          s.aig[aig] = 0;
          // Sur dérangement de la partie électrique, la commande n'atteint
          // pas le moteur : l'aiguille reste physiquement où elle était.
          if (fa.kind === 'elec') s.lev[aig] = previousLev;
        }
      }

      // Aiguille calée en manœuvre à main dans l'autre position : la commande
      // ne peut pas la reprendre, le contrôle tombe.
      const held = s.mm[aig];
      if (held !== 0 && held !== pos) {
        s.aig[aig] = 0;
        s.lev[aig] = held;
      }
    }
  }

  // — 2. Test de formation. Une aiguille sans contrôle (`0`) ne fait PAS
  //      échouer la formation : seule la position franchement contraire
  //      l'empêche. C'est le comportement de l'original (`aig81a != "g"`),
  //      et c'est `feX()` qui refusera ensuite d'ouvrir le signal.
  for (const [aig, pos] of Object.entries(r.switches) as [AigId, AigPos][]) {
    if (s.aig[aig] === opposite(pos)) {
      log(s, 'warn', `${r.label} refusé — aiguille ${aig.replace('aig', '')} en position contraire.`);
      return false;
    }
  }

  // — 2 bis. Garde de groupe re-testée au transit (`ffnudgvz()`).
  if (
    r.transitAlsoNeedsGroup &&
    !s.established[r.id] &&
    !groupIsFree(s, r.transitAlsoNeedsGroup, r)
  ) {
    log(s, 'warn', `${r.label} refusé — zone de la communication 82 non libre.`);
    return false;
  }

  // — 3. Dérangement « raté de formation ».
  const fr = s.faults.route;
  if (fr && fr.kind === 'formation' && sameRouteFamily(fr.id, r.id)) {
    log(s, 'error', `${r.label} — raté de formation (dérangement).`);
    return false;
  }

  // — 4. Établissement : verrouillage des zones et bascule du drapeau.
  //
  // Le transit substitué tombe au passage, comme `if (amni==1){amni=0;}` à
  // l'ouverture du bloc d'établissement de `ffagnida()`. Seul le transit est
  // effacé : le bouton de l'autre itinéraire est déjà retombé, sans quoi ses
  // verrous de zone auraient interdit la manœuvre.
  for (const other of TRANSIT_SUBSTITUTES[r.id] ?? []) {
    if (s.established[other]) {
      s.established[other] = false;
      log(s, 'info', `${ROUTE_BY_ID[other].label} — transit chassé par ${r.label}.`);
    }
  }

  s.established[r.id] = true;
  for (const z of r.locks) {
    if (s.zones[z] !== 2) s.zones[z] = 1;
  }

  // La variante TP/simple de l'itinéraire se retire au profit de celle-ci.
  const sibling = ROUTES.find((o) => o.id !== r.id && (o.tpOf === r.id || r.tpOf === o.id));
  if (sibling && s.established[sibling.id]) {
    s.established[sibling.id] = false;
    s.b[sibling.id] = 0;
  }

  // Un itinéraire établi consomme l'annulation de transit qui l'a permis.
  for (const g of SWITCH_GROUPS) {
    const involved = g.members.some((m) => r.switches[m] != null);
    if (!involved) continue;
    for (const guard of g.guards) {
      if (s.atrAnnul[guard.releasedBy - 1]) {
        s.atrAnnul[guard.releasedBy - 1] = false;
        if (guard.releasedBy === 1) s.atr1PurgeAt = null;
      }
    }
  }

  return true;
}

/** Deux identifiants d'itinéraire partagent-ils la même clé de dérangement ? */
function sameRouteFamily(a: RouteId, b: RouteId): boolean {
  const ka = ROUTE_BY_ID[a]?.derangementKey;
  const kb = ROUTE_BY_ID[b]?.derangementKey;
  return ka != null && ka === kb;
}

/** Un annulateur actionné couvre-t-il cette zone ? */
function releveeParAtr(s: PrsState, z: ZoneId): boolean {
  const atr = ([1, 2, 3] as const).find((n) => ATR_SCOPE[n].includes(z));
  return atr != null && s.atrAnnul[atr - 1];
}

/**
 * Zones de parcours encore occupées et non libérées par un annulateur —
 * tant qu'il en reste une, le **transit** ne tombe pas.
 */
function coreZonesHeld(s: PrsState, r: RouteDef): ZoneId[] {
  return CORE_LOCKS[r.id].filter((z) => s.zones[z] === 2 && !releveeParAtr(s, z));
}

/**
 * Libération en cascade, dans le sens de la marche (§4.6 de `enclenchement.md`).
 *
 * Les `dX()` rendent les zones **une par une**, chacune dès qu'elle est libre
 * et que celles qui la précèdent le sont : une zone encore occupée en aval
 * n'empêche pas de rendre l'amont. Le transit, lui, ne tombe qu'au dégagement
 * de toutes les zones de parcours — d'où des situations où il s'attarde alors
 * que les aiguilles sont déjà rendues.
 */
function releaseZones(s: PrsState, r: RouteDef, transitTombe: boolean): void {
  const core = new Set<ZoneId>(CORE_LOCKS[r.id]);
  let cascade = true;
  let dansLeParcours = false;

  for (const cran of RELEASE_ORDER[r.id]) {
    const estParcours = cran.some((z) => core.has(z));
    if (estParcours) dansLeParcours = true;
    // Un cran situé au-delà des zones de parcours attend que le transit tombe.
    const attendLeTransit = dansLeParcours && !estParcours;

    if (cascade && (!attendLeTransit || transitTombe)) {
      for (const z of cran) {
        if (s.zones[z] === 2) continue; // occupée : elle reste rouge
        if (heldByOther(s, z, r.id)) continue; // tenue par un autre transit
        s.zones[z] = 0;
      }
    }

    // La cascade s'arrête à la première zone de parcours encore occupée.
    if (estParcours && cran.some((z) => core.has(z) && s.zones[z] === 2 && !releveeParAtr(s, z))) {
      cascade = false;
    }
  }
}

/**
 * @internal — exposé pour le moteur de trafic. `pedal` reproduit
 * `pedNN == 2` : le passage du train court-circuite la garde d'approche.
 */
export function destroyRoute(
  s: PrsState,
  r: RouteDef,
  now: number,
  reason?: string,
  pedal = false,
): void {
  destroy(s, r, now, reason, pedal);
}

/** Destruction d'un itinéraire (équivalent `dX()`). */
function destroy(s: PrsState, r: RouteDef, now: number, reason?: string, pedal = false): void {
  const pedKey = r.signal ? (PED_OF_SIGNAL[r.signal] ?? null) : null;
  if (pedal && pedKey) s.ped[pedKey] = 2;
  // Dérangement « raté de destruction **automatique** » : l'itinéraire reste
  // tracé au passage du train. Le source ne teste `dergmti` que dans les
  // étapes du moteur de trafic — `if ((dergmti!="agnud")||(bagnu==0))` — et
  // jamais dans les `dX()` : une destruction commandée au bouton passe outre.
  const fr = s.faults.route;
  if (pedal && fr && fr.kind === 'destruction' && sameRouteFamily(fr.id, r.id)) {
    log(s, 'error', `${r.label} — raté de destruction (dérangement) : l'itinéraire reste tracé.`);
    s.b[r.id] = 1;
    return;
  }

  // Tout le corps des `dX()` concernés est gardé par `(zapNN != 1)` : sous
  // enclenchement d'approche la destruction est impossible, il faut la D.M.T.
  // La pédale (`pedNN == 2`) court-circuite la garde : le train est passé.
  if (!pedal && r.zap && s.zap[r.zap] === 1) {
    log(
      s,
      'warn',
      `${routeFullLabel(r)} — destruction impossible sous enclenchement d'approche : passer par la D.M.T.`,
    );
    return;
  }

  // Le bouton s'éteint et le carré se referme dès la commande, mais
  // l'itinéraire lui-même ne tombe qu'au dégagement des zones de parcours.
  //
  // Une commande **enregistrée** survit à la destruction : tous les `dX()`
  // gardent leur remise à zéro par `if (bX != 3)`. Sans quoi détruire un
  // itinéraire effacerait la commande qui attendait sa place.
  if (s.b[r.id] !== 3) s.b[r.id] = 0;
  clearKit(s, r);

  const held = coreZonesHeld(s, r);
  if (held.length > 0) {
    // Le transit s'attarde, mais les zones déjà libres sont rendues.
    releaseZones(s, r, false);
    const sibling = r.tpOf ? ROUTE_BY_ID[r.tpOf] : null;
    if (sibling) {
      // `dagnitp()` / `dnzdgtp()`, branche `else` : le tracé permanent se
      // dégrade en itinéraire simple, le train engagé gardant son parcours.
      s.established[r.id] = false;
      s.established[sibling.id] = true;
      s.b[sibling.id] = 1;
      log(s, 'info', `${routeFullLabel(r)} détruit — dégradé en ${routeFullLabel(sibling)}.`);
    } else {
      log(
        s,
        'warn',
        `${routeFullLabel(r)} — destruction commandée, effective au dégagement de ${held.join(', ')}.`,
      );
    }
    replayRegistered(s, r, now);
    return;
  }

  s.established[r.id] = false;
  releaseZones(s, r, true);
  // `dX()` : `pedNN = 0` en même temps que le transit tombe.
  if (pedKey) s.ped[pedKey] = 0;

  if (r.id === 'nuam') {
    s.vauac = 0;
    s.vauacDueAt = null;
  }

  log(s, 'info', reason ?? `${routeFullLabel(r)} détruit.`);

  // Rejeu des commandes enregistrées, dans l'ordre de la liste d'origine.
  replayRegistered(s, r, now);
}

/**
 * Rejeu des commandes enregistrées libérées par la destruction de `destroyed`.
 * Transcription de la queue des `dX()` :
 * `if (bagnu==3) {bagnu=0; fagnu();}` — remise à zéro **puis** nouvelle
 * commande complète, qui peut donc réussir… ou se ré-enregistrer.
 */
function replayRegistered(s: PrsState, destroyed: RouteDef, now: number): void {
  for (const entry of REPLAY_ON_DESTROY[destroyed.id] ?? []) {
    const b = s.b[entry.id];
    const waiting = entry.only5 ? b === 5 : b === 3 || b === 5 || (entry.alsoFrom1 && b === 1);
    if (!waiting) continue;
    if (entry.unless && s.established[entry.unless]) continue;
    const r = ROUTE_BY_ID[entry.id];
    s.b[entry.id] = 0;
    log(s, 'info', `${routeFullLabel(r)} — commande enregistrée rejouée.`);
    commandRoute(s, r, now);
  }
}

// ===== Commande d'un bouton d'itinéraire ====================================

/**
 * **Enregistrement** d'une commande qui ne peut pas être satisfaite tout de
 * suite — fin de `agnidaa()` / `agnitpa()`, suivie de `synchro()`.
 *
 * Ce n'est pas un refus : la commande est mémorisée, le bouton clignote dans
 * la couleur de son itinéraire, et elle sera rejouée automatiquement à la
 * destruction de l'itinéraire qui la bloque (`replayRegistered`).
 *
 *   3 — enregistré ;
 *   5 — enregistré, variante T.P. attendant derrière une **autre** commande
 *       enregistrée (`agnitpa()` : `bagnitp=5`). C'est ce qui permet aux
 *       `dX()` de distinguer les deux files.
 */
/**
 * Une **autre** commande est-elle déjà enregistrée devant ce tracé permanent ?
 *
 * `agnitpa()` teste nommément `bagnu`, `bnudgvi`, `bdgni`, `bamni`, `bamnu`,
 * `bnuam` et `nzdgtpa()` teste `bnudgvz`, `bnudgvi`, `bdgni` : dans les deux
 * cas exactement les itinéraires incompatibles, **son propre D.A. exclu**.
 * `routesConflict()` reproduit ces deux ensembles.
 */
function queuedAhead(s: PrsState, r: RouteDef): boolean {
  if (r.tpOf == null) return false;
  return ROUTES.some(
    (o) => o.id !== r.id && o.id !== r.tpOf && s.b[o.id] === 3 && routesConflict(r, o),
  );
}

function register(s: PrsState, r: RouteDef, reason?: string): void {
  const ahead = queuedAhead(s, r);
  s.b[r.id] = ahead ? 5 : 3;

  // `agnitpa()` : un T.P. bloqué par son propre D.A. enregistré reprend la
  // commande à son compte (`bagnitp=3; bagnida=0;`) — mais **seulement** si
  // aucune autre commande n'attend, sinon le D.A. garde sa place dans la file
  // et le T.P. se surenregistre derrière.
  if (r.tpOf != null && !ahead && s.b[r.tpOf] === 3) s.b[r.tpOf] = 0;

  log(
    s,
    'warn',
    `${routeFullLabel(r)} ${ahead ? 'surenregistré' : 'enregistré'}${reason ? ` — ${reason}` : ''}.`,
  );
}

/**
 * Cœur de `fX()` : le compteur vient de passer à 1, on tente la formation.
 * Soit l'itinéraire s'établit, soit la commande s'enregistre.
 */
function commandRoute(s: PrsState, r: RouteDef, now: number): void {
  s.b[r.id] = 1;

  // `agnidaa()` / `nzdgdaa()` : appuyer sur le bouton **D.A.** alors que son
  // propre T.P. est enregistré remet les **deux** au repos
  // (`bagnida=0; bagnitp=0;`), et rien ne se forme. C'est le geste de retrait
  // d'une commande enregistrée par son bouton jumeau. Un T.P.
  // *surenregistré* (5), lui, garde sa place dans la file.
  if (r.tpOf == null) {
    const tp = ROUTES.find((o) => o.tpOf === r.id);
    if (tp && s.b[tp.id] === 3) {
      s.b[r.id] = 0;
      s.b[tp.id] = 0;
      log(s, 'info', `${routeFullLabel(tp)} — commande enregistrée annulée.`);
      refresh(s);
      return;
    }
  }

  // **Surenregistrement** — la 3ᵉ clause de `agnitpa()` / `nzdgtpa()` est
  // *hors* du bloc de conflit et s'exécute avant `ffX()` : dès qu'une autre
  // commande est enregistrée, le tracé permanent prend l'état 5 et attend son
  // tour **sans même tenter de se former**, même si la voie est libre. C'est
  // ce qui garantit l'ordre : le D.A. enregistré se forme le premier, le T.P.
  // surenregistré ensuite.
  if (queuedAhead(s, r)) {
    register(s, r);
    refresh(s);
    return;
  }

  // L'autorisation EP MOE ne passe pas par la table d'incompatibilité : `faum()`
  // écrit ses propres conditions.
  //
  // ```js
  // if ((baum==1)&&(vaum!=2)&&(bannul1==0)) {
  //   if ((nuam==1)||(((amnu==1)||(amni==1))&&(z81!=0)&&(aum!=1))) {baum=3;synchro();}
  // }
  // if (baum==1) { if (vaum==1){ffaum();…} else{baum=0;} }
  // ```
  //
  // Deux différences avec les itinéraires : le voyant éteint **refuse** au lieu
  // d'enregistrer, et l'annulateur 1 actionné lève le blocage.
  if (r.id === 'aum') {
    if (s.vaum !== 1) {
      s.b.aum = 0;
      log(s, 'warn', 'Au.M — autorisation non disponible, voyant éteint.');
      refresh(s);
      return;
    }
    const bloque =
      !s.atrAnnul[0] &&
      (s.established.nuam ||
        ((s.established.amnu || s.established.amni) && s.zones.z81 !== 0 && !s.established.aum));
    if (bloque) {
      register(s, r, 'mouvement en sens contraire en cours');
      refresh(s);
      return;
    }
  } else {
    const conflicts = conflictingEstablished(s, r);
    if (conflicts.length > 0) {
      register(s, r, `incompatible avec ${conflicts.map(routeFullLabel).join(', ')}`);
      refresh(s);
      return;
    }
  }

  if (!formation(s, r)) {
    register(s, r);
    refresh(s);
    return;
  }

  log(s, 'info', `${routeFullLabel(r)} formé.`);
  if (r.id === 'nuam') {
    // L'EP MOE accorde l'autorisation d'accès 10 s plus tard.
    s.vauacDueAt = now + 10_000;
  }
  if (r.id === 'aum') {
    // `ffaum()` : `vaum1 = setTimeout("traficautom()", 10000)`.
    s.aumAutoAt = now + 10_000;
  }
  refresh(s);
}

/**
 * Appui sur un bouton d'itinéraire (équivalent `tfX()` + `fX()`).
 * Le compteur `b` suit la table de la spec §4.2.
 */
export function pressRoute(state: PrsState, id: RouteId, now: number = Date.now()): PrsState {
  const s = clone(state);
  const r = ROUTE_BY_ID[id];
  if (!r) return state;

  // — Bulletin des dispositifs ouvert : `tfX()` détourne l'appui.
  //
  //   if (da==1){magnida();}
  //   if (da==2) { if ((disp1==0)&&(dispr1==0)){fagnida();} else {ragnida();} }
  //
  // En **pose**, le bouton ne commande plus rien. En **retrait**, il retire un
  // dispositif — mais s'il n'en porte aucun, il se commande normalement.
  const mode = s.dispMode;
  if (mode) {
    const porte = s.da[id] > 0 || s.dr[id] > 0;
    if (mode.delta === 1 || porte) return changeDispositif(state, id, mode.kind, mode.delta);
  }

  // — Couple itinéraire simple / tracé permanent (`fagnitp()`, `fagnida()`).
  const sibling = ROUTES.find((o) => o.id !== id && (o.tpOf === id || r.tpOf === o.id));
  if (sibling && (s.established[id] || s.established[sibling.id])) {
    const underApproach = r.zap != null && s.zap[r.zap] === 1;

    /** Échange des drapeaux sans reformation : les deux ont le même parcours. */
    const swapTo = (to: RouteDef, from: RouteDef) => {
      s.established[from.id] = false;
      s.b[from.id] = 0;
      s.established[to.id] = true;
      s.b[to.id] = 1;
      if (s.dmt && (s.dmt.route === from.id || s.dmt.route === to.id)) s.dmt = null;
      log(s, 'info', `${routeFullLabel(from)} → ${routeFullLabel(to)}.`);
      refresh(s);
    };

    if (r.tpOf != null) {
      // Appui sur le bouton T.P. — **tout** le bloc de bascule de `fagnitp()`
      // et `fnzdgtp()` est gardé par `(bagnu==0)&&(bnudgvi==0)&&…`, c'est-à-dire
      // « aucun itinéraire incompatible n'a de commande en cours ». Si une
      // commande attend, l'appui ne bascule rien : il tombe dans `agnitpa()` /
      // `nzdgtpa()`, qui **surenregistre** — et l'itinéraire simple établi
      // reste établi et allumé.
      const queueBusy = ROUTES.some(
        (o) => o.id !== id && o.id !== sibling.id && routesConflict(r, o) && s.b[o.id] !== 0,
      );

      if (!queueBusy) {
        if (underApproach) {
          // `fagnitp()`, branche `zap81 == 1` : bascule directe dans un sens
          // comme dans l'autre, sans reformation, D.M.T. annulée.
          swapTo(s.established[id] ? sibling : r, s.established[id] ? r : sibling);
          return s;
        }
        if (s.established[sibling.id]) {
          // Hors approche : `dagnida()` puis formation complète du T.P.
          destroy(s, sibling, now);
          commandRoute(s, r, now);
          return s;
        }
        // T.P. établi, hors approche : `dagnitp()` puis commande de
        // l'itinéraire simple. Si la destruction a dégradé le T.P., il n'y a
        // rien à commander.
        destroy(s, r, now);
        if (s.established[sibling.id]) refresh(s);
        else commandRoute(s, sibling, now);
        return s;
      }

      if (s.established[id]) {
        // `agnitpb()` / `nzdgtpb()`, 2ᵉ clause : le T.P. est établi mais une
        // commande attend — on repasse à l'itinéraire simple, recommandé
        // aussitôt, **sans libérer les zones** (les drapeaux sont remis à zéro
        // à la main, `dX()` n'est pas appelé).
        s.established[id] = false;
        s.b[id] = 0;
        s.established[sibling.id] = false;
        s.b[sibling.id] = 0;
        log(s, 'info', `${routeFullLabel(r)} → ${routeFullLabel(sibling)}.`);
        commandRoute(s, sibling, now);
        return s;
      }

      // L'itinéraire simple est établi : on laisse le flux normal
      // surenregistrer le T.P., sans y toucher.
    }

    // Appui sur le bouton **simple** alors que le T.P. est établi : `fagnida()`
    // fait `bagnitp=0; bagnida=0; dagnitp()` — le T.P. est détruit et
    // l'itinéraire simple n'est PAS repris (sauf dégradation sur zone occupée).
    // `fagnida()` n'a pas la garde de file de `fagnitp()`.
    if (r.tpOf == null && s.established[sibling.id]) {
      if (underApproach) {
        log(
          s,
          'warn',
          `${routeFullLabel(sibling)} sous enclenchement d'approche — sans effet, utiliser le bouton T.P.`,
        );
        return s;
      }
      destroy(s, sibling, now);
      s.b[id] = s.established[id] ? 1 : 0;
      refresh(s);
      return s;
    }
  }

  // — Appui sur une commande enregistrée : annulation. Dans l'original le
  //   compteur passe transitoirement par 4 (`agnidaz()`) ou 6 (`agnitpz()`)
  //   avant d'être remis à 0 dans le même appel.
  if (s.b[id] === 3 || s.b[id] === 5) {
    s.b[id] = 0;
    log(s, 'info', `${routeFullLabel(r)} — commande enregistrée annulée.`);
    refresh(s);
    return s;
  }

  // — Appui sur un itinéraire établi sous enclenchement d'approche : D.M.T.
  if (s.established[id] && s.b[id] === 1 && r.zap && s.zap[r.zap] === 1 && r.dmtMs) {
    // `dtX()` n'arme la temporisation que si le bouton de fermeture du carré
    // est **maintenu** (`bfc81 == 1`). Sans cela l'appui est sans effet :
    // dans l'original le compteur repasse par 7 puis se recale sur 1 et le
    // bouton se rallume, l'itinéraire restant établi.
    const fcKey = r.signal === 'c81' || r.signal === 'c82' || r.signal === 'c84' ? r.signal : null;
    if (!fcKey || !s.fc[fcKey]) {
      log(
        s,
        'warn',
        `${routeFullLabel(r)} sous enclenchement d'approche — maintenir le bouton de fermeture du carré pour lancer la D.M.T.`,
      );
      return s;
    }
    // Une seule temporisation à la fois par zone d'approche (`tzap81l`).
    if (s.dmt) return s;
    s.b[id] = 6;
    s.dmt = { route: id, dueAt: now + r.dmtMs };
    log(
      s,
      'warn',
      `${routeFullLabel(r)} sous enclenchement d'approche — destruction manuelle temporisée lancée (${r.dmtMs / 1000} s).`,
    );
    return s;
  }

  // — D.M.T. déjà en cours sur ce bouton : l'appui ne fait rien de plus.
  if (s.b[id] === 6) return s;

  s.b[id] += 1;

  if (s.b[id] === 1) {
    commandRoute(s, r, now);
    return s;
  }

  if (s.b[id] === 2) {
    destroy(s, r, now);
    refresh(s);
    return s;
  }

  // Filet de sécurité : tout autre compteur retombe au repos.
  s.b[id] = 0;
  refresh(s);
  return s;
}

// ===== Horloge : D.M.T., purge ATR, autorisation d'accès ====================

/**
 * Avance les temporisations. À appeler périodiquement (≈250 ms) depuis la vue.
 * Retourne l'état inchangé (même référence) si rien n'a expiré, pour éviter
 * les rendus inutiles.
 */
export function tick(state: PrsState, now: number = Date.now()): PrsState {
  const dmtDue = state.dmt != null && now >= state.dmt.dueAt;
  const purgeDue = state.atr1PurgeAt != null && now >= state.atr1PurgeAt;
  const vauacDue = state.vauacDueAt != null && now >= state.vauacDueAt;
  const aumAutoDue = state.aumAutoAt != null && now >= state.aumAutoAt;
  const aumAutoEndDue = state.aumAutoEndAt != null && now >= state.aumAutoEndAt;
  const trafficDue = state.trains.some((t) => t.dueAt <= now);
  const scenarioDue = state.scenario != null;
  if (
    !dmtDue &&
    !purgeDue &&
    !vauacDue &&
    !aumAutoDue &&
    !aumAutoEndDue &&
    !trafficDue &&
    !scenarioDue
  ) {
    return state;
  }

  const s = clone(state);

  if (dmtDue && s.dmt) {
    const r = ROUTE_BY_ID[s.dmt.route];
    s.dmt = null;
    // `libX()` libère l'enclenchement d'approche. On efface aussi la mémoire
    // d'ouverture du carré : sans cela `recomputeZaps()` re-verrouillerait
    // aussitôt (l'original, lui, ne recalcule pas `zap` à cet instant — il
    // arrive au même résultat parce que la destruction qui suit fait
    // `kitNN = 0`).
    clearKit(s, r);
    if (r.zap) s.zap[r.zap] = 2;
    if (s.genPrs === 1) {
      // PRS 1ʳᵉ génération : destruction automatique à échéance.
      destroy(s, r, now, `${r.label} — D.M.T. échue, destruction automatique (PRS 1ʳᵉ génération).`);
    } else {
      // PRS 2ᵉ génération : le bouton se rallume, il faut réappuyer.
      s.b[r.id] = 1;
      log(s, 'warn', `${r.label} — D.M.T. échue, réappuyer pour détruire (PRS 2ᵉ génération).`);
    }
  }

  // `traficautom()` : dix secondes après la pose de l'Au.M, si la voie mère
  // est libre, l'EP MOE saisit l'autorisation — le voyant s'éteint, un train
  // s'engage trois secondes plus tard.
  if (aumAutoDue) {
    s.aumAutoAt = null;
    if (s.traffic && s.established.aum && s.saat.vm === '') {
      s.vaum = 2;
      log(s, 'info', "EP MOE — autorisation de mouvement saisie, une circulation s'engage.");
      spawnTrain(s, { thread: 'M', branch: 'm', counter: 'vm' }, now, 3_000);
      s.trpresvm = true;
      // `traficautomd()` rend le voyant et détruit l'autorisation.
      s.aumAutoEndAt = now + 12_000;
    }
  }

  // `traficautomd()` : `vaum=1; daum();`
  if (aumAutoEndDue) {
    s.aumAutoEndAt = null;
    s.vaum = 1;
    if (s.established.aum) {
      destroyRoute(s, ROUTE_BY_ID.aum, now, 'Au.M — autorisation rendue par l’EP MOE.');
    }
  }

  if (purgeDue) {
    s.atr1PurgeAt = null;
    s.atrAnnul[0] = false;
    log(s, 'info', 'ATR 1 — purge automatique après 20 s.');
  }

  if (vauacDue) {
    s.vauacDueAt = null;
    if (s.established.nuam) {
      s.vauac = 1;
      log(s, 'info', "EP MOE — autorisation d'accès accordée.");
    }
  }

  // Horloge simulée du scénario : déclenche les phases dont la minute est
  // atteinte, puis injecte l'incident différé.
  const scenarioMoved = scenarioDue ? advanceScenario(s, now) : false;

  // Avance des circulations : chaque train dont l'échéance est atteinte joue
  // son étape, ce qui occupe/libère des zones et peut détruire un itinéraire.
  if (trafficDue) advanceTraffic(s, now);

  if (
    !dmtDue &&
    !purgeDue &&
    !vauacDue &&
    !aumAutoDue &&
    !aumAutoEndDue &&
    !trafficDue &&
    !scenarioMoved
  ) {
    return state;
  }

  refresh(s);
  return s;
}

// ===== Trafic ================================================================

/** Lance ou arrête le trafic souple (`trafic()` / `ltrafic()`). */
export function toggleTraffic(state: PrsState, now: number = Date.now()): PrsState {
  const s = clone(state);
  if (s.traffic) stopTrafficImpl(s);
  else startTrafficImpl(s, now);
  refresh(s);
  return s;
}

// ===== Fermeture de carré, tests ============================================

export function toggleCarreClose(state: PrsState, sig: 'c81' | 'c82' | 'c84'): PrsState {
  const s = clone(state);
  s.fc[sig] = !s.fc[sig];
  log(s, 'info', `Bouton de fermeture ${sig.toUpperCase()} ${s.fc[sig] ? 'enfoncé' : 'relâché'}.`);
  refresh(s);
  return s;
}

export function toggleTestAig(state: PrsState): PrsState {
  const s = clone(state);
  s.testAig = !s.testAig;
  return s;
}

export function setTestZones(state: PrsState, on: boolean): PrsState {
  if (state.testZones === on) return state;
  const s = clone(state);
  s.testZones = on;
  return s;
}

export function setGeneration(state: PrsState, gen: 0 | 1): PrsState {
  const s = clone(state);
  s.genPrs = gen;
  log(s, 'info', `Poste configuré en PRS ${gen === 1 ? '1ʳᵉ' : '2ᵉ'} génération.`);
  return s;
}


// ===== Annulateurs de transit ===============================================

/** Zones relâchées par chaque annulateur (spec §6.3). */
const ATR_SCOPE: Record<1 | 2 | 3, ZoneId[]> = {
  1: ['z89'],
  2: ['z81', 'z81b', 'z83b'],
  3: ['z82a'],
};

/** Actionner l'annulateur : soulève le coupon plombé. */
export function armAtr(state: PrsState, n: 1 | 2 | 3): PrsState {
  const s = clone(state);
  if (s.atrArmed[n - 1]) return state;

  // Les ATR 2 et 3 refusent de s'armer si un itinéraire est en cours de
  // commande — l'original les auto-annule après 300 ms.
  if (n !== 1) {
    const commanding = ROUTE_IDS.some((id) => s.b[id] === 1 && s.established[id]);
    if (commanding) {
      log(s, 'warn', `ATR ${n} — armement refusé : un itinéraire est établi.`);
      return s;
    }
  }

  s.atrArmed[n - 1] = true;
  log(s, 'info', `ATR ${n} actionné.`);
  return s;
}

/** Annuler le transit : détruit les itinéraires tenant les zones concernées. */
/**
 * Portée de destruction d'une annulation de transit — `dtri()`, `dtrz()`,
 * `dtre()` (§ 4.7 de `enclenchement.md`).
 *
 * L'annulateur ne balaie pas tout ce qui croise son périmètre : il ne défait
 * qu'un transit **attardé**, dont le bouton est déjà retombé.
 *
 * ```js
 * // dtri()
 * if ((bannul1==1)&&(amni==1)&&(bamni!=1)&&(bamni!=2)){damni();}
 * // dtrz(), sous condition d'occupation de chaque zone
 * if (z81==2) { if ((bannul2==1)&&(agnida==1)&&(bagnida!=1)) {dagnida();} … }
 * ```
 *
 * Trois différences de traitement selon l'annulateur :
 *
 * - **ATR 2** n'agit que sur les zones **effectivement occupées** de son
 *   périmètre ; les ATR 1 et 3 agissent sans cette condition.
 * - **ATR 1** épargne en plus les boutons en état 2 (destruction commandée),
 *   là où les autres ne regardent que l'état 1.
 * - **L'autorisation Au.M n'est jamais détruite** : `dtri()` ne la cite pas,
 *   et `daum()` n'est appelée que par son propre bouton ou par le trafic.
 */
function detruireParAtr(s: PrsState, n: 1 | 2 | 3, now: number): void {
  const surZoneOccupee = n === 2;
  const epargneCommandeEnCours = n === 1;

  for (const z of ATR_SCOPE[n]) {
    if (surZoneOccupee && s.zones[z] !== 2) continue;
    for (const r of ROUTES) {
      if (r.id === 'aum') continue;
      if (!s.established[r.id]) continue;
      if (!r.locks.includes(z)) continue;
      if (s.b[r.id] === 1) continue;
      if (epargneCommandeEnCours && s.b[r.id] === 2) continue;
      destroy(s, r, now, `${routeFullLabel(r)} détruit par annulation de transit (ATR ${n}).`);
    }
  }
}

export function annulAtr(state: PrsState, n: 1 | 2 | 3, now: number = Date.now()): PrsState {
  if (!state.atrArmed[n - 1]) return state;
  const s = clone(state);
  s.atrArmed[n - 1] = false;
  s.atrAnnul[n - 1] = true;
  if (n === 1) s.atr1PurgeAt = now + 20_000;

  detruireParAtr(s, n, now);
  log(s, 'warn', `ATR ${n} — annulation de transit active.`);
  refresh(s);
  return s;
}

/** Replacer le coupon plombé après usage. */
export function restoreAtr(state: PrsState, n: 1 | 2 | 3): PrsState {
  const s = clone(state);
  s.atrArmed[n - 1] = false;
  s.atrAnnul[n - 1] = false;
  if (n === 1) s.atr1PurgeAt = null;
  s.coupons += 1;
  log(s, 'info', `ATR ${n} replacé — coupon n° ${s.coupons}.`);
  refresh(s);
  return s;
}

// ===== Dispositifs D.A / D.R ================================================

/** Choix au bulletin des dispositifs — `dispda()`. */
export function setDispositifMode(
  state: PrsState,
  mode: PrsState['dispMode'],
): PrsState {
  const s = clone(state);
  s.dispMode = mode;
  return s;
}

/**
 * Tous les compteurs revenus à zéro : `verifda()` / `verifdr()` remettent le
 * bulletin sur « aucun » et rappellent `dispda()`, ce qui rend la main à la
 * commande normale.
 */
function verifDispositifs(s: PrsState): void {
  const reste = ROUTE_IDS.some((id) => s.da[id] > 0 || s.dr[id] > 0 || s.dsa[id] > 0);
  if (!reste) s.dispMode = null;
}

/** Nombre de dispositifs, tous types confondus, portés par un bouton. */
export const dispositifsPoses = (s: PrsState, id: RouteId): number =>
  s.da[id] + s.dr[id] + s.dsa[id];

export function changeDispositif(
  state: PrsState,
  id: RouteId,
  kind: DispositifKind,
  delta: 1 | -1,
): PrsState {
  const s = clone(state);
  if (delta === 1) {
    if (dispositifsPoses(s, id) >= DISPOSITIF_MAX) {
      log(s, 'warn', `${ROUTE_BY_ID[id].label} — maximum de ${DISPOSITIF_MAX} dispositifs atteint.`);
      return s;
    }
    s[kind][id] += 1;
  } else {
    if (s[kind][id] === 0) return state;
    s[kind][id] -= 1;
    verifDispositifs(s);
  }
  log(
    s,
    'info',
    `${ROUTE_BY_ID[id].label} — ${delta === 1 ? 'pose' : 'retrait'} d'un ` +
      `${DISPOSITIF_LABELS[kind]} (${s.da[id]} D.A / ${s.dr[id]} D.R / ${s.dsa[id]} D.S.A).`,
  );
  return s;
}

// ===== Dérangements =========================================================

/**
 * Pose ou lève un dérangement de zone.
 *
 * Un circuit de voie en dérangement se **signale occupé** : les pastilles du
 * groupe passent au rouge dès la pose. L'itinéraire pourra encore se former —
 * les aiguilles se manœuvrent — mais le signal restera fermé, la zone n'étant
 * pas libre. C'est l'exercice.
 */
export function setZoneFault(state: PrsState, key: ZoneFaultKey | null): PrsState {
  const s = clone(state);
  const previous = s.faults.zone;
  s.faults.zone = key;
  if (key) {
    for (const z of zonesForFault(s, key)) s.zones[z] = 2;
    log(s, 'error', `Dérangement injecté — zone ${ZONE_FAULT_LABELS[key]} : circuit de voie occupé.`);
  }
  // Lever le dérangement remet la voie en ordre : les zones qu'il maintenait
  // occupées sont libérées, ou repassent à « tracé » si un itinéraire établi
  // les tient toujours.
  if (previous && previous !== key) {
    for (const z of zonesForFault(s, previous)) {
      if (s.zones[z] !== 2) continue;
      const held = ROUTES.some((r) => s.established[r.id] && r.locks.includes(z));
      s.zones[z] = held ? 1 : 0;
    }
  }
  refresh(s);
  return s;
}

export function setAigFault(
  state: PrsState,
  fault: { id: AigId; kind: AigFaultKind } | null,
): PrsState {
  const s = clone(state);
  const previous = s.faults.aig;
  s.faults.aig = fault;
  if (!fault && previous) {
    // Le défaut est réparé : le contrôle revient.
    restoreAigControl(s, previous.id);
    log(s, 'info', `Dérangement de l'aiguille ${previous.id.replace('aig', '')} levé — contrôle rendu.`);
  }
  if (fault) {
    // Un dérangement d'aiguille se manifeste immédiatement si la position
    // commandée est celle qui est en défaut.
    const pos = s.cag[fault.id];
    const blocks =
      (fault.kind === 'noCtrlD' && pos === 'd') ||
      (fault.kind === 'noCtrlG' && pos === 'g') ||
      fault.kind === 'elec';
    if (blocks) s.aig[fault.id] = 0;
    log(s, 'error', `Dérangement injecté — ${fault.id.replace('aig', 'aiguille ')} : ${AIG_FAULT_LABELS[fault.kind].toLowerCase()}.`);
  }
  refresh(s);
  return s;
}

export function setSignalFault(
  state: PrsState,
  fault: { id: SignalId; kind: SignalFaultKind } | null,
): PrsState {
  const s = clone(state);
  s.faults.signal = fault;
  if (fault) {
    log(s, 'error', `Dérangement injecté — ${fault.id.toUpperCase()} : ${SIGNAL_FAULT_LABELS[fault.kind].toLowerCase()}.`);
  }
  refresh(s);
  return s;
}

export function setRouteFault(
  state: PrsState,
  fault: { id: RouteId; kind: RouteFaultKind } | null,
): PrsState {
  const s = clone(state);
  s.faults.route = fault;
  if (fault) {
    log(s, 'error', `Dérangement injecté — ${ROUTE_BY_ID[fault.id].label} : ${ROUTE_FAULT_LABELS[fault.kind].toLowerCase()}.`);
  }
  return s;
}

/**
 * Bouton « Immédiat » (`fimm()`) : occupe sur-le-champ les zones du
 * dérangement sélectionné, en tenant compte de la position courante des
 * aiguilles — c'est ce qui rend le tracé rouge cohérent avec la géométrie.
 */
/**
 * Zones qu'un dérangement de zone occupe — transcription de `fimm()`, §8.1.
 * Sert à la fois à l'appliquer (« Immédiat ») et à le lever proprement.
 */
export function zonesForFault(s: PrsState, key: ZoneFaultKey): ZoneId[] {
  const out: ZoneId[] = [];
  const z82 = () => {
    out.push('z82a');
    if (s.cag.aig81b === 'g') {
      out.push('z82d');
    } else {
      out.push('z82b');
      if (s.cag.aig82 === 'g') out.push('z82e');
      else out.push('z82c');
    }
  };
  const z83 = () => {
    out.push('z83b');
    if (s.cag.aig83b === 'd') out.push('z83a');
  };

  switch (key) {
    case 'z81a':
      out.push('z81');
      if (s.cag.aig85b === 'g') out.push('z81bis');
      break;
    case 'z81b':
      out.push('z81b');
      out.push(s.cag.aig81a === 'g' ? 'z81d' : 'z81a');
      if (s.cag.aig83a === 'g') out.push('z81c');
      break;
    case 'z82':
      z82();
      break;
    case 'z83':
      z83();
      break;
    case 'z8382':
      z82();
      z83();
      break;
    case 'z84':
      out.push('z84');
      break;
    case 'z79':
      out.push('z79');
      break;
    case 'z89':
      out.push('z89');
      break;
  }
  return out;
}

/**
 * Bouton « Immédiat » (`fimm()`). Le dérangement s'appliquant désormais dès sa
 * pose, ce bouton sert à le **réappliquer** — par exemple après le passage d'un
 * train qui a redistribué les occupations, ou après un changement de position
 * d'aiguille qui déplace le groupe concerné.
 */
export function applyZoneFaultNow(state: PrsState): PrsState {
  const key = state.faults.zone;
  if (!key) return state;
  const s = clone(state);
  for (const z of zonesForFault(s, key)) s.zones[z] = 2;
  log(s, 'error', `Dérangement de zone ${ZONE_FAULT_LABELS[key]} réappliqué.`);
  refresh(s);
  return s;
}

/**
 * Rend le contrôle d'une aiguille dont le dérangement est levé : le défaut
 * réparé, le poste revoit la position réelle — sauf si l'aiguille est calée en
 * manœuvre à main dans l'autre position.
 */
function restoreAigControl(s: PrsState, id: AigId): void {
  const held = s.mm[id];
  if (held !== 0 && held !== s.cag[id]) return;
  s.aig[id] = s.cag[id];
  s.lev[id] = s.cag[id];
}

export function resetFaults(state: PrsState): PrsState {
  const s = clone(state);
  s.faults = { ...EMPTY_FAULTS };

  // Les zones passées en occupé par un dérangement redeviennent libres, ou
  // repassent à « tracé » si un itinéraire établi les tient toujours.
  for (const z of STATEFUL_ZONES) {
    if (s.zones[z] !== 2) continue;
    const held = ROUTES.some((r) => s.established[r.id] && r.locks.includes(z));
    s.zones[z] = held ? 1 : 0;
  }

  // Les contrôles d'aiguille perdus sur dérangement sont rendus.
  for (const a of AIG_IDS) {
    if (s.aig[a] === 0) restoreAigControl(s, a);
  }

  s.di = 0;
  log(s, 'info', 'R.A.Z des dérangements.');
  refresh(s);
  return s;
}

// ===== Manœuvre au terrain ==================================================

/** Bascule moteur ↔ manœuvre à main d'une aiguille (`mmaig()`). */
export function toggleMainMoteur(state: PrsState, id: AigId): PrsState {
  const s = clone(state);
  if (!s.clemm) {
    log(s, 'warn', 'Clé Main-Moteur non retirée — manœuvre à main impossible.');
    return s;
  }
  if (s.mm[id] === 0) {
    s.mm[id] = s.lev[id];
    log(s, 'warn', `Aiguille ${id.replace('aig', '')} calée en manœuvre à main.`);
  } else {
    s.mm[id] = 0;
    log(s, 'info', `Aiguille ${id.replace('aig', '')} rendue à la commande moteur.`);
    // Rendue au moteur, elle reprend le contrôle si elle est bien placée.
    if (s.lev[id] === s.cag[id] && !derangementBloque(s, id, s.cag[id])) s.aig[id] = s.cag[id];
  }
  refresh(s);
  return s;
}

/** Renverse le levier d'une aiguille au terrain (`levaig()`). */
/**
 * Un dérangement d'aiguille empêche-t-il de retrouver le contrôle **dans cette
 * position** ?
 *
 * `levaig()` ne teste que le dérangement de la direction visée :
 * `if ((dergmta!="aig81ad")&&(cag81a=="d")) {aig81a="d";}`. Un écart
 * (`aig81aeg`/`aig81aed`) ne s'y oppose donc pas — il **suit** la manœuvre :
 * `if (cag81a==lev81a){aig81a="d";dergmta="aig81aed";}`. Seule la commande
 * moteur en reste empêchée, ce que traite `formation()`.
 */
function derangementBloque(s: PrsState, id: AigId, pos: AigPos): boolean {
  const f = s.faults.aig;
  if (!f || f.id !== id) return false;
  return (f.kind === 'noCtrlD' && pos === 'd') || (f.kind === 'noCtrlG' && pos === 'g');
}

/** Saisie d'un numéro de circulation dans le graphique. */
export function setSaatCell(state: PrsState, cell: SaatCell, value: string): PrsState {
  const s = clone(state);
  s.saat[cell] = value.slice(0, 6);
  return s;
}

/** Une case du graphique peut-elle recevoir l'annonce d'une circulation ? */
export function estEntree(cell: SaatCell): boolean {
  return SAAT_ENTREES[cell] !== undefined;
}

/**
 * Annonce une circulation au graphique : le numéro saisi dans une case
 * d'entrée engage un train sur le fil correspondant.
 *
 * Sur refus, l'état revient tel quel et la case est vidée : la saisie n'a pas
 * pris, et cela se voit. La raison part au journal du poste.
 */
export function annoncerCirculation(
  state: PrsState,
  cell: SaatCell,
  value: string,
  now: number = Date.now(),
): PrsState {
  const s = clone(state);
  const refus = annoncerAuGraphique(s, cell, value, now);
  if (!refus) {
    refreshState(s);
    return s;
  }

  const t = clone(state);
  t.saat[cell] = '';
  logEvent(t, 'error', REFUS_ANNONCE[refus](value));
  return t;
}

const REFUS_ANNONCE: Record<RefusAnnonce, (v: string) => string> = {
  case: () => 'Cette case du graphique est une sortie : aucune circulation ne s’y annonce.',
  numero: (v) => `« ${v} » n’est pas un numéro de circulation — six chiffres attendus.`,
  double: (v) => `Le ${v} est déjà au graphique : deux circulations ne portent pas le même numéro.`,
};

/**
 * @internal — le moteur de trafic inscrit un train dans une case et le retire
 * de celle qu'il occupait. `attvi()` fait exactement cela : `case3 = trainv1`
 * puis `case1 = ""`.
 */
export function saatPose(s: PrsState, num: number, cell: SaatCell): void {
  saatLibere(s, num);
  s.saat[cell] = String(num);
}

/** @internal — le train a quitté le poste : sa case se vide. */
export function saatLibere(s: PrsState, num: number): void {
  for (const c of SAAT_CELLS) if (s.saat[c.id] === String(num)) s.saat[c.id] = '';
}

/** Retrait ou remise de la clé Main-Moteur. */
export function toggleKey(state: PrsState): PrsState {
  const s = clone(state);
  s.clemm = !s.clemm;
  log(s, 'info', s.clemm ? 'Clé Main-Moteur retirée.' : 'Clé Main-Moteur remise.');
  return s;
}

/** Renversement du levier au terrain — `levaig()`. */
export function throwLever(state: PrsState, id: AigId): PrsState {
  const s = clone(state);
  if (!s.clemm) {
    log(s, 'warn', 'Clé Main-Moteur non retirée — manœuvre à main impossible.');
    return s;
  }
  if (s.mm[id] === 0) {
    log(s, 'warn', `Aiguille ${id.replace('aig', '')} — prendre d'abord la manœuvre à main.`);
    return s;
  }
  const next = opposite(s.lev[id]);
  s.lev[id] = next;
  s.mm[id] = next;
  // Le contrôle n'est rendu que si la position réelle rejoint la commande.
  s.aig[id] = next === s.cag[id] && !derangementBloque(s, id, next) ? next : 0;
  log(s, 'info', `Aiguille ${id.replace('aig', '')} manœuvrée à main en position ${next === 'g' ? 'gauche' : 'droite'}.`);
  refresh(s);
  return s;
}

// ===== Sélecteurs de lecture ================================================

/** Position affichée d'une aiguille : masquée hors test des aiguilles. */
export function displayedAigPos(s: PrsState, id: AigId): AigPos | 0 | null {
  if (!s.testAig) return null;
  return s.aig[id];
}

/**
 * La commande est-elle **enregistrée** (bouton clignotant, en attente de la
 * destruction de l'itinéraire qui la bloque) ?
 */
export function isRegistered(s: PrsState, id: RouteId): boolean {
  return s.b[id] === 3 || s.b[id] === 5;
}

/** Un itinéraire est-il sous D.M.T. ? */
export function isUnderDmt(s: PrsState, id: RouteId): boolean {
  return s.dmt?.route === id;
}

// ===== Scénarios =============================================================

/**
 * Lance un scénario (`scenarN()`) : remise à zéro complète, numéros de
 * circulation, zones déjà occupées, puis démarrage de l'horloge simulée.
 * Les phases sont ensuite jouées par `advanceScenario()` depuis `tick()`.
 */
export function startScenario(id: string, now: number = Date.now()): PrsState {
  const def = SCENARIO_BY_ID[id];
  const s = createInitialState();
  if (!def) return s;

  for (const [k, v] of Object.entries(def.nums)) {
    // `EVO` : une **évolution** n'a pas de numéro de circulation, et
    // l'original ne fait pas avancer son compteur
    // (`if (trainvcm!="EVO"){trainvcm++;…}`). Le fil est porté, mais le train
    // garde ici le numéro par défaut de son compteur au lieu du libellé.
    if (typeof v === 'number') s.trainNum[k as TrainCounter] = v;
  }
  if (def.degage) s.dtrain = { ...def.degage };
  for (const z of def.occupied ?? []) s.zones[z] = 2;
  // `scenar5()` : `trpresvc = 1; document.saat.casec.value = "135200";` — un
  // train est déjà garé voie centrale quand l'aiguilleur prend le poste.
  if (def.voieCentrale != null) {
    s.trpresvc = true;
    s.saat.nu = String(def.voieCentrale);
  }

  s.scenario = {
    id,
    startSec: startSeconds(def),
    startedAt: now,
    fired: {},
    armed: {},
    retarde: {},
    incidentAt: def.incident ? now + def.incident.afterMs : null,
    alertArmedAt: null,
    alertUntil: null,
    repairAt: null,
  };

  refresh(s);
  log(s, 'info', `${def.label} — ${def.hint}.`);
  return s;
}

/** Arrête le scénario en cours ; les circulations engagées disparaissent. */
export function stopScenario(state: PrsState): PrsState {
  const s = clone(state);
  s.scenario = null;
  s.trains = [];
  log(s, 'info', 'Fin du scénario.');
  refresh(s);
  return s;
}

/**
 * Boucle `scaphX()` : compare la minute simulée à la table des phases et
 * engage les trains dus, puis injecte le dérangement différé.
 *
 * Comme l'original, la comparaison est une **égalité** sur `"HHhMM"` : une
 * phase antérieure à l'heure de départ ne se joue jamais.
 */
function advanceScenario(s: PrsState, now: number): boolean {
  const run = s.scenario;
  if (!run) return false;
  const def = SCENARIO_BY_ID[run.id];
  if (!def) return false;
  let moved = false;

  // Dérangement différé (`scaphad()`, `scaphbe()`…).
  if (run.incidentAt != null && now >= run.incidentAt && def.incident) {
    run.incidentAt = null;
    const inc = def.incident;
    if (inc.kind === 'zone') s.faults.zone = inc.id;
    else if (inc.kind === 'aig') s.faults.aig = { id: inc.id, kind: inc.fault };
    else s.faults.route = { id: inc.id, kind: inc.fault };
    log(s, 'error', `${def.label} — incident injecté : ${def.hint.toLowerCase()}.`);
    moved = true;
  }

  // Alerte radio (sn4) — `scaphsndy()` guette, `scaphsndz()` lève.
  if (def.radioAlert) {
    const ra = def.radioAlert;
    if (run.alertUntil != null && now >= run.alertUntil) {
      run.alertUntil = null;
      s.alerteRadio = false;
      log(s, 'info', `Régulateur — ${ra.message}`);
      moved = true;
    } else if (
      run.alertArmedAt != null &&
      run.alertUntil == null &&
      !s.alerteRadio &&
      now >= run.alertArmedAt &&
      s.zones.z79 === 2 &&
      s.trains.some((tr) => tr.num === ra.trainNum)
    ) {
      run.alertArmedAt = null;
      run.alertUntil = now + ra.holdMs;
      s.alerteRadio = true;
      log(
        s,
        'error',
        `Alerte radio émise par le conducteur du ${ra.trainNum} — messages conducteurs suspendus.`,
      );
      moved = true;
    }
  }

  // Arrêt accidentel — `scaphce()` : le conducteur annonce avoir dépanné.
  // Le délai est un minimum ; la panne doit d'abord avoir eu lieu.
  if (run.repairAt != null && now >= run.repairAt && hasBrokenDownTrain(s)) {
    run.repairAt = null;
    s.accidentalStop = 2;
    moved = true;
  }

  const at = formatRapelh(simSeconds(run.startSec, run.startedAt, now));
  for (let i = 0; i < def.phases.length; i += 1) {
    const ph = def.phases[i];
    if (run.fired[i]) continue;
    // L'heure venue, la phase s'**arme** et le reste jusqu'à ce que sa garde
    // la laisse passer. Le déclenchement suit toujours l'égalité de la minute
    // — une phase antérieure au départ du scénario ne s'arme jamais.
    if (ph.at === at) run.armed[i] = true;
    if (!run.armed[i]) continue;
    if (!gardePassee(s, ph.attend)) {
      // `else { scaphX = setTimeout("scaphXy()", 10000); phaX = 2; }`
      run.retarde[i] = true;
      continue;
    }
    run.fired[i] = true;
    moved = true;
    // `scaphsnda()` arme le guetteur d'alerte radio 20 s après avoir engagé
    // le premier train.
    if (def.radioAlert && run.alertArmedAt == null && !s.alerteRadio && run.alertUntil == null) {
      const already = Object.keys(run.fired).length === 1;
      if (already) run.alertArmedAt = now + def.radioAlert.armAfterMs;
    }
    // `scaphcb()` : la phase qui engage le train arme aussi son arrêt.
    if (def.accidentalStop && def.accidentalStop.at === ph.at) {
      s.accidentalStop = 1;
      run.repairAt = run.startedAt + def.accidentalStop.repairAfterMs;
    }
    const target = SPAWN_TARGET[ph.spawn];
    // `scapheg()` : `trainvcb = 403540;` avant `traficcb()`.
    if (ph.nums) {
      for (const [k, v] of Object.entries(ph.nums)) s.trainNum[k as TrainCounter] = v;
    }
    // `if (phaX==2) {scapha = setTimeout("traficaa()", 20000);}` : une phase
    // qui a dû attendre laisse au poste le temps de souffler.
    const retard = ph.rattrapage && run.retarde[i] ? 20_000 : 0;
    spawnTrain(
      s,
      {
        thread: target.thread,
        branch: target.branch as BranchId,
        counter: target.counter,
        dest: target.dest,
      },
      now,
      retard,
    );
  }

  return moved;
}

/**
 * La garde d'une phase est-elle levée ?
 *
 * Toutes les conditions relevées dans les `scaph*()` — case libre, train
 * attendu en place, circulation précédente dégagée, compteur au bon numéro,
 * voie centrale occupée, autorisation de mouvement saisie — s'additionnent :
 * il faut qu'elles soient **toutes** vraies, comme le `&&` du source.
 */
function gardePassee(s: PrsState, g: PhaseGuard | undefined): boolean {
  if (!g) return true;
  if (g.libre && s.saat[g.libre] !== '') return false;
  if (g.present && s.saat[g.present.cell] !== String(g.present.num)) return false;
  if (g.degage && s.dtrain[g.degage.fil] !== g.degage.num) return false;
  if (g.compteur && s.trainNum[g.compteur.cle] !== g.compteur.num) return false;
  if (g.voieCentrale && !s.trpresvc) return false;
  if (g.aumSaisie && s.vaum !== 2) return false;
  return true;
}

/** Horloge simulée du scénario en cours, `null` hors scénario. */
export function scenarioSeconds(s: PrsState, now: number): number | null {
  if (!s.scenario) return null;
  return simSeconds(s.scenario.startSec, s.scenario.startedAt, now);
}

// ===== Sons ==================================================================

/** Coupe-son global (`fonson()` : bouton `bson` de la frame `tete`). */
export function toggleSound(state: PrsState): PrsState {
  const s = clone(state);
  s.sound = !s.sound;
  log(s, 'info', s.sound ? 'Son activé.' : 'Son coupé.');
  return s;
}

// ===== Imprimé « Ordre / Avis » ==============================================

/** Les quatre propositions cochables de `propo()`, dans l'ordre de l'imprimé. */
export const ORDRE_PROPOSITIONS = [
  { bit: 1, text: 'De ne pas se remettre en marche jusqu’à nouvel avis' },
  { bit: 10, text: 'Donnez-moi le point kilométrique où s’est arrêtée la tête du train' },
  { bit: 100, text: 'De franchir l’aiguille … au pas' },
  { bit: 1000, text: 'Vous pouvez vous remettre en marche' },
] as const;

export interface OrdreDraft {
  /** Numéro du train destinataire, tel que saisi. */
  train: string;
  /** Propositions cochées, dans l'ordre de l'imprimé. */
  checked: [boolean, boolean, boolean, boolean];
  /** Aiguille visée par la proposition 3. */
  aigpas: AigId | null;
}

/**
 * Transmission de l'imprimé — `corordre()` : le n° de train est obligatoire,
 * les propositions cochées sont combinées en masque, et l'ordre reste en
 * attente jusqu'à ce que le conducteur concerné le collationne.
 */
export function sendOrdre(state: PrsState, draft: OrdreDraft): PrsState {
  const s = clone(state);
  const train = Number.parseInt(draft.train, 10);
  if (!draft.train.trim() || Number.isNaN(train)) {
    log(s, 'warn', 'Ordre — indiquez le n° du train auquel vous désirez remettre cet ordre.');
    return s;
  }
  const com = ORDRE_PROPOSITIONS.reduce(
    (acc, p, i) => acc + (draft.checked[i] ? p.bit : 0),
    0,
  );
  if (com === 0) {
    log(s, 'warn', 'Ordre — aucune proposition retenue.');
    return s;
  }
  if (draft.checked[2] && !draft.aigpas) {
    log(s, 'warn', 'Ordre — désignez l’aiguille à franchir au pas.');
    return s;
  }

  s.ordre = { no: s.ordre.no, com, train, aigpas: draft.aigpas };
  const retenu = ORDRE_PROPOSITIONS.filter((_, i) => draft.checked[i])
    .map((prop, idx) =>
      prop.bit === 100
        ? `de franchir l’aiguille ${(draft.aigpas ?? '').replace('aig', '')} au pas`
        : idx === 0
          ? prop.text.charAt(0).toLowerCase() + prop.text.slice(1)
          : prop.text.charAt(0).toLowerCase() + prop.text.slice(1),
    )
    .join(', ');
  log(s, 'info', `Ordre n° ${s.ordre.no} au train ${train} — ${retenu}.`);
  return s;
}

/** Annule l'ordre en attente (`annordr()`). */
export function cancelOrdre(state: PrsState): PrsState {
  const s = clone(state);
  if (s.ordre.com === 0) return state;
  s.ordre = { ...s.ordre, com: 0, train: 0, aigpas: null };
  log(s, 'info', 'Ordre annulé.');
  return s;
}

// ===== Bulletin Cba ==========================================================

/** Les trois mentions de mode de transmission de l'imprimé (`cbar2`). */
export const CBA_TRANSMISSIONS = [
  'délivré directement',
  'transmis par téléphone',
  'transmis par radio',
] as const;

export interface CbaDraft {
  /** Numéro du train destinataire. */
  train: string;
  /** Numéro du signal, tel que saisi : « 81 », « C 81 », « Cv 88 »… */
  signal: string;
  /** Nature retenue : carré, sinon guidon d'arrêt (`cbar1`). */
  carre: boolean;
  /** Mode de transmission retenu, ou `null` si aucun (`cbar2`). */
  trans: string | null;
}

/**
 * Normalisation du n° de signal — `verifcba()` accepte « 81 », « c81 »,
 * « C 81 »… et pour les carrés violets « cv85 », « C 85 », « 85 ».
 * Renvoie `0` si la saisie ne désigne aucun signal du poste : le bulletin part
 * quand même, et le conducteur signalera l'erreur.
 */
export function normalizeSignalRef(raw: string): number {
  const cleaned = raw.trim().toLowerCase().replace(/\s+/g, '');
  const m = /^(?:cv|c)?(\d{2})$/.exec(cleaned);
  const n = m ? Number(m[1]) : Number.NaN;
  return [81, 82, 84, 85, 88].includes(n) ? n : 0;
}

/** Transmission du bulletin — `verifcba()`. */
export function sendCba(state: PrsState, draft: CbaDraft): PrsState {
  const s = clone(state);
  if (!draft.train.trim()) {
    log(s, 'warn', 'Cba — vous n’avez pas indiqué le n° du train.');
    return s;
  }
  if (!draft.signal.trim()) {
    log(s, 'warn', 'Cba — vous n’avez pas indiqué le n° du signal.');
    return s;
  }
  if (!draft.trans) {
    log(s, 'warn', 'Cba — vous n’avez pas sélectionné le mode de transmission.');
    return s;
  }

  const signal = normalizeSignalRef(draft.signal);
  const train = Number.parseInt(draft.train, 10);
  s.cba = {
    no: s.cba.no,
    pending: true,
    forCv88: signal === 88,
    train: Number.isNaN(train) ? 0 : train,
    signal,
    carre: draft.carre,
    trans: draft.trans,
  };
  log(
    s,
    'info',
    `Cba n° ${s.cba.no} au train ${draft.train} — franchissement ${
      draft.carre ? 'du signal carré' : 'du guidon d’arrêt'
    } ${draft.signal}, ${draft.trans}.`,
  );
  return s;
}

/** Annulation du bulletin en cours (`anncba()` : `nocba--`). */
export function cancelCba(state: PrsState): PrsState {
  const s = clone(state);
  if (!s.cba.pending) return state;
  s.cba = { ...s.cba, pending: false, forCv88: false };
  log(s, 'info', 'Cba annulé.');
  return s;
}

// ===== Dérangements proposés au clic droit ==================================

/** Élément du TCO visé par un menu contextuel. */
export type FaultTarget =
  | { kind: 'zone'; id: ZoneId }
  | { kind: 'aig'; id: AigId }
  | { kind: 'signal'; id: SignalId };

/** Une entrée du menu contextuel. */
export interface FaultOption {
  label: string;
  /** Applique l'entrée à l'état. */
  apply: (s: PrsState) => PrsState;
  /** L'entrée correspond au dérangement actuellement actif. */
  active: boolean;
}

/** Libellé lisible d'un élément du TCO. */
export function faultTargetLabel(target: FaultTarget): string {
  if (target.kind === 'aig') return `Aiguille ${target.id.replace('aig', '')}`;
  if (target.kind === 'signal') return SIGNALS.find((s) => s.id === target.id)?.label ?? target.id;
  return `Zone ${target.id}`;
}

/**
 * Dérangements applicables à un élément du TCO, dans l'ordre du menu
 * d'origine (§8 de la spec). Renvoie une liste vide pour les pastilles qui
 * n'ont pas de dérangement au menu du poste.
 */
export function faultOptionsFor(state: PrsState, target: FaultTarget): FaultOption[] {
  if (target.kind === 'aig') {
    const id = target.id;
    return (Object.keys(AIG_FAULT_LABELS) as AigFaultKind[]).map((kind) => ({
      label: AIG_FAULT_LABELS[kind],
      active: state.faults.aig?.id === id && state.faults.aig.kind === kind,
      apply: (s: PrsState) => setAigFault(s, { id, kind }),
    }));
  }

  if (target.kind === 'signal') {
    const id = target.id;
    return (Object.keys(SIGNAL_FAULT_LABELS) as SignalFaultKind[]).map((kind) => ({
      label: SIGNAL_FAULT_LABELS[kind],
      active: state.faults.signal?.id === id && state.faults.signal.kind === kind,
      apply: (s: PrsState) => setSignalFault(s, { id, kind }),
    }));
  }

  const key = ZONE_FAULT_OF_ZONE[target.id];
  if (!key) return [];
  const keys: ZoneFaultKey[] = [key];
  // Le dérangement combiné « z82 + z83 » se propose depuis l'un ou l'autre.
  if (key === 'z82' || key === 'z83') keys.push('z8382');
  return keys.map((k) => ({
    label: `Dérangement de zone ${ZONE_FAULT_LABELS[k]}`,
    active: state.faults.zone === k,
    apply: (s: PrsState) => setZoneFault(s, k),
  }));
}

/** Retrait du dérangement portant sur un élément, s'il y en a un. */
export function clearFaultOn(state: PrsState, target: FaultTarget): PrsState {
  if (target.kind === 'aig') return setAigFault(state, null);
  if (target.kind === 'signal') return setSignalFault(state, null);
  return setZoneFault(state, null);
}

/** Un dérangement porte-t-il actuellement sur cet élément ? */
export function hasFaultOn(state: PrsState, target: FaultTarget): boolean {
  if (target.kind === 'aig') return state.faults.aig?.id === target.id;
  if (target.kind === 'signal') return state.faults.signal?.id === target.id;
  const key = ZONE_FAULT_OF_ZONE[target.id];
  return key != null && state.faults.zone === key;
}
