// Fiches de situation de travail — le graphique de circulation prévu.
//
// Le bouton `btst` de l'original appelle `ftst()`, qui ouvre `doc/tst/scenarN.html` :
// une page ne contenant qu'un **scan**. Ces planches sont ici transcrites en
// données, pour être rendues en tableau — lisible, sélectionnable, et qui suit
// le thème du poste.
//
// **Pourquoi transcrire plutôt que recalculer.** Le moteur connaît déjà les
// phases de chaque scénario, et l'on pourrait en déduire un horaire. Mais les
// heures des planches sont celles que l'auteur a écrites à la main : elles
// suivent les phases de près sans s'en déduire. Sur le scénario 3, le premier
// AG-NU part deux minutes après sa phase, l'AM-N1 zéro, les AG-N1 une. Les
// recalculer donnerait un horaire plausible mais faux ; on recopie donc.
//
// Le nombre de lignes, lui, se vérifie : c'est celui des phases du scénario
// dont l'heure tombe après la prise de service (`__tests__/tst.test.ts`).

/** Une circulation du graphique : son numéro, son heure, son itinéraire. */
export interface TstLigne {
  /** Numéro de circulation, ou `EVO` pour une évolution sans numéro. */
  num: string;
  heure: string;
  itineraire: string;
}

/** Une ligne du graphique : une minute, et ce qui s'y présente dans chaque sens. */
export interface TstRangee {
  heure: string;
  impair?: TstLigne;
  pair?: TstLigne;
}

export interface TstFiche {
  /** Sens impair — colonne de gauche de la planche. */
  impair: TstLigne[];
  /** Sens pair — colonne de droite. */
  pair: TstLigne[];
  /** Renvoi de bas de planche, quand il y en a un. */
  note?: string;
}

const l = (num: string, heure: string, itineraire: string): TstLigne => ({ num, heure, itineraire });

/**
 * Les deux sens fondus en un seul graphique, sur l'heure qui leur est commune.
 *
 * La planche d'origine tient deux tableaux côte à côte, chacun avec sa colonne
 * d'heures, et les aligne en laissant des cases vides. Une colonne d'heures
 * unique dit la même chose : ce qui se présente à cette minute-là, et dans quel
 * sens.
 *
 * Fusion par parcours simultané plutôt que par regroupement : deux circulations
 * du même sens à la même minute — il n'y en a aucune — prendraient deux lignes
 * au lieu de s'écraser. Les colonnes sont déjà croissantes, un essai s'en assure.
 */
export function rangees(fiche: TstFiche): TstRangee[] {
  const out: TstRangee[] = [];
  let i = 0;
  let j = 0;
  while (i < fiche.impair.length || j < fiche.pair.length) {
    const a = fiche.impair[i];
    const b = fiche.pair[j];
    if (a && b && a.heure === b.heure) {
      out.push({ heure: a.heure, impair: a, pair: b });
      i++;
      j++;
    } else if (a && (!b || a.heure < b.heure)) {
      out.push({ heure: a.heure, impair: a });
      i++;
    } else {
      out.push({ heure: b.heure, pair: b });
      j++;
    }
  }
  return out;
}

const AGN1 = 'AG-N1';
const AGNU = 'AG-NU';
const N2DG = 'N2-DG';
const NUDG1 = 'NU-DG par V1';
const NUDG2 = 'NU-DG par V2';
const EVO_NOTE = 'Évolution du 403603 pour desserte de l’Ep. MOE';

/**
 * Ce que l'itinéraire dit à l'aiguilleur : la voie par laquelle la circulation
 * arrive, et celle vers laquelle elle repart.
 *
 * Les désignations de la planche sont des **points** du poste, pas des voies —
 * `docs/springfield-prs-spec.md` §2.1 : `AG` est l'entrée de la voie 1 côté
 * gauche et `N1` sa sortie côté droit ; `N2` l'entrée de la voie 2 côté droit
 * et `DG` son extrémité gauche ; `NU` la voie centrale, bidirectionnelle ; `AM`
 * la voie mère de l'Ep. MOE. Lues ainsi, les circulations directes se voient
 * d'un coup d'œil — voie 1 vers voie 1 — et les autres disent leur traversée.
 *
 * Les deux NU-DG font exception : elles sortent au même endroit — `z82a` puis
 * `z80`, la voie 2 — et ne diffèrent que par la voie empruntée en traversant le
 * poste. `par V1` passe par `z81b`, qui est de la voie 1 ; `par V2` par `z82b`,
 * qui est de la voie 2. Seule la première a donc besoin d'être précisée, et
 * c'est le choix que la planche dicte à l'aiguilleur.
 */
export const VOIES: Record<string, { de: string; vers: string }> = {
  [AGN1]: { de: 'voie 1', vers: 'voie 1' },
  [AGNU]: { de: 'voie 1', vers: 'voie centrale' },
  'AM-N1': { de: 'voie mère', vers: 'voie 1' },
  'AM-NU': { de: 'voie mère', vers: 'voie centrale' },
  [N2DG]: { de: 'voie 2', vers: 'voie 2' },
  'NU-AM': { de: 'voie centrale', vers: 'voie mère' },
  [NUDG1]: { de: 'voie centrale', vers: 'voie 2 par la voie 1' },
  [NUDG2]: { de: 'voie centrale', vers: 'voie 2' },
};

export const TST: Record<string, TstFiche> = {
  '1': {
    impair: [
      l('135161', '08H14', AGNU),
      l('135519', '08H17', AGN1),
      l('135521', '08H20', AGN1),
      l('135163', '08H23', AGNU),
      l('135523', '08H26', AGN1),
      l('135525', '08H29', AGN1),
      l('135527', '08H32', AGN1),
      l('135529', '08H35', AGN1),
      l('135531', '08H38', AGN1),
    ],
    pair: [
      l('135438', '08H15', N2DG),
      l('135126', '08H16', NUDG2),
      l('135440', '08H18', N2DG),
      l('135442', '08H21', N2DG),
      l('135444', '08H24', N2DG),
      l('135128', '08H27', NUDG2),
      l('135446', '08H30', N2DG),
      l('135448', '08H33', N2DG),
      l('135450', '08H36', N2DG),
      l('135452', '08H39', N2DG),
    ],
  },

  '2': {
    impair: [
      l('135933', '17H17', AGN1),
      l('135221', '17H20', AGNU),
      l('135935', '17H23', AGN1),
      l('135937', '17H26', AGN1),
      l('135939', '17H29', AGN1),
      l('135941', '17H32', AGN1),
      l('135943', '17H35', AGN1),
      l('135945', '17H38', AGN1),
    ],
    pair: [
      l('135864', '17H18', N2DG),
      l('135866', '17H21', N2DG),
      l('135322', '17H23', NUDG2),
      l('135868', '17H27', N2DG),
      l('135870', '17H30', N2DG),
      l('135872', '17H33', N2DG),
      l('135874', '17H36', N2DG),
      l('135876', '17H39', N2DG),
    ],
  },

  '3': {
    impair: [
      l('135013', '10H20', AGNU),
      l('135359', '10H23', AGN1),
      l('403195', '10H25', 'AM-N1'),
      l('135361', '10H27', AGN1),
      l('135363', '10H30', AGN1),
      l('135365', '10H33', AGN1),
      l('135367', '10H36', AGN1),
      l('135369', '10H39', AGN1),
      l('135371', '10H42', AGN1),
    ],
    pair: [
      l('135874', '10H20', N2DG),
      l('135008', '10H23', NUDG2),
      l('135876', '10H25', N2DG),
      l('135878', '10H28', N2DG),
      l('135880', '10H31', N2DG),
      l('135882', '10H34', N2DG),
      l('135884', '10H37', N2DG),
      l('135886', '10H40', N2DG),
    ],
  },

  '4': {
    impair: [
      l('403181', '13H42', 'AM-NU'),
      l('135621', '13H45', AGN1),
      l('135623', '13H48', AGN1),
      l('135625', '13H52', AGN1),
      l('135627', '13H56', AGN1),
      l('135629', '14H00', AGN1),
      l('135631', '14H04', AGN1),
    ],
    pair: [
      l('135530', '13H43', N2DG),
      l('403200', '13H45', NUDG2),
      l('135532', '13H47', N2DG),
      l('135534', '13H50', N2DG),
      l('135536', '13H54', N2DG),
      l('135538', '13H58', N2DG),
      l('135540', '14H02', N2DG),
      l('135542', '14H06', N2DG),
    ],
  },

  '5': {
    impair: [
      l('135579', '12H05', AGN1),
      l('403529', '12H08', 'AM-NU'),
      l('135193', '12H12', AGNU),
      l('135581', '12H15', AGN1),
      l('135583', '12H18', AGN1),
      l('135585', '12H21', AGN1),
      l('135587', '12H24', AGN1),
      l('135589', '12H27', AGN1),
    ],
    pair: [
      l('135200', '12H05', NUDG2),
      l('135474', '12H07', N2DG),
      l('403542', '12H10', NUDG2),
      l('135476', '12H14', N2DG),
      l('135202', '12H17', NUDG2),
      l('135478', '12H20', N2DG),
      l('135480', '12H23', N2DG),
      l('135482', '12H26', N2DG),
    ],
  },

  '6': {
    impair: [
      l('135291', '20H42', AGNU),
      l('135867', '20H45', AGN1),
      l('135869', '20H48', AGN1),
      l('135871', '20H51', AGN1),
      l('135873', '20H54', AGN1),
      l('135875', '20H57', AGN1),
      l('135877', '21H00', AGN1),
      l('135879', '21H03', AGN1),
    ],
    pair: [
      l('135384', '20H40', NUDG1),
      l('135812', '20H43', N2DG),
      l('135386', '20H46', NUDG2),
      l('135814', '20H49', N2DG),
      l('135816', '20H52', N2DG),
      l('135818', '20H55', N2DG),
      l('135820', '20H58', N2DG),
      l('135822', '21H01', N2DG),
      l('135824', '21H04', N2DG),
    ],
  },

  '7': {
    impair: [
      l('135319', '00H12', AGNU),
      l('135929', '00H15', AGN1),
      l('135931', '00H18', AGN1),
      l('135933', '00H21', AGN1),
      l('135935', '00H24', AGN1),
      l('135937', '00H27', AGN1),
      l('135939', '00H30', AGN1),
      l('135941', '00H33', AGN1),
    ],
    pair: [
      l('508002', '00H10', NUDG2),
      l('135924', '00H13', N2DG),
      l('135428', '00H16', NUDG2),
      l('135926', '00H19', N2DG),
      l('135928', '00H22', N2DG),
      l('135930', '00H25', N2DG),
      l('135932', '00H28', N2DG),
      l('135934', '00H31', N2DG),
      l('135936', '00H34', N2DG),
    ],
  },

  '8': {
    impair: [
      l('135543', '11H36', AGN1),
      l('135545', '11H40', AGN1),
      l('135547', '11H44', AGN1),
      l('135549', '11H48', AGN1),
      l('135551', '11H52', AGN1),
      l('135553', '11H56', AGN1),
      l('135555', '12H00', AGN1),
    ],
    pair: [
      l('135138', '11H35', NUDG2),
      l('135406', '11H38', N2DG),
      l('135408', '11H42', N2DG),
      l('135410', '11H46', N2DG),
      l('135412', '11H50', N2DG),
      l('135414', '11H54', N2DG),
      l('135416', '11H58', N2DG),
    ],
  },

  '9': {
    impair: [
      l('135503', '05H30', AGN1),
      l('403023', '05H32', 'AM-NU'),
      l('135505', '05H35', AGN1),
      l('135507', '05H39', AGN1),
      l('135509', '05H43', AGN1),
      l('135511', '05H47', AGN1),
      l('135513', '05H51', AGN1),
      l('135515', '05H55', AGN1),
    ],
    pair: [
      l('135514', '05H31', N2DG),
      l('135516', '05H34', N2DG),
      l('403032', '05H37', NUDG2),
      l('135518', '05H41', N2DG),
      l('135520', '05H45', N2DG),
      l('135522', '05H49', N2DG),
      l('135524', '05H53', N2DG),
      l('135526', '05H57', N2DG),
    ],
  },

  '10': {
    impair: [
      l('403529', '09H29', 'AM-N1'),
      l('135579', '09H32', AGN1),
      l('135581', '09H34', AGN1),
      l('135583', '09H36', AGN1),
    ],
    pair: [
      l('135200', '09H30', NUDG2),
      l('135472', '09H33', N2DG),
      l('135474', '09H36', N2DG),
      l('135476', '09H39', N2DG),
      l('135478', '09H42', N2DG),
      l('135480', '09H45', N2DG),
    ],
  },

  '11': {
    impair: [
      l('403603', '19H14', AGNU),
      l('135719', '19H20', AGN1),
      l('135721', '19H23', AGN1),
      l('135723', '19H26', AGN1),
      l('135725', '19H29', AGN1),
    ],
    pair: [
      l('135638', '19H15', N2DG),
      l('EVO *', '19H16', 'NU-AM'),
      l('135640', '19H18', N2DG),
      l('135642', '19H21', N2DG),
      l('135644', '19H24', N2DG),
      l('135646', '19H27', N2DG),
      l('135648', '19H30', N2DG),
    ],
    note: EVO_NOTE,
  },

  '12': {
    impair: [
      l('135919', '01H35', AGN1),
      l('747327', '03H26', AGN1),
      l('135523', '03H29', AGN1),
      l('135525', '03H33', AGN1),
    ],
    pair: [
      l('135838', '01H34', N2DG),
      l('135426', '01H36', NUDG2),
      // La planche porte 135640 : un 6 pour un 8. Les gardes de l'original —
      // `dtrainv2==135838` puis `==135840` — ne laissent aucun doute.
      l('135840', '01H38', N2DG),
      l('135344', '03H27', N2DG),
      l('135346', '03H31', N2DG),
      l('135348', '03H35', N2DG),
    ],
  },

  '91': {
    impair: [
      l('135013', '21H20', AGNU),
      l('135359', '21H23', AGN1),
      l('403195', '21H25', 'AM-N1'),
      l('135015', '21H27', AGNU),
      l('135361', '21H30', AGN1),
      l('135363', '21H34', AGN1),
      l('135365', '21H36', AGN1),
      l('135367', '21H39', AGN1),
      l('135369', '21H42', AGN1),
    ],
    pair: [
      l('135874', '21H20', N2DG),
      l('135008', '21H23', NUDG2),
      l('135876', '21H25', N2DG),
      l('135878', '21H28', N2DG),
      l('135010', '21H31', NUDG1),
      l('135880', '21H34', N2DG),
      l('135882', '21H37', N2DG),
      l('135884', '21H40', N2DG),
    ],
  },

  '92': {
    impair: [
      l('403603', '19H14', AGNU),
      l('135719', '19H19', AGN1),
      l('135033', '19H21', AGNU),
      l('558803', '19H26', AGN1),
      l('135721', '19H30', AGN1),
      l('135723', '19H32', AGN1),
    ],
    pair: [
      l('135638', '19H15', N2DG),
      l('EVO *', '19H16', 'NU-AM'),
      l('135640', '19H18', N2DG),
      l('135642', '19H20', N2DG),
      l('135644', '19H24', N2DG),
      l('135326', '19H27', NUDG1),
      l('135646', '19H30', N2DG),
      l('135648', '19H33', N2DG),
    ],
    note: EVO_NOTE,
  },

  '93': {
    impair: [
      l('135579', '12H05', AGN1),
      l('403529', '12H09', 'AM-NU'),
      l('135193', '12H12', AGNU),
      l('135581', '12H15', AGN1),
      l('135583', '12H18', AGN1),
      l('135585', '12H21', AGN1),
      l('135587', '12H24', AGN1),
      l('135589', '12H27', AGN1),
    ],
    pair: [
      l('135200', '12H05', NUDG2),
      l('135474', '12H08', N2DG),
      l('403542', '12H10', NUDG2),
      l('135476', '12H14', N2DG),
      l('135202', '12H17', NUDG2),
      l('135478', '12H20', N2DG),
      l('135480', '12H23', N2DG),
      l('135482', '12H26', N2DG),
    ],
    note:
      'Le 747204, mis en marche depuis la voie 2 à 12h05, ne figure pas au graphique : sa marche est l’objet du scénario, et elle est annoncée à la prise de service.',
  },

  '94': {
    impair: [
      l('135933', '17H17', AGN1),
      l('135221', '17H20', AGNU),
      l('135935', '17H23', AGN1),
      l('135937', '17H26', AGN1),
      l('135939', '17H29', AGN1),
      l('135941', '17H32', AGN1),
      l('135943', '17H35', AGN1),
      l('135945', '17H38', AGN1),
    ],
    pair: [
      l('135864', '17H17', N2DG),
      l('135866', '17H21', N2DG),
      l('135322', '17H23', NUDG2),
      l('135868', '17H27', N2DG),
      l('135870', '17H30', N2DG),
      l('135872', '17H33', N2DG),
      l('135874', '17H36', N2DG),
      l('135876', '17H39', N2DG),
    ],
    note:
      'Le 797302, reçu en 135933 puis remis en marche vers Capital City, ne figure pas au graphique : il naît de l’alerte radio, que rien ne laissait prévoir.',
  },
};
