// Builder Player de Gessie : transforme un objet Station JSON brut en PlayerData
// (l'état dynamique initial de la simulation).
//
// Reverse-engineered depuis le bundle Vue de l'app originale
// (renderer.js, autour des offsets 128000-143000). On suit fidèlement la
// logique du builder original, en respectant les conventions d'IDs sémantiques
// (cf. types.ts en tête) et les particularités du parsing JSON (champs vides
// possibles, etc.). Les divergences volontaires sont commentées.

import type { Station, StationItem } from '../types/gessie';
import type {
  Affectation,
  Bloc,
  CentralLock,
  Incompatibility,
  KeyGroup,
  KeyHole,
  Lever,
  PlayerData,
  TransitAnnulator,
} from './types';

// ===== Helpers de parsing =====

/** Filtre des chaînes : conserve les éléments de `arr` aussi présents dans `keys`. */
function intersect(keys: string[], arr: string[]): string[] {
  return arr.filter((x) => keys.indexOf(x) !== -1);
}

/**
 * Parser des incompatibilités d'enclenchement (champs `plusIncompatibilities`,
 * `minusIncompatibilities`, `movingIncompatibilities`).
 *
 * Format Gessie :
 *   "1+, 2-, (3+ ou 4-), 5+"   →
 *     { plus:["1","5"], minus:["2"], groups:[ {plus:["3"], minus:["4"]} ] }
 *
 * Les groupes parenthésés sont des OR (au moins une clause doit céder pour
 * autoriser le mouvement). Les groupes peuvent eux-mêmes contenir des groupes
 * (récursif).
 */
function parseIncompatibilities(raw: unknown): Incompatibility {
  const empty: Incompatibility = { plus: [], minus: [], groups: [] };
  if (typeof raw !== 'string' || raw.trim() === '') return empty;

  // Extraire récursivement les groupes parenthésés.
  const groups: { plus: string[]; minus: string[] }[] = [];
  const stripped = raw.replace(/[ ,]*\((.*?)\)/g, (_match, inner: string) => {
    const sub = parseIncompatibilities(inner);
    groups.push({ plus: sub.plus, minus: sub.minus });
    // Note : on perd les groupes imbriqués profonds (Gessie ne les gère pas).
    return '';
  });

  const parts = stripped
    .trim()
    .split(/\s*,\s*/)
    .filter((s) => s !== '');
  const plus: string[] = [];
  const minus: string[] = [];
  for (const term of parts) {
    const last = term.slice(-1);
    const head = term.slice(0, -1);
    if (last === '+') plus.push(head);
    else if (last === '-') minus.push(head);
    // Pas de signe → on ignore (cohérent avec le builder original).
  }

  return { plus, minus, groups };
}

/**
 * Parser de `neededKeysList` (annexeIbis : verrous centraux). Format :
 *   "VA1, S, (VA2 ou VA3)"  →  ["VA1","S",["VA2","VA3"]]
 * (concat de chaînes simples et de tableaux pour les groupes "ou").
 */
function parseNeededKeysList(raw: unknown): (string | string[])[] {
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  const groups: string[][] = [];
  const stripped = raw.replace(/[ ,]*\((.*?)\)/g, (_m, inner: string) => {
    groups.push(inner.split(/\s*ou\s*/));
    return '';
  });
  const singles = stripped.split(/\s*,\s*/).filter((s) => s !== '');
  return [...singles, ...groups];
}

/**
 * Convertit un champ "liste" Gessie qui peut être : un tableau, une chaîne
 * CSV, undefined ou false. Retourne toujours un tableau de chaînes propres.
 */
function asArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return value
      .trim()
      .split(/\s*,\s*/)
      .filter((s) => s !== '');
  }
  return [];
}

/**
 * Parser d'un item de cles (annexeI / annexeILabels). Format :
 *   "N VA1"      → keyhole pour la clé "VA1" en position N (plus), absente
 *   "R a1n#"     → keyhole pour "a1n", position R (minus), présence "a1n"
 *   "R x|y#z"    → présence = "y" (avant `#`, après `|` si présent), keyId = "x|y"
 */
function parseKeyholeSpec(spec: string): KeyHole {
  const m = spec.split(/ (.+)/);
  let posLetter = m[0];
  const rest = m[1] ?? '';
  let position: 'plus' | 'minus' = 'plus';
  if (posLetter === 'R') position = 'minus';
  else if (posLetter === 'N') position = 'plus';

  const hasHash = rest.indexOf('#') !== -1;
  if (hasHash) {
    // Le `#` indique une présence ; la chaîne avant le `#` (et après le
    // dernier `|` si présent) est l'ID de la clé présente.
    const presenceId = rest.replace(/(?:.*\|)?([^|]*)#.*/, '$1');
    return {
      keyId: rest.replace('#', ''),
      presence: presenceId,
      position,
    };
  }
  return { keyId: rest, presence: false, position };
}

// ===== Sous-builders =====

/**
 * Phase 1 — "démarrage" : crée une affectation par item TCO.
 * - aiguille → "Ag" + name, position "G"
 * - tjs/tjd → 2 aiguilles : "Ag" + nameUp / "Ag" + nameDown
 * - controle → name, position "F"
 * - signal → name, position "I"
 * - taquet → name, position "B"
 * - zone → name, type "zone" avec transit
 *
 * Note : le builder original n'écrit pas `name`/`type` pour les signaux et
 * taquets ; on les ajoute ici (divergence consciente, indispensable pour la
 * sim côté web).
 */
function buildItemsAffectations(items: StationItem[]): Record<string, Affectation> {
  const a: Record<string, Affectation> = {};

  for (const item of items) {
    const toolId = item.toolId;
    const name = (item.name ?? '') as string;

    if (toolId === 'aiguille') {
      a['Ag' + name] = {
        name: 'Ag' + name,
        type: 'aiguille',
        position: 'G',
        pedales: {},
        observers: [],
        nextEncounter: {},
        disturbances: [],
      };
    } else if (toolId === 'tjs' || toolId === 'tjd') {
      const nameUp = String(item.nameUp ?? '');
      const nameDown = String(item.nameDown ?? '');
      a['Ag' + nameUp] = {
        name: 'Ag' + nameUp,
        type: 'aiguille',
        position: 'G',
        pedales: {},
        observers: [],
        nextEncounter: {},
        disturbances: [],
      };
      a['Ag' + nameDown] = {
        name: 'Ag' + nameDown,
        type: 'aiguille',
        position: 'G',
        pedales: {},
        observers: [],
        nextEncounter: {},
        disturbances: [],
      };
    } else if (toolId === 'controle') {
      a[name] = {
        name,
        type: 'controle',
        position: 'F',
        circulation: false,
        pedales: { proximite: { pressed: false } },
        observers: [],
        nextEncounter: {},
        disturbances: [],
      };
      // Cas particuliers historiques (cf. builder original).
      if (name === 'S1') a[name].observers!.push('A1');
      else if (name === 'S2') a[name].observers!.push('A2');
    } else if (toolId === 'signal') {
      a[name] = {
        name,
        type: 'signal',
        position: 'I',
        pedales: { proximite: { pressed: false } },
        observers: [],
        nextEncounter: {},
        disturbances: [],
      };
    } else if (toolId === 'taquet') {
      a[name] = {
        name,
        type: 'taquet',
        position: 'B',
        observers: [],
        disturbances: [],
      };
    } else if (toolId === 'zone') {
      a[name] = {
        name,
        type: 'zone',
        circulation: false,
        transit: {
          pair: { lockedByLever: false, haveTransit: false, prevZone: false },
          impair: { lockedByLever: false, haveTransit: false, prevZone: false },
        },
        observers: [],
        nextEncounter: {},
        disturbances: [],
      };
    }
  }

  return a;
}

/**
 * Phase 2 — "EM" : construit la table des leviers (`y`) à partir de
 * `station.enclenchements`, et applique leurs effets initiaux sur les
 * affectations (positions cibles, contrôles).
 */
function buildLevers(
  station: Station,
  affectations: Record<string, Affectation>,
): Record<string, Lever> {
  const levers: Record<string, Lever> = {};
  let left = 0;
  let top = 628;

  const enclen = (station.enclenchements ?? []) as Record<string, unknown>[];

  for (const S of enclen) {
    const id = String((S.id ?? '') as string);
    if (levers[id] !== undefined) {
      // Pour fidélité : le builder original ne fusionne pas, il ignore.
      // (en pratique tout id est unique dans le JSON Gessie)
    } else {
      // Layout des miscs : 2 lignes de 19 leviers, puis nouvelle rangée.
      if (left > 1900) {
        left = 0;
        top += 80;
      }
      const type =
        left === 500 ? 'misc' : left === 600 ? 'button' : 'standard';
      const lever: Lever = {
        // Copie superficielle du JSON de l'enclenchement (préserve uid,
        // controle_*, observations, etc.) puis surcharge.
        ...(S as object),
        id,
        affectations: [],
        correspondances: [],
        zapLock: [],
        type,
        emplacement: { left, top },
        position: 'plus',
        incompatibilities: {
          plus: parseIncompatibilities(S.plusIncompatibilities),
          minus: parseIncompatibilities(S.minusIncompatibilities),
          moving: parseIncompatibilities(S.movingIncompatibilities),
        },
        dispositifs: [],
      } as Lever;
      lever.label = String(left);
      // illustrations PNG omises (uniquement esthétique TCO).
      left += 100;
      levers[id] = lever;
    }
    const lever = levers[id];

    // Mapping plus/minus → position cible de l'affectation.
    const corr: { plus: string; minus: string } = {
      plus: String(S.correspondancePlus ?? ''),
      minus: String(S.correspondanceMinus ?? ''),
    };

    // Application initiale sur l'affectation.
    const affName = String((S.affectation ?? '') as string);
    if (affName !== '') {
      if (affName.indexOf('Ag') !== 0) {
        // Cas non-aiguille : signal, contrôle ou autre item nommé.
        // Reproduction de la condition Gessie d'origine
        // (0===L.indexOf("C") || L.indexOf("S") || L.indexOf("D")).
        const condC = affName.indexOf('C') === 0;
        const condS = affName.indexOf('S') !== 0; // truthy si S n'est pas en tête (accident historique)
        const condD = affName.indexOf('D') !== 0;
        const isSignalOrControl = condC || condS || condD;
        const aff = affectations[affName];
        if (aff) {
          if (isSignalOrControl) {
            aff.position = corr[lever.position];
            aff.requestedPosition = corr[lever.position];
            aff.controle = {
              ouverture: !!(aff.controle?.ouverture || S.controle_ouverture),
              double_zap_eap_epa: !!(
                aff.controle?.double_zap_eap_epa || S.controle_double_zap_eap_epa
              ),
            };
          } else {
            aff.position = corr[lever.position];
          }
        }
      } else if (affName.indexOf('_') !== -1) {
        // Aiguille jumelée "AgX_Y" : applique sur Ag X et Ag Y.
        const stripped = affName.slice(2);
        const [up, down] = stripped.split('_');
        if (affectations['Ag' + up]) {
          affectations['Ag' + up].position = corr[lever.position];
          affectations['Ag' + up].controle = {
            gauche: true,
            droite: true,
            entrebaillement: false,
          };
        }
        if (affectations['Ag' + down]) {
          affectations['Ag' + down].position = corr[lever.position];
          affectations['Ag' + down].controle = {
            gauche: true,
            droite: true,
            entrebaillement: false,
          };
        }
      } else {
        // Aiguille simple "AgX".
        const aff = affectations[affName];
        if (aff) {
          aff.position = corr[lever.position];
          aff.controle = {
            gauche: !!(aff.controle?.gauche || S.controle_gauche),
            droite: !!(aff.controle?.droite || S.controle_droite),
            entrebaillement: !!(
              aff.controle?.entrebaillement || S.controle_entrebaillement
            ),
          };
        }
      }
    }

    // Enregistrement des affectations contrôlées par ce levier.
    if (affName.indexOf('Ag') === 0 && affName.indexOf('_') !== -1) {
      const stripped = affName.slice(2);
      const [up, down] = stripped.split('_');
      lever.affectations.push('Ag' + up);
      lever.correspondances.push(corr);
      lever.affectations.push('Ag' + down);
      lever.correspondances.push(corr);
    } else {
      lever.affectations.push(affName);
      lever.correspondances.push(corr);
    }
  }

  return levers;
}

/**
 * Phase 3 — "Annexe 1" : keyholes attachés aux leviers.
 * Format de `cles` : CSV de specs (cf. parseKeyholeSpec).
 */
function applyAnnexeI(station: Station, levers: Record<string, Lever>): void {
  const list = (station.annexeI ?? []) as { id: string; cles: string }[];
  for (const entry of list) {
    const lever = levers[entry.id];
    if (!lever) continue;
    const keyholes: Record<string, KeyHole> = {};
    if (typeof entry.cles === 'string') {
      for (const spec of entry.cles.split(/\s*,\s*/).filter((s) => s !== '')) {
        const kh = parseKeyholeSpec(spec);
        keyholes[kh.keyId] = kh;
      }
    }
    lever.keyholes = keyholes;
  }
}

/**
 * Phase 3bis — "Annexe 1 labels" : groupes de boîtes à clés et locks
 * cadenassés.
 * - Si label === "clés cadenassées" (ou uid === "cadenas") : ces clés sont
 *   marquées en `locks`.
 * - Sinon : créer un KeyGroup dans `groups`.
 */
function applyAnnexeILabels(
  station: Station,
): { groups: Record<string, KeyGroup>; locks: Record<string, KeyHole> } {
  const groups: Record<string, KeyGroup> = {};
  const locks: Record<string, KeyHole> = {};

  const list = (station.annexeILabels ?? []) as {
    uid: string;
    label?: string;
    cles?: string;
  }[];

  for (const entry of list) {
    const cles = (entry.cles ?? '').split(/\s*,\s*/).filter((s) => s !== '');
    if (entry.uid === 'cadenas' || entry.label === 'clés cadenassées') {
      for (const k of cles) {
        locks[k] = {
          keyId: k,
          presence: k,
          position: 'minus',
        };
      }
      continue;
    }
    const keyholes: Record<string, KeyHole> = {};
    for (const spec of (entry.cles ?? '').trim().split(/\s*,\s*/).filter((s) => s !== '')) {
      const kh = parseKeyholeSpec(spec);
      keyholes[kh.keyId] = kh;
    }
    groups[entry.uid] = { id: entry.uid, label: entry.label, keyholes };
  }
  return { groups, locks };
}

/**
 * Phase 3ter — "Annexe Ibis" : verrous centraux.
 */
function applyAnnexeIbis(station: Station): Record<string, CentralLock> {
  const out: Record<string, CentralLock> = {};
  const list = (station.annexeIbis ?? []) as {
    uid: string;
    keyId: string;
    presence?: unknown;
    position?: string;
    neededKeysList?: string;
  }[];
  for (const entry of list) {
    const incompatibilities = parseNeededKeysList(entry.neededKeysList);
    out[entry.uid] = {
      uid: entry.uid,
      keyId: entry.keyId,
      presence: entry.presence ? entry.keyId : false,
      position: entry.position ?? 'left',
      // Liste parsée d'incompatibilités utilisée par takeCentralKey.
      incompatibilities,
      neededKeysList: JSON.stringify(incompatibilities),
    };
  }
  return out;
}

/**
 * Phase 4 — "Annexe 2" : déclaration des directions sur les signaux et leur
 * levier. Pour chaque entrée :
 *  - On ajoute une direction au levier (controleFugitif*).
 *  - On ajoute une direction au signal (controlePermanent* + sensContraire*).
 *  - On enregistre le signal comme observer des items concernés.
 *  - Création d'annulateur électrique si controles fugitifs présents.
 *  - Setup des pédales spéciales (Proxi, FA).
 */
function applyAnnexeII(
  station: Station,
  affectations: Record<string, Affectation>,
  levers: Record<string, Lever>,
): void {
  const affKeys = Object.keys(affectations);
  const list = (station.annexeII ?? []) as Record<string, unknown>[];

  for (const dir of list) {
    const leverId = String(dir.leverId ?? '');
    const signalId = String(dir.signalId ?? '');
    const lever = levers[leverId];
    if (!lever) continue;

    if (!lever.directions) lever.directions = [];
    const leverList = String(dir.levierMoins ?? '')
      .trim()
      .split(/\s*,\s*/)
      .filter((s) => s !== '');

    // Direction côté levier (contrôle fugitif).
    lever.directions.push({
      uid: dir.uid,
      leverList,
      aiguille: {
        gauche: intersect(
          affKeys,
          asArray(dir.controleFugitifAiguilleGauche).map((s) => 'Ag' + s),
        ),
        droite: intersect(
          affKeys,
          asArray(dir.controleFugitifAiguilleDroite).map((s) => 'Ag' + s),
        ),
      },
      taquetBas: intersect(affKeys, asArray(dir.controleFugitifTaquetBas)),
      signalFerme: intersect(affKeys, asArray(dir.controleFugitifSignalFerme)),
      zonesDeProtections: intersect(
        affKeys,
        asArray(dir.controleFugitifZoneProtection),
      ),
      pdProximite: !!dir.controleFugitifZoneProximite,
    } as unknown as Lever['directions'] extends (infer T)[] ? T : never);
    lever.directions.sort(
      (a: { leverList: string[] }, b: { leverList: string[] }) =>
        b.leverList.length - a.leverList.length,
    );

    // Création de l'annulateur électrique si au moins un contrôle fugitif.
    const fugitifCount =
      asArray(dir.controleFugitifAiguilleGauche).length +
      asArray(dir.controleFugitifAiguilleDroite).length +
      asArray(dir.controleFugitifTaquetBas).length +
      asArray(dir.controleFugitifSignalFerme).length +
      asArray(dir.controleFugitifZoneProtection).length;
    if (fugitifCount > 0 && !(lever as Record<string, unknown>).annulateurElec) {
      (lever as Record<string, unknown>).annulateurElec = { enabled: false };
    }

    const signal = affectations[signalId];
    if (!signal) continue;
    if (!signal.directions) signal.directions = [];
    if (signal.positionFC === undefined && dir.commutFC) {
      // Gessie : `ye.positionFC = !1` — état repos du commutateur FC.
      // Ce n'est PAS un verrouillage actif ; tant que `positionFC` est
      // falsy (false), le signal peut s'ouvrir normalement. Le verrou
      // s'active quand le commutateur est tiré (positionFC devient 'F').
      signal.positionFC = false;
    }
    // Pédale Proxi pour zone proximité.
    if (dir.controleFugitifZoneProximite) {
      signal.pedales = signal.pedales ?? {};
      if (!signal.pedales.Proxi) {
        signal.pedales.Proxi = { nextEncounter: {}, pressed: false };
      }
    }

    const cpAgGauche = intersect(
      affKeys,
      asArray(dir.controlePermanentAiguilleGauche).map((s) => 'Ag' + s),
    );
    const cpAgDroite = intersect(
      affKeys,
      asArray(dir.controlePermanentAiguilleDroite).map((s) => 'Ag' + s),
    );
    const cpTaquet = intersect(affKeys, asArray(dir.controlePermanentTaquetBas));
    const cpZoneEsp = intersect(
      affKeys,
      asArray(dir.controlePermanentZoneEspacementAuto),
    );
    const cpZoneProtNonAnn = intersect(
      affKeys,
      asArray(dir.controlePermanentZoneProtectionNonAnn),
    );
    const cpZoneProt = intersect(
      affKeys,
      asArray(dir.controlePermanentZoneProtection),
    );
    const cpCvInter = intersect(
      affKeys,
      asArray(dir.controlePermanentCvIntermediaire),
    );

    const sensContraireTransitNonAnn = asArray(
      dir.sensContraireBanaliseTransitLibere,
    ).concat(asArray(dir.sensContraireVoieUniqueTransitLibere));
    const sensContraireZoneNonAnn = asArray(
      dir.sensContraireBanaliseZoneLibere,
    ).concat(asArray(dir.sensContraireVoieUniqueTransitLibere));
    const sensContraireTransitAnn = asArray(
      dir.sensContraireVoieStationnementTransitLibere,
    );
    const sensContraireZoneAnn = asArray(
      dir.sensContraireVoieStationnementZoneLibere,
    );
    const sensContraireAnnulCondition = asArray(
      // Le bundle utilise `sensContraireVoieStationnementAnnuleOccupationZone`,
      // mais l'orthographe varie selon les versions JSON (Anulle / Annule).
      (dir.sensContraireVoieStationnementAnnuleOccupationZone ??
        dir.sensContraireVoieStationnementAnulleOccupationZone) as unknown,
    );

    // FA (annulateur de fermeture/avertissement).
    let fa: false | { zone?: string; pedale?: boolean; annulable?: boolean } = false;
    if (dir.faZone || dir.faPedale) {
      signal.fa = true;
      fa = {};
      if (dir.faZone) {
        fa.zone = String(dir.faZone);
        const zoneAff = affectations[fa.zone];
        if (zoneAff) {
          if (!zoneAff.faTrigger) zoneAff.faTrigger = [];
          if (zoneAff.faTrigger.indexOf(signalId) === -1) {
            zoneAff.faTrigger.push(signalId);
          }
        }
      }
      if (dir.faPedale) {
        fa.pedale = true;
        signal.pedales = signal.pedales ?? {};
        if (!signal.pedales.FA) {
          signal.pedales.FA = { nextEncounter: {}, pressed: false };
        }
      }
      if (dir.faIsAnnulable) {
        fa.annulable = true;
        if (!signal.annulateurFA) {
          signal.annulateurFA = { pressed: false };
        }
      }
    }

    // Concat sensContraire pour observer (chaînes "z X" issues du parser).
    const sensContraireZones = sensContraireTransitNonAnn
      .concat(sensContraireTransitAnn)
      .map((s) => 'z ' + s.trim().split(' ')[0]);

    signal.directions.push({
      leverList,
      aiguille: { gauche: cpAgGauche, droite: cpAgDroite },
      taquetBas: cpTaquet,
      zonesEspacementAuto: cpZoneEsp,
      zonesDeProtections: cpZoneProt,
      zonesProtectionNonAnn: cpZoneProtNonAnn,
      signauxIntermediaires: cpCvInter,
      fa: fa || undefined,
      pdProximite: !!dir.controleFugitifZoneProximite,
      sensContraireTransitNonAnnulable: sensContraireTransitNonAnn,
      sensContraireZoneNonAnnulable: sensContraireZoneNonAnn,
      sensContraireTransitAnnulable: sensContraireTransitAnn,
      sensContraireZoneAnnulable: sensContraireZoneAnn,
      sensContraireAnnulationCondition: sensContraireAnnulCondition,
    });
    signal.directions.sort(
      (a, b) => (b.leverList?.length ?? 0) - (a.leverList?.length ?? 0),
    );

    // Annulateur de substitution.
    if (!signal.annulSubstitution && dir.controlePermanentAnnulationSubstitution) {
      signal.annulSubstitution = { pressed: false };
      (signal as Record<string, unknown>).annulSubstitutionZone =
        dir.controlePermanentAnnulZoneOccupee;
    }

    // Le signal devient observer de tous les items contrôlés par cette direction.
    const allObserved = [
      ...cpAgGauche,
      ...cpAgDroite,
      ...cpTaquet,
      ...cpZoneEsp,
      ...cpZoneProt,
      ...cpZoneProtNonAnn,
      ...cpCvInter,
      ...sensContraireZones,
      ...sensContraireZoneNonAnn,
      ...sensContraireZoneAnn,
      ...sensContraireAnnulCondition,
    ];
    for (const obs of allObserved) {
      const aff = affectations[obs];
      if (aff) {
        aff.observers = aff.observers ?? [];
        aff.observers.push(signalId);
      }
    }
  }
}

/**
 * Phase 5 — "Annexe 4" : zones isolées et zones de transit (par levier
 * d'aiguille). Plus le parsing des sensPair/sensImpair pour itinéraires de
 * transit.
 */
function applyAnnexeIV(
  station: Station,
  affectations: Record<string, Affectation>,
  levers: Record<string, Lever>,
): void {
  const aIV = (station.annexeII ?? []) as { uid: string; leverId: string }[];

  // Zones isolées sur leviers d'aiguille.
  const annexeIV = (station.annexeIV ?? {}) as {
    agLevers?: { id: string; plus?: string[]; minus?: string[] }[];
    sensPairLines?: unknown[];
    sensImpairLines?: unknown[];
  };

  for (const ag of annexeIV.agLevers ?? []) {
    const lever = levers[ag.id];
    if (!lever) continue;
    if (ag.plus) {
      lever.zonesIsolees = { plus: asArray(ag.plus), minus: [] };
      if (!(lever as Record<string, unknown>).annulateurElec) {
        (lever as Record<string, unknown>).annulateurElec = { enabled: false };
      }
    }
    lever.zonesTransit = { minus: [], plus: [] };
  }

  // Helper pour appliquer un sensLine (pair ou impair).
  type SensLine = {
    id: { uid: string };
    itineraire: string;
    enclenchementContinuite?: string;
    levers?: { id: string; minus?: string[]; plus?: string[] }[];
  };
  const applySensLine = (sl: SensLine, direction: 'pair' | 'impair'): void => {
    const annexe2Match = aIV.find((e) => e.uid === sl.id.uid);
    if (!annexe2Match) return;
    const lever = levers[annexe2Match.leverId];
    if (!lever) return;
    const sigDir = (lever.directions ?? []).find(
      (d) => (d as { uid?: string }).uid === sl.id.uid,
    );
    if (!sigDir) return;

    if (!sigDir.itineraireTransit) sigDir.itineraireTransit = {};
    sigDir.itineraireTransit[direction] = (sl.itineraire ?? '')
      .trim()
      .split(/\s*,\s*/)
      .filter((s) => s !== '')
      .map((e) => (e[0] === 'z' ? e : 'z ' + e));

    if (
      (sigDir.itineraireTransit[direction] ?? []).length > 0 &&
      sl.enclenchementContinuite
    ) {
      const targetAff = affectations[sl.enclenchementContinuite];
      if (targetAff) {
        if (!targetAff.continuite) targetAff.continuite = {};
        const ittPair = sigDir.itineraireTransit[direction] ?? [];
        targetAff.continuite[direction] = ittPair[ittPair.length - 1];
      }
      // Annulateur élec sur tous les leviers ayant cette affectation.
      const matchingLevers = Object.values(levers).filter((l) => {
        const aff = (l as unknown as { affectation?: string }).affectation;
        return aff === sl.enclenchementContinuite;
      });
      for (const ml of matchingLevers) {
        (ml as Record<string, unknown>).annulateurElec = { enabled: false };
      }
    }

    for (const lv of sl.levers ?? []) {
      const target = levers[lv.id];
      if (!target) continue;
      if (!lv.minus && !lv.plus) continue;
      if (!target.zonesTransit) target.zonesTransit = { minus: [], plus: [] };
      if (lv.minus) {
        const cleanList = lv.minus.map((t) => t.trim());
        target.zonesTransit.minus = target.zonesTransit.minus.concat(cleanList);
      }
      if (lv.plus) {
        const cleanList = lv.plus.map((t) => t.trim());
        target.zonesTransit.plus = target.zonesTransit.plus.concat(cleanList);
      }
    }
  };

  for (const sl of (annexeIV.sensPairLines ?? []) as SensLine[]) {
    applySensLine(sl, 'pair');
  }
  for (const sl of (annexeIV.sensImpairLines ?? []) as SensLine[]) {
    applySensLine(sl, 'impair');
  }
}

/**
 * Phase 6 — "Annexe 5" : enclenchements d'approche (EAP) et de parcours (EPA).
 */
function applyAnnexeV(
  station: Station,
  affectations: Record<string, Affectation>,
  levers: Record<string, Lever>,
): void {
  const annexeV = (station.annexeV ?? {}) as {
    enclenchementsApproche?: Record<string, unknown>[];
    enclenchementsParcours?: Record<string, unknown>[];
  };

  // EAP : enclenchements d'approche.
  for (const ent of annexeV.enclenchementsApproche ?? []) {
    const signalId = String(ent.signal ?? '');
    const signal = affectations[signalId];
    if (!signal) continue;
    // Gessie data : consistance_zone est soit un tableau, soit une chaîne
    // vide "" (pas de consistance), soit `undefined`. Reproduit le test
    // truthy de Gessie (`At ? At.filter(e => e) : []`, renderer.js @142854) :
    // chaîne vide → falsy → []. On évite `??` qui ne gère que null/undefined.
    const rawCz = ent.consistance_zone;
    const consistanceZone: string[] = Array.isArray(rawCz)
      ? (rawCz as string[]).filter((s): s is string => typeof s === 'string' && s !== '')
      : [];

    if (!signal.eap) {
      signal.eap = { eap: false, zap: false, origins: {}, annulation: {} };
    }
    const origineApproche = String(ent.origine_approche ?? '');
    signal.eap.origins[origineApproche] = {
      consistance_zone: consistanceZone.join(','),
      retention: ent.retention,
      selection: ent.selection,
      // annulation ici servira pour l'annulation par origine
    };
    signal.pedales = signal.pedales ?? {};
    signal.pedales.EAP = { nextEncounter: {}, pressed: false };

    const annulCommon: Record<string, unknown> = {
      pedale: ent.condition_annulation_pedale,
      fa: ent.condition_annulation_FA,
    };
    const condZone = String(ent.condition_annulation_zone ?? '');
    const condZoneAff = affectations[condZone];
    if (condZoneAff) {
      annulCommon.zone = condZone;
      if (!condZoneAff.eapAnnulation) condZoneAff.eapAnnulation = [];
      condZoneAff.eapAnnulation.push(signalId);
    }

    // Origine approche : marque la zone-origine et la consistance comme
    // déclencheurs de ZAP.
    const triggerZones = [origineApproche];
    for (const t of triggerZones) {
      const aff = affectations[t];
      if (!aff) continue;
      if (!aff.zapDeclenchees) aff.zapDeclenchees = [];
      aff.zapDeclenchees.push(signalId);
    }
    for (const t of consistanceZone) {
      const aff = affectations[t];
      if (!aff) continue;
      if (!aff.zapDeclenchees) aff.zapDeclenchees = [];
      aff.zapDeclenchees.push(signalId);
    }

    // Dernière zone de la consistance (ou origine si vide) = zone-retrait.
    const retraitZone =
      consistanceZone.length > 0
        ? consistanceZone[consistanceZone.length - 1]
        : origineApproche;
    const retraitAff = affectations[retraitZone];
    if (retraitAff) {
      if (!retraitAff.zapRetirees) retraitAff.zapRetirees = [];
      retraitAff.zapRetirees.push(signalId);
    }

    for (const lv of asArray(ent.leviers)) {
      signal.eap.annulation[lv] = { ...annulCommon, lever: lv };
      if (levers[lv]) {
        (levers[lv] as Record<string, unknown>).annulateurElec = {
          enabled: false,
        };
      }
    }
  }

  // EPA : enclenchements de parcours.
  for (const ent of annexeV.enclenchementsParcours ?? []) {
    const signalId = String(ent.signal ?? '');
    const signal = affectations[signalId];
    if (!signal) continue;
    if (!signal.epa) {
      signal.epa = { epa: false } as never;
      // Champs supplémentaires (cf. bundle) :
      (signal.epa as Record<string, unknown>).fc =
        'FC ' + signalId.slice(-3);
      (signal.epa as Record<string, unknown>).positionFermeture = false;
      (signal.epa as Record<string, unknown>).canceled = false;
      (signal.epa as Record<string, unknown>).annulateur =
        'AE Pa C ' + signalId.slice(-3);
      (signal.epa as Record<string, unknown>).annulation = {};
    }
    signal.pedales = signal.pedales ?? {};
    signal.pedales.EPA = { nextEncounter: {}, pressed: false };

    const annulCommon: Record<string, unknown> = {
      pedale: ent.condition_annulation_pedale,
      fa: ent.condition_annulation_FA,
      delay: parseInt(String(ent.temps_avant_annulation ?? '0'), 10),
    };
    const condZone = String(ent.condition_annulation_zone ?? '');
    const condZoneAff = affectations[condZone];
    if (condZoneAff) {
      annulCommon.zone = condZone;
      if (!condZoneAff.epaAnnulation) condZoneAff.epaAnnulation = [];
      condZoneAff.epaAnnulation.push(signalId);
    }
    const epaAnnul = (signal.epa as unknown as { annulation: Record<string, unknown> })
      .annulation;
    for (const lv of asArray(ent.leviers)) {
      epaAnnul[lv] = { ...annulCommon, lever: lv };
      if (levers[lv]) {
        (levers[lv] as Record<string, unknown>).annulateurElec = {
          enabled: false,
        };
      }
    }
  }
}

/**
 * Phase 7 — "Annexe 6" : annulateurs de transit (ATR).
 */
function applyAnnexeVI(station: Station): TransitAnnulator[] {
  const out: TransitAnnulator[] = [];
  const list = (station.annexeVI ?? []) as Record<string, unknown>[];
  for (const e of list) {
    const obj: TransitAnnulator = {
      id: String(e.id ?? ''),
      leviers: asArray(e.leviers),
      zones: asArray(e.zones),
      on: false,
      pressed: false,
      autorisation: e.terrain ? false : true,
      terrain: !!e.terrain,
      ...(e as object),
    } as TransitAnnulator;
    obj.on = false;
    obj.pressed = false;
    if (e.terrain) obj.autorisation = false;
    out.push(obj);
  }
  return out;
}

/**
 * Phase 8 — "Annexe Cantonnement" : un Bloc par cantonnement, et création
 * d'une affectation virtuelle "gare-X".
 */
function applyCantonnement(
  station: Station,
  affectations: Record<string, Affectation>,
): Bloc[] {
  const out: Bloc[] = [];
  const list = (station.cantonnement ?? []) as Record<string, unknown>[];
  for (const c of list) {
    const name = String(c.name ?? '');
    const semaphoreId = String(c.semaphore ?? '');
    const bloc: Bloc = {
      id: String(out.length),
      gareLabel: name,
      position: (c.position as 'droite' | 'gauche') ?? 'droite',
      testDuration: Number(c.test_duration ?? 0),
      test: 'E',
      semaphoreId,
      commutSemaphore: 'N',
      commutSemaphoreLight: 'E',
      voieLibre: 'A',
      reddition: 'E',
      annonce: 'E',
      blocage: 'E',
      dispositifs: [],
      pedales: { 'réddition': { pressed: false } },
      disturbances: [],
    };
    // Le sémaphore est rattaché au bloc côté affectation.
    const sem = affectations[semaphoreId];
    if (sem) {
      (sem as Record<string, unknown>).blocId = bloc.id;
      sem.pedales = sem.pedales ?? {};
      sem.pedales.FA = { nextEncounter: {}, pressed: false };
    }
    out.push(bloc);
    affectations['gare-' + name] = {
      name: 'gare-' + name,
      type: 'gare',
      observers: [],
      nextEncounter: {},
      disturbances: [],
    };
  }
  return out;
}

/**
 * Phase 9 — "controlesVU" : marque les aiguilles et signaux concernés.
 */
function applyControlesVU(
  station: Station,
  affectations: Record<string, Affectation>,
): void {
  const cvu = station.controlesVU as
    | { aiguilles?: string[]; signaux?: string[] }
    | undefined;
  if (!cvu) return;
  for (const ag of cvu.aiguilles ?? []) {
    const aff = affectations['Ag' + ag];
    if (!aff) continue;
    aff.positionNormal = aff.position;
    aff.controleVU = true;
  }
  for (const sg of cvu.signaux ?? []) {
    const aff = affectations[sg];
    if (!aff) continue;
    aff.controleVU = true;
  }
}

/**
 * Phase 10 — "Parcours" : remplissage de `nextEncounter` pour chaque
 * affectation et chaque direction (pair/impair). Cas spéciaux :
 * - "X-droite" / "X-gauche" : aiguille X, sub-key D ou G
 * - "X-pédale Y" : pédale Y de l'item X (ou bloc gare Y)
 * - sinon : item X directement.
 */
function applyParcours(
  station: Station,
  affectations: Record<string, Affectation>,
  blocs: Bloc[],
): void {
  const parcours = (station.parcours ?? {}) as {
    pair?: { from: string; to: string; duration: string | number }[];
    impair?: { from: string; to: string; duration: string | number }[];
  };
  for (const direction of ['pair', 'impair'] as const) {
    const lines = parcours[direction] ?? [];
    for (const line of lines) {
      const next = {
        id: String(line.to),
        timeDistance: parseInt(String(line.duration), 10),
      };
      const from = String(line.from);

      if (from.indexOf('-droite') !== -1) {
        const baseName = from.slice(0, from.length - '-droite'.length);
        const aff = affectations[baseName];
        if (!aff) continue;
        aff.nextEncounter = aff.nextEncounter ?? {};
        const slot = (aff.nextEncounter[direction] ?? {}) as {
          G?: { id: string; timeDistance: number };
          D?: { id: string; timeDistance: number };
        };
        slot.D = next;
        aff.nextEncounter[direction] = slot;
      } else if (from.indexOf('-gauche') !== -1) {
        const baseName = from.slice(0, from.length - '-gauche'.length);
        const aff = affectations[baseName];
        if (!aff) continue;
        aff.nextEncounter = aff.nextEncounter ?? {};
        const slot = (aff.nextEncounter[direction] ?? {}) as {
          G?: { id: string; timeDistance: number };
          D?: { id: string; timeDistance: number };
        };
        slot.G = next;
        aff.nextEncounter[direction] = slot;
      } else if (from.indexOf('-pédale') !== -1) {
        const [base, pedaleName] = from.split('-pédale ');
        let target: Affectation | Bloc | undefined = affectations[base];
        let pedales: Record<string, { pressed?: boolean; nextEncounter?: Record<string, { id: string; timeDistance: number }> }> | undefined;
        if (target) {
          pedales = (target as Affectation).pedales;
        } else {
          const bloc = blocs.find((b) => b.gareLabel === base);
          if (bloc) {
            target = bloc;
            pedales = bloc.pedales as unknown as typeof pedales;
          }
        }
        if (!target || !pedales) continue;
        if (!pedales[pedaleName]) {
          pedales[pedaleName] = { pressed: false, nextEncounter: {} };
        }
        const ped = pedales[pedaleName];
        ped.nextEncounter = ped.nextEncounter ?? {};
        ped.nextEncounter[direction] = next;
      } else {
        const aff = affectations[from];
        if (!aff) continue;
        aff.nextEncounter = aff.nextEncounter ?? {};
        aff.nextEncounter[direction] = next;
      }
    }
  }
}

// ===== Export principal =====

/**
 * Convertit un objet Station JSON en `PlayerData` (état dynamique initial).
 * L'objet `station` n'est pas muté : les seules opérations sur le JSON sont
 * des copies superficielles (Object.assign / spread).
 */
export function stationToPlayerData(station: Station): PlayerData {
  const affectations = buildItemsAffectations(station.items ?? []);
  const levers = buildLevers(station, affectations);

  applyAnnexeI(station, levers);
  const { groups, locks } = applyAnnexeILabels(station);
  const centralLocks = applyAnnexeIbis(station);

  applyAnnexeII(station, affectations, levers);
  // Annexe 3 : ignorée par le builder original (commentaire t="Annexe 3").
  applyAnnexeIV(station, affectations, levers);
  applyAnnexeV(station, affectations, levers);
  const transitAnnulateurs = applyAnnexeVI(station);

  const blocs = applyCantonnement(station, affectations);
  applyControlesVU(station, affectations);
  applyParcours(station, affectations, blocs);

  return {
    id: station.id,
    items: (station.items ?? []).slice(0),
    levers,
    affectations,
    blocs,
    groups,
    locks,
    centralLocks,
    transitAnnulateurs,
    scenarioTargets: {},
    holdedKey: undefined,
    phoneIsRinging: false,
    discordances_count: 0,
  };
}
