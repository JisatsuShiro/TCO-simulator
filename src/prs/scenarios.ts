// Scénarios pédagogiques du PRS de Springfield.
//
// Portage du §9.4-9.5 de `docs/springfield-prs-spec.md` : les 12 scénarios
// « incident » et les 4 « service normal », avec leur **horloge simulée**.
//
// Dans l'original, chaque scénario est un couple de fonctions :
//
//   scenarN()  ouvre `tete1.html` (horloge simulée démarrant à une heure fixe),
//              appelle `iniderang()`, fixe les numéros de circulation et
//              l'état initial des zones, puis lance `scaphX()` ;
//   scaphX()   boucle toutes les 10 s et compare `rapelh` (« HHhMM ») à une
//              liste d'heures ; à chaque correspondance elle déclenche une
//              phase `scaphXy()` — garde `phaa..phaz` pour ne la jouer qu'une
//              fois — qui engage un train sur l'un des fils de circulation.
//
// La table ci-dessous a été **générée mécaniquement** depuis `gaestro.js` et
// `tete1.html` (heures de départ, numéros, zones initiales, 249 phases,
// dérangements différés) : aucune recopie manuelle, donc aucun risque de
// divergence sur les horaires.
//
// Comme l'original, une phase se déclenche sur **égalité** de la minute
// simulée, pas sur un dépassement : les quelques phases antérieures à l'heure
// de départ du scénario ne se jouent donc jamais — c'est le comportement de
// `gaestro.js`, pas un oubli.

import type { ZoneId, AigId, RouteId } from './topology';
import type { AigFaultKind, RouteFaultKind, SaatCell, ZoneFaultKey } from './engine';

/** Fil et branche sur lesquels une phase engage un train. */
export type SpawnKind =
  /** Voie 1 depuis AG, destination voie 1 (`traficaa`). */
  | 'aa'
  /** Voie 1 depuis AG, destination voie NU (`traficac`). */
  | 'ac'
  /** Voie 2 depuis N2 vers DG (`traficb`). */
  | 'b'
  /** Voie centrale vers DG (`traficcb`). */
  | 'cb'
  /** Voie centrale vers la voie mère (`traficcm`). */
  | 'cm'
  /** Voie mère vers voie 1 (`traficma`). */
  | 'ma'
  /** Voie mère vers voie NU (`traficmc`). */
  | 'mc';

/** Clé de compteur de circulation, une par fil (`trainv1a`, `trainv2`…). */
export type TrainCounter = 'v1a' | 'v1c' | 'v2' | 'vcb' | 'vcm' | 'vm';

/** Dérangement injecté par le scénario, à retardement. */
export type ScenarioIncident =
  | { afterMs: number; kind: 'zone'; id: ZoneFaultKey }
  | { afterMs: number; kind: 'aig'; id: AigId; fault: AigFaultKind }
  | { afterMs: number; kind: 'route'; id: RouteId; fault: RouteFaultKind };

/**
 * Condition qu'une phase attend avant d'engager son train.
 *
 * Chaque `scaph*()` de l'original est bâtie sur le même moule :
 *
 *   function scaphab() {
 *     if ((document.saat.case2.value=="")&&(dtrainv2==135436)) { traficb(); }
 *     else { scapha2 = setTimeout("scaphab()", 10000); phab = 2; }
 *   }
 *
 * La phase ne s'engage donc pas « à l'heure » mais **au plus tôt à l'heure** :
 * tant que le poste n'est pas prêt à la recevoir, elle se represente toutes
 * les dix secondes. C'est ce qui empêche les circulations de s'empiler quand
 * l'aiguilleur prend du retard — et c'est aussi pourquoi 246 des 249 phases en
 * portent une.
 */
export interface PhaseGuard {
  /** Cette case du graphique doit être vide : personne n'attend là. */
  libre?: SaatCell;
  /** Ce numéro doit se trouver dans cette case : le train attendu est en place. */
  present?: { cell: SaatCell; num: number };
  /**
   * La circulation précédente doit avoir dégagé le poste — `dtrainv1` et
   * `dtrainv2`, que `tasixbis()`, `tacsept()` et `tbsix()` posent au numéro
   * du train qui vient de passer.
   */
  degage?: { fil: 'v1' | 'v2'; num: number };
  /** Ce compteur doit être à ce numéro. */
  compteur?: { cle: TrainCounter; num: number };
  /** Un train doit être garé voie centrale (`trpresvc == 1`). */
  voieCentrale?: true;
  /** L'EP MOE doit avoir saisi l'autorisation (`vaum == 2`). */
  aumSaisie?: true;
}

export interface ScenarioPhase {
  /** Heure simulée, au format de `rapelh` : « HHhMM ». */
  at: string;
  spawn: SpawnKind;
  /**
   * Recalage d'un compteur avant d'engager le train.
   *
   * Treize phases le font — `scapheg()` : `trainvcb = 403540; traficcb();`.
   * C'est ainsi qu'un train arrivé par la voie mère garde son numéro 403xxx en
   * repartant de la voie centrale, ou qu'un train de travaux s'intercale. Sans
   * ce recalage les numéros s'écartent de la fiche de situation de travail que
   * l'aiguilleur a sous les yeux.
   */
  nums?: Partial<Record<TrainCounter, number>>;
  /** Ce que la phase attend avant de s'engager. */
  attend?: PhaseGuard;
  /**
   * Le train s'engage **vingt secondes plus tard** si la garde a d'abord
   * refusé — `if (phaX==2) {scapha=setTimeout("traficaa()",20000);}`. Vingt-sept
   * phases prennent cette précaution : elles rattrapent leur retard sans se
   * jeter sur le poste.
   */
  rattrapage?: true;
}

/**
 * Alerte radio du scénario sn4 (`scaphsnda()` → `scaphsndy()` → `scaphsndz()`).
 *
 * Ce n'est pas un dérangement du catalogue mais une **séquence scriptée** :
 * la phase d'ouverture arme un guetteur ; dès que le train désigné est en zone
 * d'approche, le conducteur émet l'alerte radio (sirène en boucle, messages
 * conducteurs suspendus) ; `holdMs` plus tard le régulateur la lève et donne
 * ses instructions.
 */
export interface RadioAlert {
  /** Délai après la 1ʳᵉ phase avant d'armer le guetteur (`scaphsnda()`). */
  armAfterMs: number;
  /** Le train dont l'entrée en zone d'approche déclenche l'alerte. */
  trainNum: number;
  /** Durée de l'alerte avant la levée par le chef UP voie. */
  holdMs: number;
  /** Message du régulateur à la levée (`scaphsndz()`). */
  message: string;
}

export interface ScenarioDef {
  id: string;
  label: string;
  /** Incident ou particularité, pour le sélecteur. */
  hint: string;
  /** Heure de départ de l'horloge simulée (`tete1.html`). */
  start: { h: number; m: number; s: number };
  /**
   * Numéros de circulation de départ, par compteur. `EVO` est la valeur
   * littérale que l'original donne à `trainvcm` pour une **évolution**, qui
   * n'a pas de numéro de circulation (`if (trainvcm!="EVO"){trainvcm++;…}`).
   */
  nums: Partial<Record<TrainCounter, number | 'EVO'>>;
  /**
   * Dernière circulation ayant dégagé le poste, à la prise de service —
   * `dtrainv1` / `dtrainv2` de `scenarN()`. Les gardes des premières phases
   * s'y réfèrent.
   */
  degage?: { v1: number; v2: number };
  /** Zones déjà occupées au lancement. */
  occupied?: ZoneId[];
  /**
   * Numéro du train **déjà garé voie centrale** au lancement — `scenar5()` :
   * `trpresvc = 1; document.saat.casec.value = "135200";`.
   *
   * Sept scénarios commencent ainsi. Ce train n'est pas un objet du moteur :
   * il occupe la voie et s'inscrit au graphique, et c'est la première phase
   * « voie centrale » qui l'engage réellement — son compteur est réglé pour
   * lui redonner ce numéro.
   */
  voieCentrale?: number;
  incident?: ScenarioIncident;
  /** Séquence d'alerte radio, propre au scénario sn4. */
  radioAlert?: RadioAlert;
  /**
   * Arrêt accidentel, propre au scénario 3 : `scaphcb()` arme l'arrêt en
   * engageant le train voie 2, `scaphce()` signale le dépannage.
   */
  accidentalStop?: { at: string; repairAfterMs: number };
  phases: ScenarioPhase[];
}

/**
 * L'horloge simulée avance d'une seconde toutes les **990 ms**
 * (`tete1.html`, `setTimeout(…, 990)`).
 */
export const SIM_TICK_MS = 990;

export const SCENARIOS: ScenarioDef[] = [
  {
    id: '1',
    label: 'Scénario 1',
    hint: 'Absence de contrôle à gauche sur l’aiguille 83a',
    start: { h: 8, m: 12, s: 35 },
    nums: { v1a: 135517, v1c: 135159, v2: 135436, vcb: 135124 },
    degage: { v1: 135517, v2: 135436 },
    incident: { afterMs: 20000, kind: 'aig', id: 'aig83a', fault: 'noCtrlG' },
    phases: [
      { at: '08h13', spawn: 'ac' },
      { at: '08h14', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135436 } } },
      { at: '08h16', spawn: 'cb', attend: { compteur: { cle: 'vcb', num: 135124 }, voieCentrale: true } },
      { at: '08h16', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135161 } } },
      { at: '08h17', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135438 } } },
      { at: '08h19', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135519 } } },
      { at: '08h20', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135440 } } },
      { at: '08h22', spawn: 'ac', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135521 } } },
      { at: '08h23', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135442 } } },
      { at: '08h25', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135163 } } },
      { at: '08h27', spawn: 'cb', attend: { present: { cell: 'nu', num: 135163 }, voieCentrale: true } },
      { at: '08h28', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135523 } } },
      { at: '08h29', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135444 } } },
      { at: '08h31', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135525 } } },
      { at: '08h32', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135446 } } },
      { at: '08h34', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135527 } } },
      { at: '08h35', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135448 } } },
      { at: '08h37', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135529 } } },
      { at: '08h38', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135450 } } },
    ],
  },
  {
    id: '2',
    label: 'Scénario 2',
    hint: 'Dérangement de la zone z81a',
    start: { h: 17, m: 15, s: 31 },
    nums: { v1a: 135931, v1c: 135219, v2: 135862, vcb: 135320 },
    degage: { v1: 135931, v2: 135862 },
    incident: { afterMs: 20000, kind: 'zone', id: 'z81a' },
    phases: [
      { at: '17h16', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135931 } } },
      { at: '17h17', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135862 } } },
      { at: '17h19', spawn: 'ac', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135933 } } },
      { at: '17h20', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135864 } } },
      { at: '17h22', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135221 } } },
      { at: '17h23', spawn: 'cb', attend: { compteur: { cle: 'vcb', num: 135320 }, voieCentrale: true } },
      { at: '17h25', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135935 } } },
      { at: '17h26', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135866 } } },
      { at: '17h28', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135937 } } },
      { at: '17h29', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135868 } } },
      { at: '17h31', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135939 } } },
      { at: '17h32', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135870 } } },
      { at: '17h34', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135941 } } },
      // `scaphsnds()` / `scaphbs()` : `dtrainv2==13572`, un chiffre perdu pour
      // 135872. La garde ne passait jamais et gelait le sens pair — la planche,
      // qui annonce bien 135874 puis 135876, tranche.
      { at: '17h35', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135872 } } },
      { at: '17h37', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135943 } } },
      { at: '17h38', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135874 } } },
    ],
  },
  {
    id: '3',
    label: 'Scénario 3',
    hint: 'Arrêt accidentel voie 2',
    start: { h: 10, m: 18, s: 22 },
    nums: { v1a: 135357, v1c: 135011, v2: 135872, vcb: 135006, vm: 403193 },
    degage: { v1: 135357, v2: 135872 },
    accidentalStop: { at: '10h19', repairAfterMs: 100_000 },
    phases: [
      { at: '10h18', spawn: 'ac', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135357 } } },
      { at: '10h19', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135872 } } },
      { at: '10h22', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135013 } } },
      { at: '10h23', spawn: 'cb', attend: { compteur: { cle: 'vcb', num: 135006 }, voieCentrale: true } },
      { at: '10h24', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135874 } } },
      { at: '10h25', spawn: 'ma', attend: { libre: 'vm', compteur: { cle: 'vm', num: 403193 } } },
      { at: '10h26', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135359 } } },
      { at: '10h27', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135876 } } },
      { at: '10h29', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135361 } } },
      { at: '10h30', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135878 } } },
      { at: '10h32', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135363 } } },
      { at: '10h33', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135880 } } },
      { at: '10h35', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135365 } } },
      { at: '10h36', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135882 } } },
      { at: '10h38', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135367 } } },
      { at: '10h39', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135884 } } },
      { at: '10h41', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135369 } } },
    ],
  },
  {
    id: '4',
    label: 'Scénario 4',
    hint: 'Absence de contrôle à gauche sur l’aiguille 85a',
    start: { h: 13, m: 40, s: 15 },
    nums: { v1a: 135619, v1c: 135253, v2: 135528, vcb: 403198, vm: 403179 },
    degage: { v1: 135619, v2: 135528 },
    incident: { afterMs: 20000, kind: 'aig', id: 'aig85a', fault: 'noCtrlG' },
    phases: [
      { at: '13h41', spawn: 'mc', attend: { libre: 'vm', compteur: { cle: 'vm', num: 403179 } } },
      { at: '13h42', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135528 } } },
      { at: '13h44', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135619 } } },
      { at: '13h45', spawn: 'cb', attend: { compteur: { cle: 'vcb', num: 403198 }, voieCentrale: true } },
      { at: '13h46', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135530 } } },
      { at: '13h47', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135621 } } },
      { at: '13h49', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135532 } } },
      { at: '13h51', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135623 } } },
      { at: '13h53', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135534 } } },
      { at: '13h55', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135625 } } },
      { at: '13h57', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135536 } } },
      { at: '13h59', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135627 } } },
      { at: '14h01', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135538 } } },
      { at: '14h03', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135629 } } },
      { at: '14h05', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135540 } } },
    ],
  },
  {
    id: '5',
    label: 'Scénario 5',
    hint: 'Dérangement de la zone z84',
    start: { h: 12, m: 4, s: 1 },
    nums: { v1a: 135577, v1c: 135191, v2: 135472, vcb: 135198, vm: 403527 },
    degage: { v1: 135577, v2: 135472 },
    occupied: ['z84', 'z86'],
    incident: { afterMs: 20000, kind: 'zone', id: 'z84' },
    voieCentrale: 135200,
    phases: [
      { at: '12h02', spawn: 'ac', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135195 } } },
      { at: '12h03', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135470 } } },
      { at: '12h04', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135577 } }, rattrapage: true },
      { at: '12h05', spawn: 'cb', attend: { compteur: { cle: 'vcb', num: 135198 }, voieCentrale: true }, rattrapage: true },
      { at: '12h06', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135472 } }, rattrapage: true },
      { at: '12h07', spawn: 'mc', attend: { libre: 'vm', compteur: { cle: 'vm', num: 403527 } } },
      { at: '12h10', spawn: 'cb', nums: { vcb: 403540 }, attend: { present: { cell: 'nu', num: 403529 }, voieCentrale: true }, rattrapage: true },
      { at: '12h11', spawn: 'ac', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135579 } }, rattrapage: true },
      { at: '12h13', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135474 } }, rattrapage: true },
      { at: '12h14', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135193 } }, rattrapage: true },
      { at: '12h17', spawn: 'cb', nums: { vcb: 135200 }, attend: { present: { cell: 'nu', num: 135193 }, voieCentrale: true }, rattrapage: true },
      { at: '12h17', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135581 } }, rattrapage: true },
      { at: '12h19', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135476 } } },
      { at: '12h20', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135583 } } },
      { at: '12h22', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135478 } } },
      { at: '12h23', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135585 } } },
      { at: '12h25', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135480 } } },
      { at: '12h26', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135587 } } },
    ],
  },
  {
    id: '6',
    label: 'Scénario 6',
    hint: 'Dérangement de la zone z83',
    start: { h: 20, m: 39, s: 32 },
    nums: { v1a: 135865, v1c: 135289, v2: 135810, vcb: 135382 },
    degage: { v1: 135865, v2: 135810 },
    occupied: ['z84', 'z86'],
    incident: { afterMs: 20000, kind: 'zone', id: 'z83' },
    voieCentrale: 135384,
    phases: [
      { at: '20h35', spawn: 'ac', attend: { libre: 'v1ag' } },
      { at: '20h36', spawn: 'b', attend: { libre: 'v2n2', compteur: { cle: 'v2', num: 135808 } } },
      { at: '20h38', spawn: 'aa', attend: { libre: 'v1ag', compteur: { cle: 'v1a', num: 135863 } } },
      { at: '20h40', spawn: 'cb', attend: { compteur: { cle: 'vcb', num: 135382 }, voieCentrale: true } },
      { at: '20h41', spawn: 'ac', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135865 } } },
      { at: '20h42', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135810 } } },
      { at: '20h44', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135291 } } },
      { at: '20h46', spawn: 'cb', attend: { present: { cell: 'nu', num: 135291 }, voieCentrale: true } },
      { at: '20h47', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135867 } } },
      { at: '20h48', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135812 } } },
      { at: '20h50', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135869 } } },
      { at: '20h51', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135814 } } },
      { at: '20h53', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135871 } } },
      { at: '20h54', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135816 } } },
      { at: '20h56', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135873 } } },
      { at: '20h57', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135818 } } },
      { at: '20h59', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135875 } } },
      { at: '21h00', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135820 } } },
      { at: '21h02', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135877 } } },
      { at: '21h03', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135822 } } },
    ],
  },
  {
    id: '7',
    label: 'Scénario 7',
    hint: 'Dérangement de la partie électrique de la commande de l’aiguille 82',
    start: { h: 0, m: 10, s: 3 },
    nums: { v1a: 135927, v1c: 135317, v2: 135922, vcb: 508000 },
    degage: { v1: 135927, v2: 135922 },
    occupied: ['z84', 'z86'],
    incident: { afterMs: 20000, kind: 'aig', id: 'aig82', fault: 'elec' },
    voieCentrale: 508002,
    phases: [
      { at: '00h10', spawn: 'cb', attend: { compteur: { cle: 'vcb', num: 508000 }, voieCentrale: true } },
      { at: '00h11', spawn: 'ac', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135927 } } },
      { at: '00h12', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135922 } } },
      { at: '00h14', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135319 } } },
      { at: '00h16', spawn: 'cb', nums: { vcb: 135426 }, attend: { present: { cell: 'nu', num: 135319 }, voieCentrale: true } },
      { at: '00h17', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135929 } } },
      { at: '00h18', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135924 } } },
      { at: '00h20', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135931 } } },
      { at: '00h21', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135926 } } },
      { at: '00h23', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135933 } } },
      { at: '00h24', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135928 } } },
      { at: '00h26', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135935 } } },
      { at: '00h27', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135930 } } },
      { at: '00h29', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135937 } } },
      { at: '00h30', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135932 } } },
      { at: '00h32', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135939 } } },
      { at: '00h33', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135934 } } },
    ],
  },
  {
    id: '8',
    label: 'Scénario 8',
    hint: 'Dérangement des zones z82 et z83',
    start: { h: 11, m: 34, s: 43 },
    nums: { v1a: 135541, v1c: 135127, v2: 135404, vcb: 135136 },
    degage: { v1: 135541, v2: 135404 },
    occupied: ['z84', 'z86'],
    incident: { afterMs: 20000, kind: 'zone', id: 'z8382' },
    voieCentrale: 135138,
    phases: [
      { at: '11h35', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135541 } } },
      { at: '11h35', spawn: 'cb', attend: { compteur: { cle: 'vcb', num: 135136 }, voieCentrale: true } },
      { at: '11h37', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135404 } } },
      { at: '11h39', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135543 } } },
      { at: '11h41', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135406 } } },
      { at: '11h43', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135545 } } },
      { at: '11h45', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135408 } } },
      { at: '11h47', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135547 } } },
      { at: '11h49', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135410 } } },
      { at: '11h51', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135549 } } },
      { at: '11h53', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135412 } } },
      { at: '11h55', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135551 } } },
      { at: '11h57', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135414 } } },
      { at: '11h59', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135553 } } },
    ],
  },
  {
    id: '9',
    label: 'Scénario 9',
    hint: 'Raté de formation de l’itinéraire AM-NU',
    start: { h: 5, m: 28, s: 25 },
    nums: { v1a: 135501, v1c: 135003, v2: 135512, vcb: 403030, vm: 403021 },
    degage: { v1: 135501, v2: 135512 },
    incident: { afterMs: 20000, kind: 'route', id: 'amnu', fault: 'formation' },
    phases: [
      { at: '05h29', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135501 } } },
      { at: '05h30', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135512 } } },
      { at: '05h31', spawn: 'mc', attend: { libre: 'vm', compteur: { cle: 'vm', num: 403021 } } },
      { at: '05h33', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135514 } } },
      { at: '05h34', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135503 } } },
      { at: '05h37', spawn: 'cb', attend: { voieCentrale: true } },
      { at: '05h38', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135505 } } },
      { at: '05h40', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135516 } } },
      { at: '05h42', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135507 } } },
      { at: '05h44', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135518 } } },
      { at: '05h46', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135509 } } },
      { at: '05h48', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135520 } } },
      { at: '05h50', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135511 } } },
      { at: '05h52', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135522 } } },
      { at: '05h54', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135513 } } },
      { at: '05h56', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135524 } } },
    ],
  },
  {
    id: '10',
    label: 'Scénario 10',
    hint: 'Dérangement de la zone z83',
    start: { h: 9, m: 29, s: 2 },
    nums: { v1a: 135577, v1c: 135195, v2: 135470, vcb: 135198, vm: 403527 },
    degage: { v1: 135577, v2: 135470 },
    occupied: ['z84', 'z86'],
    incident: { afterMs: 20000, kind: 'zone', id: 'z83' },
    voieCentrale: 135200,
    phases: [
      { at: '09h29', spawn: 'ma', attend: { libre: 'vm', compteur: { cle: 'vm', num: 403527 } } },
      { at: '09h30', spawn: 'cb', attend: { compteur: { cle: 'vcb', num: 135198 }, voieCentrale: true }, rattrapage: true },
      { at: '09h31', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135577 } }, rattrapage: true },
      { at: '09h32', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135470 } }, rattrapage: true },
      { at: '09h33', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135579 } }, rattrapage: true },
      { at: '09h35', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135472 } }, rattrapage: true },
      { at: '09h35', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135581 } }, rattrapage: true },
      { at: '09h38', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135474 } }, rattrapage: true },
      { at: '09h41', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135476 } }, rattrapage: true },
      { at: '09h44', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135478 } } },
    ],
  },
  {
    id: '11',
    label: 'Scénario 11',
    hint: 'Dérangement de la zone z81b',
    start: { h: 19, m: 12, s: 41 },
    nums: { v1a: 135717, v1c: 403601, v2: 135636, vcb: 135324, vcm: 'EVO' },
    degage: { v1: 135717, v2: 135636 },
    incident: { afterMs: 20000, kind: 'zone', id: 'z81b' },
    phases: [
      { at: '19h13', spawn: 'ac' },
      { at: '19h14', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135636 } } },
      { at: '19h16', spawn: 'cm', attend: { compteur: { cle: 'vcb', num: 135324 }, voieCentrale: true } },
      { at: '19h17', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135638 } } },
      { at: '19h19', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 403603 } } },
      { at: '19h20', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135640 } } },
      { at: '19h22', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135719 } } },
      { at: '19h23', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135642 } } },
      { at: '19h25', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135721 } } },
      { at: '19h26', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135644 } } },
      { at: '19h28', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135723 } } },
      { at: '19h29', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135646 } } },
    ],
  },
  {
    id: '12',
    label: 'Scénario 12',
    hint: 'Fenêtre travaux : aucune circulation de 01h37 à 03h25',
    start: { h: 1, m: 32, s: 21 },
    nums: { v1a: 135917, v1c: 135371, v2: 135836, vcb: 135424 },
    degage: { v1: 135917, v2: 135836 },
    occupied: ['z84', 'z86'],
    voieCentrale: 135426,
    phases: [
      { at: '01h33', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135836 } } },
      { at: '01h34', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135917 } } },
      { at: '01h36', spawn: 'cb', attend: { compteur: { cle: 'vcb', num: 135424 }, voieCentrale: true } },
      { at: '01h37', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135838 } } },
      { at: '03h25', spawn: 'aa', nums: { v1a: 747325 }, attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135919 } } },
      { at: '03h26', spawn: 'b', nums: { v2: 135342 }, attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135840 } } },
      { at: '03h28', spawn: 'aa', nums: { v1a: 135521 }, attend: { libre: 'v1ag', degage: { fil: 'v1', num: 747327 } } },
      { at: '03h30', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135344 } } },
      { at: '03h32', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135523 } } },
      { at: '03h34', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135346 } } },
    ],
  },
  {
    id: '91',
    label: 'Service normal 1',
    hint: 'Demande d’auto. M par l’EP MOE',
    start: { h: 21, m: 17, s: 12 },
    nums: { v1a: 135357, v1c: 135011, v2: 135872, vcb: 135006, vm: 403193 },
    // Non porté : 21h20 scaphsnae
    degage: { v1: 135357, v2: 135872 },
    phases: [
      { at: '21h18', spawn: 'ac', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135357 } } },
      { at: '21h19', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135872 } } },
      { at: '21h22', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135013 } } },
      { at: '21h23', spawn: 'cb', attend: { compteur: { cle: 'vcb', num: 135006 }, voieCentrale: true } },
      { at: '21h24', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135874 } } },
      { at: '21h24', spawn: 'ma', attend: { libre: 'vm', compteur: { cle: 'vm', num: 403193 }, aumSaisie: true } },
      { at: '21h26', spawn: 'ac', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135359 } } },
      { at: '21h27', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135876 } } },
      { at: '21h29', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135015 } } },
      { at: '21h31', spawn: 'cb', attend: { present: { cell: 'nu', num: 135015 }, voieCentrale: true } },
      { at: '21h33', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135361 } } },
      { at: '21h33', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135878 } } },
      { at: '21h35', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135363 } } },
      { at: '21h36', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135880 } } },
      { at: '21h38', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135365 } } },
      { at: '21h39', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135882 } } },
      { at: '21h41', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135367 } } },
    ],
  },
  {
    id: '92',
    label: 'Service normal 2',
    hint: 'Modification d’itinéraire',
    start: { h: 19, m: 12, s: 42 },
    nums: { v1a: 135717, v1c: 403601, v2: 135636, vcb: 135324, vcm: 'EVO' },
    degage: { v1: 135717, v2: 135636 },
    phases: [
      { at: '19h13', spawn: 'ac' },
      { at: '19h14', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135636 } } },
      { at: '19h16', spawn: 'cm', attend: { present: { cell: 'nu', num: 403603 }, voieCentrale: true } },
      { at: '19h17', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135638 } } },
      { at: '19h18', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 403603 } } },
      { at: '19h19', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135640 } } },
      { at: '19h20', spawn: 'ac', nums: { v1c: 135031 }, attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135719 } } },
      { at: '19h23', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135642 } } },
      { at: '19h25', spawn: 'aa', nums: { v1a: 558801 }, attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135033 } } },
      { at: '19h27', spawn: 'cb', attend: { present: { cell: 'nu', num: 135033 }, voieCentrale: true } },
      { at: '19h29', spawn: 'aa', nums: { v1a: 135719 }, attend: { libre: 'v1ag', degage: { fil: 'v1', num: 558803 } } },
      { at: '19h29', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135644 } } },
      { at: '19h31', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135721 } } },
      { at: '19h32', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135646 } } },
    ],
  },
  {
    id: '93',
    label: 'Service normal 3',
    hint: 'Mise en marche du 747204 en provenance de la voie 2',
    start: { h: 12, m: 4, s: 11 },
    nums: { v1a: 135577, v1c: 135191, v2: 747202, vcb: 135198, vm: 403527 },
    degage: { v1: 135577, v2: 135472 },
    occupied: ['z84', 'z86'],
    voieCentrale: 135200,
    phases: [
      { at: '12h04', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135577 } }, rattrapage: true },
      { at: '12h05', spawn: 'cb', attend: { compteur: { cle: 'vcb', num: 135198 }, voieCentrale: true }, rattrapage: true },
      { at: '12h05', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135472 } }, rattrapage: true },
      { at: '12h08', spawn: 'b', nums: { v2: 135472 }, attend: { libre: 'v2n2', degage: { fil: 'v2', num: 747204 } }, rattrapage: true },
      { at: '12h08', spawn: 'mc', attend: { libre: 'vm', compteur: { cle: 'vm', num: 403527 } } },
      { at: '12h10', spawn: 'cb', nums: { vcb: 403540 }, attend: { present: { cell: 'nu', num: 403529 }, voieCentrale: true }, rattrapage: true },
      { at: '12h11', spawn: 'ac', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135579 } }, rattrapage: true },
      { at: '12h13', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135474 } }, rattrapage: true },
      { at: '12h14', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135193 } }, rattrapage: true },
      { at: '12h17', spawn: 'cb', nums: { vcb: 135200 }, attend: { present: { cell: 'nu', num: 135193 }, voieCentrale: true }, rattrapage: true },
      { at: '12h17', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135581 } }, rattrapage: true },
      { at: '12h19', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135476 } } },
      { at: '12h20', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135583 } } },
      { at: '12h22', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135478 } } },
      { at: '12h23', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135585 } } },
      { at: '12h25', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135480 } } },
      { at: '12h26', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135587 } } },
    ],
  },
  {
    id: '94',
    label: 'Service normal 4',
    hint: 'Alerte radio : rocher sur voie 1 au Km 14,400',
    start: { h: 17, m: 15, s: 21 },
    nums: { v1a: 135931, v1c: 135219, v2: 135862, vcb: 797300 },
    degage: { v1: 135931, v2: 135862 },
    radioAlert: {
      armAfterMs: 20_000,
      trainNum: 135_933,
      holdMs: 30_000,
      message:
        'Le conducteur du train n° 135864 avise qu’il a émis l’alerte radio suite à la présence ' +
        'd’un rocher sur voie 1 au Km 14,400. Le régulateur autorise la reprise de la circulation ' +
        'sur la voie 2 et vous demande de recevoir le train n° 135933 sur la voie centrale. ' +
        'Ce train repartira en 797302 vers Capital City dès que possible.',
    },
    phases: [
      { at: '17h16', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135931 } } },
      { at: '17h16', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135862 } } },
      { at: '17h19', spawn: 'ac', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135933 } } },
      { at: '17h19', spawn: 'cb', attend: { present: { cell: 'nu', num: 135933 }, voieCentrale: true } },
      { at: '17h20', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135864 } } },
      { at: '17h22', spawn: 'aa', attend: { libre: 'v1ag', present: { cell: 'nu', num: 135221 }, degage: { fil: 'v1', num: 135221 } } },
      { at: '17h23', spawn: 'cb', nums: { vcb: 135320 }, attend: { present: { cell: 'nu', num: 135221 }, voieCentrale: true } },
      { at: '17h25', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135935 } } },
      { at: '17h26', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135866 } } },
      { at: '17h28', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135937 } } },
      { at: '17h29', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135868 } } },
      { at: '17h31', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135939 } } },
      { at: '17h32', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135870 } } },
      { at: '17h34', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135941 } } },
      // `scaphsnds()` / `scaphbs()` : `dtrainv2==13572`, un chiffre perdu pour
      // 135872. La garde ne passait jamais et gelait le sens pair — la planche,
      // qui annonce bien 135874 puis 135876, tranche.
      { at: '17h35', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135872 } } },
      { at: '17h37', spawn: 'aa', attend: { libre: 'v1ag', degage: { fil: 'v1', num: 135943 } } },
      { at: '17h38', spawn: 'b', attend: { libre: 'v2n2', degage: { fil: 'v2', num: 135874 } } },
    ],
  },];

export const SCENARIO_BY_ID: Record<string, ScenarioDef> = Object.fromEntries(
  SCENARIOS.map((s) => [s.id, s]),
);

// ===== Horloge simulée =======================================================

/** Secondes depuis minuit de l'heure de départ d'un scénario. */
export function startSeconds(d: ScenarioDef): number {
  return d.start.h * 3600 + d.start.m * 60 + d.start.s;
}

/** Seconde simulée courante, à partir de l'échéance réelle du lancement. */
export function simSeconds(startSec: number, startedAt: number, now: number): number {
  return startSec + Math.floor(Math.max(0, now - startedAt) / SIM_TICK_MS);
}

/** Format `rapelh` de l'original : « HHhMM ». */
export function formatRapelh(sec: number): string {
  const t = ((sec % 86_400) + 86_400) % 86_400;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}`;
}

/** Horloge complète, pour le bandeau. */
export function formatSimClock(sec: number): string {
  const t = ((sec % 86_400) + 86_400) % 86_400;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

/**
 * Planche de la situation de travail (« T.S.T. ») d'un scénario — `ftst()`.
 *
 * Le bouton `btst` ouvre `doc/tst/scenarN.html`, qui n'affiche qu'un scan :
 * le graphique de circulation prévu. Les quatre scénarios « service normal »
 * y portent le préfixe `sn` et l'identifiant 91 à 94.
 *
 * Le poste n'affiche plus le scan mais sa transcription (`./tst`), rendue en
 * tableau. Cette fonction reste le chemin vers la pièce d'origine, celle à
 * laquelle on se reporte pour trancher.
 */
export function ficheScenario(id: string): string {
  const n = Number(id);
  const nom = n >= 91 ? `scenarsn${n - 90}` : `scenar${n}`;
  return `/images/prs/tst/${nom}.jpg`;
}

/**
 * Le fil et la branche visés par une phase, et le compteur à utiliser.
 *
 * `dest` est la destination inscrite au graphique : un train engagé par
 * `traficcb()` **va à DG** et refusera l'itinéraire de la voie mère. Les
 * circulations des fils A et B n'ont pas cette contrainte.
 */
export const SPAWN_TARGET: Record<
  SpawnKind,
  {
    thread: 'A' | 'B' | 'C' | 'M';
    branch: string;
    counter: TrainCounter;
    dest: 'dg' | 'vm' | 'v1' | 'nu' | null;
    label: string;
  }
> = {
  aa: { thread: 'A', branch: 'a', counter: 'v1a', dest: null, label: 'voie 1 depuis AG' },
  ac: { thread: 'A', branch: 'a', counter: 'v1c', dest: null, label: 'voie 1 depuis AG (vers NU)' },
  b: { thread: 'B', branch: 'b', counter: 'v2', dest: null, label: 'voie 2 depuis N2' },
  cb: { thread: 'C', branch: 'c', counter: 'vcb', dest: 'dg', label: 'voie centrale vers DG' },
  cm: { thread: 'C', branch: 'c', counter: 'vcm', dest: 'vm', label: 'voie centrale vers la voie mère' },
  ma: { thread: 'M', branch: 'm', counter: 'vm', dest: 'v1', label: 'voie mère vers voie 1' },
  mc: { thread: 'M', branch: 'm', counter: 'vm', dest: 'nu', label: 'voie mère vers voie NU' },
};
