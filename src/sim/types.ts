// Types de la simulation Gessie. Reverse-engineered depuis le bundle Vue de
// l'app originale (renderer.js, builder à @130000-@139000).
//
// Convention : les IDs d'affectation sont des strings sémantiques générées par
// le builder à partir de l'item :
//   - aiguille : "Ag" + name        (ex: "Ag1", "Ag2")
//   - signal   : name               (ex: "S1", "D1", "Carré tiroir")
//   - controle : name               (ex: "Cv4")
//   - zone     : "z " + name        (ex: "z 1", "z .V4")  — TODO confirmer
//   - cantonnement : "gare-" + name (ex: "gare-Lyon")
//
// Les enclenchements et parcours JSON s'y réfèrent par chaîne — ne JAMAIS
// changer le schéma de génération de ces IDs.

// ===== Événements (file priorisée du Clock store) =====

/**
 * Un événement programmé. Tous les changements d'état "dans le temps" passent
 * par cette file (mouvement de train, presse/relâche pédale, fermeture FA,
 * fin d'EAP, déclenchement d'avarie scénarisée, etc.).
 *
 * `type` est dispatché vers une action du Player store du même nom.
 * Les payload-fields (train, target, ...) dépendent du type.
 */
export interface SimEvent {
  uid: string;
  /** Date.now()-style (ms epoch). undefined = événement en pause. */
  time: number | undefined;
  /** Nom de l'action à dispatcher (ex: "moveTrainIn", "releasePedale"). */
  type: string;
  /** Si en pause : durée restante avant échéance (ms). */
  remainingTime?: number;
  /** Champs optionnels selon le type. */
  train?: Train;
  target?: string;
  affectationId?: string;
  blocId?: string;
  disturbance?: string;
  zoneId?: string;
  direction?: 'pair' | 'impair';
  controlId?: string;
  delay?: number;
  [key: string]: unknown;
}

// ===== Trains =====

export type TrainSize = 'Petit' | 'Moyen' | 'Grand';
export type Direction = 'pair' | 'impair';

export interface Train {
  name: string;
  direction: Direction;
  size: TrainSize;
  speed: number; // 1 = ms réelles
  startingPoint: string;
  /** Champs ajoutés par la sim. */
  startingTime?: number; // minutes après starting_time du scénario
}

// ===== Enclenchements (incompatibilités) =====

/**
 * Forme parsée des incompatibilités d'un levier.
 * - plus[]  : aucun de ces leviers ne doit être en position "plus"
 * - minus[] : aucun de ces leviers ne doit être en position "minus"
 * - groups[]: chaque groupe = OR ; au moins un terme doit céder pour autoriser
 */
export interface Incompatibility {
  plus: string[];
  minus: string[];
  groups: { plus: string[]; minus: string[] }[];
}

// ===== Levier =====

export interface KeyHole {
  keyId: string;
  /** false = clé absente, sinon string identifiant la clé présente. */
  presence: string | false;
  /** Position du levier requise pour pouvoir retirer la clé. */
  position: 'plus' | 'minus';
}

/**
 * Entrée de zapLock attachée à un levier : verrou d'approche en cours d'attente
 * sur ce levier (libéré quand le levier rebascule en plus).
 */
export interface ZapLockEntry {
  signalId: string;
  zoneId: string;
}

export interface Lever {
  id: string;
  label?: string;
  position: 'plus' | 'minus';
  /** Affectations contrôlées par ce levier (un même levier peut piloter plusieurs items). */
  affectations: string[];
  /**
   * Pour chaque affectation, la position "plus"/"minus" → position cible
   * de l'item (ex: aiguille G/D, signal F/O).
   */
  correspondances: { plus: string; minus: string }[];
  incompatibilities: {
    plus: Incompatibility;
    minus: Incompatibility;
    moving: Incompatibility;
  };
  keyholes?: Record<string, KeyHole>;
  /**
   * Étiquettes mémo posées par l'opérateur (DA / DSA / DR). Plusieurs
   * exemplaires du même dispositif sont autorisés (doublons). Pure couche
   * d'annotation, sans effet sur les enclenchements. Cf. `changeDispositifAttention`.
   */
  dispositifs: string[];
  /** Pour zonesIsolees / zonesTransit : indexé par "plus"/"minus". */
  zonesIsolees?: { plus: string[]; minus: string[] };
  zonesTransit?: { plus: string[]; minus: string[] };
  /** Directions actives sur ce levier (signaux) — cf. SignalDirection. */
  directions?: SignalDirection[];
  /**
   * Signal principal piloté par ce levier (annexeII `signalId`). Sert au
   * formatage du label "{signalId}/{destination}" type Gessie. Première
   * occurrence d'annexeII retenue si plusieurs entries existent.
   */
  signalId?: string;
  /**
   * Labels de destination abbréviés (annexeII `id`) — un par entrée annexeII
   * ayant ce leverId. Ex : ["VA", "V5 à 9", "EP"] pour lever 22 saint_saturnin.
   * Utilisé pour composer "{signalId}/{first à last}" quand plusieurs leviers
   * partagent le même signal.
   */
  directionLabels?: string[];
  /** Annulateur électrique : levier symbolique de "rétention". */
  annulateurElec?: { enabled: boolean };
  /** Verrous d'approche en attente — chaînés sur le levier. */
  zapLock?: ZapLockEntry[];
}

// ===== Affectation (état dynamique d'un item) =====

export interface ControleFlags {
  gauche?: boolean;
  droite?: boolean;
  entrebaillement?: boolean;
  ouverture?: boolean;
  double_zap_eap_epa?: boolean;
}

export interface NextEncounterEntry {
  id: string;
  timeDistance: number; // secondes
}

/** nextEncounter pour aiguille : sub-keyé par position courante (G/D). */
export interface AiguilleNextEncounter {
  G?: NextEncounterEntry;
  D?: NextEncounterEntry;
}

export interface ZoneTransitState {
  lockedByLever: boolean;
  haveTransit: boolean;
  prevZone: string | false;
  nextZone?: string | false;
}

/**
 * État dynamique d'un item TCO. Indexé par ID sémantique dans
 * `Player.affectations`.
 *
 * Tous les types d'item partagent les champs de base (`name`, `type`,
 * `disturbances`, `observers`). Les champs spécialisés sont optionnels
 * et présents selon `type`.
 */
export interface Affectation {
  /** Nom logique de l'item (ex: "1", "S1", "z 2"). */
  name: string;
  type: 'aiguille' | 'signal' | 'controle' | 'zone' | 'taquet' | 'cantonnement' | string;

  /** État courant — sémantique selon type :
   *  - aiguille : "G" | "D" | "g" | "d" (lower = discordance)
   *  - signal/controle : "F" | "O"
   *  - zone : non utilisé (cf. circulation)
   */
  position?: string;
  /** Position cible (signal qui veut s'ouvrir mais bloqué). */
  requestedPosition?: string;

  controle?: ControleFlags;
  observers?: string[];
  /** ID(s) de l'item suivant selon direction (et position pour aiguille). */
  nextEncounter?: Record<string, NextEncounterEntry | AiguilleNextEncounter>;
  disturbances: string[];
  pedales?: Record<string, { pressed?: boolean; nextEncounter?: Record<string, NextEncounterEntry> }>;

  /** Zone uniquement. */
  circulation?: boolean;
  transit?: { pair: ZoneTransitState; impair: ZoneTransitState };
  /** Continuité d'itinéraire (zone). */
  continuite?: { pair?: string; impair?: string };
  /** ATR (annulateur de transit) qui couvre cette zone — id ou false. */
  atr?: string | false;
  /** Zones de protection pointant sur cette zone. */
  zapDeclenchees?: string[];
  eapAnnulation?: string[];
  epaAnnulation?: string[];
  zapRetirees?: string[];
  faTrigger?: string[];

  /** Signal — directions sélectionnables (cf. annexe II). */
  directions?: SignalDirection[];
  /** Verrouillages d'approche actifs : { eap, zap, origins, annulation }. */
  eap?: SignalEap;
  /** Verrouillage de parcours actif. */
  epa?: SignalEpa;
  /** Annulateur FA pressé ? */
  fa?: boolean;
  /**
   * Annulateur de Fermeture Automatique : `enabled` à true = sceau brisé,
   * la FA déclenchée par un train ne refermera pas le signal (le bypass
   * vit dans `closeWithFA`). Repro Gessie (mutation CHANGE_FA_STATUS).
   */
  annulateurFA?: { enabled: boolean };
  /**
   * Annulateur de substitution : permet d'ouvrir le signal *malgré* l'occupation
   * d'une zone de protection. Bouton fugitif (pressé seulement le temps de la
   * dispatch). `zone` désigne la zone de protection à condition (réf. Gessie
   * `controlePermanentAnnulZoneOccupee`) — la dispatch ne fait rien si la zone
   * n'est pas en circulation.
   */
  annulSubstitution?: { pressed: boolean; zone?: string };
  /**
   * État du commutateur de Fermeture Carré : `false` au repos (commutateur
   * non engagé, le signal s'ouvre normalement), `true` quand le commutateur
   * est tiré (signal verrouillé fermé). `undefined` si pas de commutFC.
   * Repro Gessie : `ye.positionFC = !1` à l'init si direction.commutFC ;
   * `toggleCommutFC` fait `positionFC = !positionFC`.
   */
  positionFC?: boolean;

  /** Marqué par controlesVU. */
  positionNormal?: string;
  controleVU?: boolean;
  /** Événements de train en pause sur ce contrôle (téléphone qui sonne). */
  linkedEvents?: string[];
  /** ID du bloc cantonnement (pour sémaphores). */
  blocId?: string;

  /**
   * Actions scénarisées : quand un train de nom donné arrive sur cette
   * affectation, dispatch une action arbitraire. Reproduit Gessie
   * (renderer.js @232298) :
   *   if (l.events && l.events[train.name]) {
   *     dispatch(l.events[train.name].type, l.events[train.name].options);
   *   }
   * Le `type` doit correspondre à un handler dans dispatchPlayerEvent
   * (toggleDisturbance, closeWithFA, …). Les `options` sont fusionnées
   * dans le SimEvent émis.
   */
  events?: Record<string, { type: string; options?: Record<string, unknown> }>;

  /** Champs spécifiques cantonnement (gare-X). */
  // ... ajoutés par le builder cantonnement, peu utilisés pour le moment

  [extra: string]: unknown;
}

export interface SignalDirection {
  leverList: string[];
  aiguille?: { gauche?: string[]; droite?: string[] };
  taquetBas?: string[];
  zonesEspacementAuto?: string[];
  zonesProtectionNonAnn?: string[];
  zonesDeProtections?: string[];
  signauxIntermediaires?: string[];
  fa?: { zone?: string; pedale?: boolean; annulable?: boolean };
  pdProximite?: unknown;
  sensContraireTransitNonAnnulable?: string[];
  sensContraireZoneNonAnnulable?: string[];
  sensContraireTransitAnnulable?: string[];
  sensContraireZoneAnnulable?: string[];
  sensContraireAnnulationCondition?: unknown;
  itineraireTransit?: { pair?: string[]; impair?: string[] };
}

export interface SignalEap {
  eap: boolean;
  zap: boolean;
  origins: Record<string, { consistance_zone?: string | string[]; retention?: unknown; selection?: unknown }>;
  annulation: Record<string, { lever?: string; zone?: string; pedale?: boolean; fa?: boolean; delay?: number }>;
  /** Liste des zones de la consistance (utilisé par zapOff pour décider). */
  consistance?: string[];
}

export interface SignalEpa {
  epa: boolean;
  canceled?: boolean;
  positionFermeture?: boolean;
  fc?: string;
  annulateur?: string;
  annulation: Record<string, { lever?: string; zone?: string; pedale?: boolean; fa?: boolean; delay?: number }>;
}

// ===== Cantonnement (bloc) =====

export interface Bloc {
  id: string;
  gareLabel: string;
  position: 'droite' | 'gauche';
  /** Test : "E" enclenché / "D" délivré. */
  test: string;
  semaphoreId?: string;
  commutSemaphore: 'N' | 'R';
  commutSemaphoreLight: string;
  voieLibre: string;
  reddition: string;
  annonce: string;
  blocage: string;
  testDuration: number;
  dispositifs: string[];
  pedales: Record<string, { pressed?: boolean; nextEncounter?: Record<string, NextEncounterEntry> } | undefined>;
  disturbances: string[];
}

// ===== Boîtes à clés / serrures =====

export interface KeyGroup {
  id: string;
  label?: string;
  keyholes: Record<string, KeyHole>;
}

export interface CentralLock {
  uid: string;
  keyId: string;
  presence: string | boolean;
  position: 'left' | 'right' | 'top' | 'bottom' | string;
  /** JSON-stringifié de `incompatibilities` (legacy / debug). */
  neededKeysList?: string;
  /**
   * Liste de groupes d'incompatibilités. Pour qu'on puisse prendre la clé
   * de ce verrou central, pour chaque groupe `g`, au moins une clé de `g`
   * doit être ABSENTE des autres centralLocks (i.e. déjà prise par
   * l'opérateur ou un homonyme). Si tous les groupes sont satisfaits
   * (i.e. aucun groupe n'est totalement bloqué), la prise est autorisée.
   *
   * Format : un élément peut être string ("VA1") ou string[] (un OR :
   * ["VA2","VA3"] = il suffit qu'une des deux soit absente).
   */
  incompatibilities?: (string | string[])[];
}

// ===== ATR (annulateur de transit) =====

export interface TransitAnnulator {
  id: string;
  leviers: string[];
  zones: string[];
  on: boolean;
  pressed: boolean;
  autorisation: boolean;
  terrain: boolean;
}

// ===== Player state (sortie du builder) =====

export interface PlayerData {
  id: string | undefined; // station id
  items: unknown[]; // copie de station.items pour le rendu
  levers: Record<string, Lever>;
  affectations: Record<string, Affectation>;
  blocs: Bloc[];
  groups: Record<string, KeyGroup>;
  locks: Record<string, KeyHole>;
  centralLocks: Record<string, CentralLock>;
  transitAnnulateurs: TransitAnnulator[];
  /** Map "{itemId}.{trainName}" → disturbance à déclencher au passage. */
  scenarioTargets: Record<string, Record<string, string>>;
  holdedKey: string | undefined;
  phoneIsRinging: boolean;
  discordances_count: number;
}
