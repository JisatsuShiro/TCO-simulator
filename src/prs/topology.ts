// Topologie du TCO du PRS de Springfield.
//
// **Deux couches distinctes dans ce fichier :**
//
// 1. La *géométrie* (lignes, abscisses, vecteurs d'aiguille) suit la maquette
//    Claude Design « PRS TCO — Voie Libre » : un schéma épuré en 1560 × 400,
//    quatre voies horizontales (M / V1 / NU / V2) reliées par quatre obliques.
// 2. La *logique* (identifiants de zone, itinéraires, groupes d'aiguilles,
//    enclenchements de transit) est celle relevée dans `PRS/construc/gaestro.js`
//    et ne dépend d'aucune coordonnée — cf. `docs/springfield-prs-spec.md` §5.
//
// La première couche peut être redessinée librement ; la seconde ne doit pas
// bouger sans repasser par la spec.

// ===== Identifiants ==========================================================

export type ZoneId =
  | 'z79' | 'z79b' | 'z80' | 'z80b' | 'z81' | 'z81bis'
  | 'z81a' | 'z81b' | 'z81c' | 'z81d'
  | 'z82a' | 'z82b' | 'z82bb' | 'z82c' | 'z82d' | 'z82e'
  | 'z83a' | 'z83b' | 'z84' | 'z85' | 'z86' | 'z87'
  | 'z88' | 'z88b' | 'z89';

export type AigId = 'aig81a' | 'aig81b' | 'aig82' | 'aig83a' | 'aig83b' | 'aig85a' | 'aig85b';

export type SignalId = 'c81' | 'c82' | 'c84' | 'cv83' | 'cv85' | 'cv88';

export type RouteId =
  | 'agnida' | 'agnitp' | 'agnu'
  | 'amni' | 'amnu' | 'nuam'
  | 'dgni' | 'nzdgda' | 'nzdgtp'
  | 'nudgvi' | 'nudgvz'
  | 'aum';

/** Position d'aiguille. `0` = absence de contrôle. */
export type AigPos = 'g' | 'd';

/** État d'une zone : libre / itinéraire tracé / occupée. */
export type ZoneState = 0 | 1 | 2;

/** État d'un signal. **`0` = OUVERT, `1` = FERMÉ** (convention du code d'origine). */
export type SignalState = 0 | 1;

/** Zone d'approche : 0 = pas d'approche, 1 = enclenchement actif, 2 = libérable. */
export type ZapState = 0 | 1 | 2;

// ===== Repère de la maquette =================================================

export const TCO_WIDTH = 1560;
export const TCO_HEIGHT = 400;

/** Les quatre voies du schéma, avec leur ordonnée et leur emprise. */
export const LINES = {
  // Le tiroir court jusqu'à 678, à l'aplomb du bord droit du cartouche « PRS »
  // posé au-dessus (x 620, largeur 58).
  /** Voie mère de l'EP MOE, en butoir à droite. */
  m: { y: 62, x0: 150, x1: 678, bufferAt: 678 },
  /** Voie 1. */
  v1: { y: 152, x0: 90, x1: 1500 },
  /** Voie NU, en butoir à droite. */
  nu: { y: 227, x0: 1150, x1: 1478, bufferAt: 1478 },
  /** Voie 2. */
  v2: { y: 302, x0: 90, x1: 1500 },
} as const;

export type LineId = keyof typeof LINES;

/** Les quatre obliques de liaison entre voies. */
export const DIAGONALS = {
  /** Communication 85 : voie M ↔ voie 1. */
  d85: { from: [470, 62], to: [560, 152] },
  /** Communication 81 : voie 2 ↔ voie 1. */
  d81: { from: [646, 302], to: [794, 152] },
  // 45°, comme les obliques 85 et 81. La voie NU étant à mi-hauteur entre V1
  // et V2, la descente n'est que de 75 px : ces deux obliques ne font donc que
  // 106 px, contre 211 pour l'oblique 81. Tout ce qui s'y pose — secteurs
  // d'aiguille, pastilles, coupures — est dimensionné en conséquence, sur les
  // proportions relevées du TCO d'origine.
  /** Branchement 83a : voie 1 → jonction NU. */
  d83a: { from: [1073, 152], to: [1148, 227] },
  /** Branchement 82 : voie 2 → jonction NU. */
  d82: { from: [1073, 302], to: [1148, 227] },
} as const;

export type DiagId = keyof typeof DIAGONALS;

/** Point et angle au long d'une oblique, `t` allant de 0 à 1. */
export function pointOnDiagonal(id: DiagId, t: number): { x: number; y: number; angle: number } {
  const { from, to } = DIAGONALS[id];
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  return {
    x: from[0] + dx * t,
    y: from[1] + dy * t,
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}

// ===== Zones =================================================================

/**
 * Longueur d'une pastille de zone, identique pour toutes.
 *
 * Le contrôle de zone est un voyant, pas une échelle : sa longueur ne
 * représente pas celle du canton. Les pastilles sont donc toutes de même
 * taille, et c'est le fond sombre qui les sépare — la plus petite distance
 * entre deux centres est de 46 px (z81 / z81bis).
 */
export const ZONE_LENGTH = 26;

/**
 * Une pastille posée sur une voie horizontale (repérée par son centre) ou sur
 * une oblique (repérée par sa position `t` le long de celle-ci).
 */
export type ZonePlacement =
  | {
      on: 'line';
      line: LineId;
      /** Centre de la pastille. */
      cx: number;
      /**
       * Étendue réelle de la zone le long de la voie, `[début, fin]`, calée
       * sur les aiguilles et les signaux qui la délimitent. Portée par la
       * pastille **porteuse** seulement : les miroirs n'en ont pas, ils
       * appartiennent à la même zone.
       */
      span?: [number, number];
    }
  | {
      on: 'diag';
      diag: DiagId;
      /**
       * Position du centre de la pastille le long de l'oblique. La portion de
       * zone qu'elle couvre se déduit des limites déclarées dans `DIAG_CUTS`.
       */
      t: number;
    };

export interface ZoneDef {
  id: ZoneId;
  place: ZonePlacement;
  /** Libellé affiché sous forme « z 79 » ; omis pour les tronçons secondaires. */
  label?: string;
  /**
   * Pose le libellé sous la voie plutôt qu'au-dessus. Utile là où la rangée
   * haute est déjà prise — le Cv 85 et son feu occupent celle de la zone 89.
   */
  labelBelow?: boolean;
  /**
   * Zone « miroir » : second tronçon graphique d'une même zone isolée, qui
   * suit l'état de sa zone maîtresse. `refresh()` du code d'origine les met
   * toujours à jour par paires.
   */
  mirrors?: ZoneId;
}

export const ZONES: ZoneDef[] = [
  // — Voie M
  //
  // La voie mère se découpe en trois : la section d'accès, jusqu'au Cv 85,
  // sans contrôle de zone ; la zone 89, du Cv 85 au talon de l'aiguille 85a ;
  // le tiroir en butoir au-delà, sans contrôle non plus. La pastille se pose
  // entre le mât du Cv 85 et l'aiguille, seule portion libre de la zone.
  { id: 'z89', place: { on: 'line', line: 'm', cx: 442, span: [415, 520] }, label: 'z 89', labelBelow: true },

  // — Voie 1
  { id: 'z79', place: { on: 'line', line: 'v1', cx: 205, span: [90, 440] }, label: 'z 79' },
  { id: 'z79b', place: { on: 'line', line: 'v1', cx: 280 }, mirrors: 'z79' },
  { id: 'z81', place: { on: 'line', line: 'v1', cx: 612, span: [440, 655] }, label: 'z 81a' },
  { id: 'z81bis', place: { on: 'line', line: 'v1', cx: 482 } },
  { id: 'z81a', place: { on: 'line', line: 'v1', cx: 712.5 } },
  { id: 'z81b', place: { on: 'line', line: 'v1', cx: 900, span: [655, 1190] }, label: 'z 81b' },
  { id: 'z81c', place: { on: 'line', line: 'v1', cx: 1157.5 } },
  { id: 'z85', place: { on: 'line', line: 'v1', cx: 1247.5, span: [1190, 1305] }, label: 'z 85' },
  { id: 'z87', place: { on: 'line', line: 'v1', cx: 1422.5, span: [1305, 1500] }, label: 'z 87' },

  // — Voie NU
  { id: 'z83b', place: { on: 'line', line: 'nu', cx: 1192.5, span: [1150, 1243] }, label: 'z 83' },
  { id: 'z84', place: { on: 'line', line: 'nu', cx: 1287.5, span: [1243, 1360] }, label: 'z 84' },
  { id: 'z86', place: { on: 'line', line: 'nu', cx: 1420, span: [1360, 1478] }, label: 'z 86' },

  // — Voie 2
  { id: 'z80', place: { on: 'line', line: 'v2', cx: 235, span: [90, 470] }, label: 'z 80' },
  { id: 'z80b', place: { on: 'line', line: 'v2', cx: 385 }, mirrors: 'z80' },
  { id: 'z82a', place: { on: 'line', line: 'v2', cx: 550 } },
  { id: 'z82b', place: { on: 'line', line: 'v2', cx: 800, span: [470, 1232] }, label: 'z 82' },
  { id: 'z82bb', place: { on: 'line', line: 'v2', cx: 940 }, mirrors: 'z82b' },
  { id: 'z82c', place: { on: 'line', line: 'v2', cx: 1165 } },
  { id: 'z88', place: { on: 'line', line: 'v2', cx: 1300, span: [1232, 1500] }, label: 'z 88' },
  { id: 'z88b', place: { on: 'line', line: 'v2', cx: 1427.5 }, mirrors: 'z88' },

  // — Zones de liaison, posées sur les obliques
  //
  // Au tiers et aux deux tiers : c'est le centre de la place laissée entre la
  // lampe de position de l'aiguille et la coupure de zone du milieu.
  { id: 'z82d', place: { on: 'diag', diag: 'd81', t: 0.333 } },
  { id: 'z81d', place: { on: 'diag', diag: 'd81', t: 0.667 } },
  // Position relevée sur le TCO d'origine : la pastille se pose au-delà de la
  // moitié de l'oblique, pour dégager la lampe de position de l'aiguille.
  { id: 'z83a', place: { on: 'diag', diag: 'd83a', t: 0.627 } },
  { id: 'z82e', place: { on: 'diag', diag: 'd82', t: 0.481 } },
];

/** Zones portant réellement un état dans le moteur (les miroirs sont exclus). */

/** Écart laissé entre deux tronçons de voie, aux limites de zone. */
export const ZONE_JOINT_GAP = 14;

/**
 * Longueur de voie qui doit rester visible de chaque côté d'une pastille.
 * Sur les tronçons courts — z81, entre l'aiguille 85b et le Cv 88, ne fait que
 * 45 px — la pastille est raccourcie plutôt que de recouvrir tout son tronçon.
 */
export const ZONE_INSET = 6;

/** En deçà, la pastille ne se lirait plus : on ne la rétrécit pas davantage. */
export const ZONE_MIN_LENGTH = 12;

/**
 * Pastille et coupure sur une oblique.
 *
 * Les obliques 83a et 82 ne font que 106 px — la voie NU est à mi-hauteur
 * entre V1 et V2, la descente n'est que de 75 px — et doivent y loger deux
 * secteurs d'aiguille, une pastille et une coupure. Les valeurs des voies
 * droites (26 et 14) n'y tiennent pas.
 *
 * La pastille reprend la proportion du TCO d'origine, 0,18 d'oblique. La
 * coupure, elle, y vaut 0,033 : bien trop discrète sur fond sombre, on la
 * porte à 0,11 — le maximum que laisse la place entre secteur et pastille.
 */
export const DIAG_ZONE_LENGTH = 19;
export const DIAG_JOINT_GAP = 12;

/** Longueur de la pastille d'une zone, réduite si son tronçon est étroit. */
export function zoneLength(zone: ZoneDef): number {
  if (zone.place.on === 'diag') {
    const [from, to] = diagRange(zone.place.diag, zone.place.t);
    const room = (to - from) * diagLength(zone.place.diag);
    return Math.max(
      ZONE_MIN_LENGTH,
      Math.min(DIAG_ZONE_LENGTH, room - DIAG_JOINT_GAP - 2 * ZONE_INSET),
    );
  }
  const span = zone.place.span;
  if (!span) return ZONE_LENGTH;
  const full = span[1] - span[0];
  return Math.max(ZONE_MIN_LENGTH, Math.min(ZONE_LENGTH, full - ZONE_JOINT_GAP - 2 * ZONE_INSET));
}

/**
 * Limite de zone le long de chaque oblique, en fraction de sa longueur.
 *
 * Une oblique relie deux aiguilles posées sur deux voies différentes, donc
 * deux circuits. Le TCO d'origine ne matérialise pas cette limite — la ligne
 * y est continue et seules les pastilles s'allument — la position est donc
 * une décision de dessin :
 *
 * - obliques 85 et 81, à mi-chemin. La 81 porte une pastille de chaque côté,
 *   la 85 n'en porte aucune : rien ne justifie de décentrer.
 * - obliques 83a et 82, décalées pour donner le tronçon le plus long à celui
 *   des deux circuits qui porte le contrôle de zone — 83 sur l'oblique 83a,
 *   82 sur l'oblique 82. L'autre côté n'a rien à montrer.
 */
export const DIAG_CUTS: Record<DiagId, number[]> = {
  d85: [0.5],
  d81: [0.5],
  d83a: [0.448],
  d82: [0.663],
};

/** Sous-portion d'oblique qui contient une position `t`. */
export function diagRange(diag: DiagId, at: number): [number, number] {
  const bounds = [0, ...DIAG_CUTS[diag], 1];
  for (let i = 0; i < bounds.length - 1; i += 1) {
    if (at <= bounds[i + 1] || i === bounds.length - 2) return [bounds[i], bounds[i + 1]];
  }
  return [0, 1];
}

export function diagLength(id: DiagId): number {
  const { from, to } = DIAGONALS[id];
  return Math.hypot(to[0] - from[0], to[1] - from[1]);
}

/**
 * Une limite de zone tombant sur une **aiguille** ne se matérialise pas par un
 * vide : c'est le triangle de l'aiguille qui marque la séparation. On ne coupe
 * le trait qu'aux limites sans repère physique, ou à celles portées par un
 * signal.
 */
function switchAt(y: number, x: number): boolean {
  return AIGUILLES.some((a) => a.y === y && Math.abs(a.x - x) < 3);
}

/**
 * Découpage d'une voie en **tronçons de zone**.
 *
 * Le trait de voie n'est pas continu : il est interrompu à chaque limite de
 * zone, pour que l'on voie d'un coup d'œil quelle portion de voie relève de
 * quel circuit. La limite est prise à mi-chemin entre deux pastilles
 * consécutives ; les pastilles secondaires (`mirrors`) ne coupent pas, elles
 * appartiennent à la même zone que leur pastille porteuse.
 */
export function trackSegments(line: LineId): { id: ZoneId | null; x1: number; x2: number }[] {
  const { x0, x1, y } = LINES[line];
  const spans = ZONES.flatMap((z) =>
    z.place.on === 'line' && z.place.line === line && z.place.span && !z.mirrors
      ? [{ id: z.id, from: z.place.span[0], to: z.place.span[1] }]
      : [],
  ).sort((a, b) => a.from - b.from);

  const half = ZONE_JOINT_GAP / 2;
  const out: { id: ZoneId | null; x1: number; x2: number }[] = [];
  let cursor: number = x0;
  for (const s of spans) {
    // Portion de voie hors zone (bout de ligne, tiroir…) : trait simple.
    if (s.from > cursor + ZONE_JOINT_GAP) {
      out.push({ id: null, x1: cursor === x0 ? x0 : cursor + half, x2: s.from - half });
    }
    const cutStart = s.from > x0 && !switchAt(y, s.from);
    const cutEnd = s.to < x1 && !switchAt(y, s.to);
    out.push({
      id: s.id,
      x1: cutStart ? s.from + half : s.from,
      x2: cutEnd ? s.to - half : s.to,
    });
    cursor = s.to;
  }
  if (cursor < x1 - ZONE_JOINT_GAP) out.push({ id: null, x1: cursor + half, x2: x1 });
  return out;
}

/**
 * Découpage d'une oblique en tronçons de zone. L'oblique 81, entre les
 * aiguilles 81b et 81a, en porte deux : `z82d` côté voie 2, `z81d` côté
 * voie 1. Ses deux extrémités étant des aiguilles, seule la limite intérieure
 * est matérialisée.
 */
export function diagSegments(
  diag: DiagId,
): { id: ZoneId | null; x1: number; y1: number; x2: number; y2: number }[] {
  const len = diagLength(diag);
  const dt = DIAG_JOINT_GAP / 2 / len;
  const bounds = [0, ...DIAG_CUTS[diag], 1];

  return bounds.slice(0, -1).map((from, i) => {
    const to = bounds[i + 1];
    const a = pointOnDiagonal(diag, i === 0 ? from : from + dt);
    const b = pointOnDiagonal(diag, i === bounds.length - 2 ? to : to - dt);
    // La pastille éventuellement posée sur cette portion lui donne son identité.
    const zone = ZONES.find(
      (z) => z.place.on === 'diag' && z.place.diag === diag && z.place.t > from && z.place.t <= to,
    );
    return { id: zone?.id ?? null, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  });
}

export const STATEFUL_ZONES: ZoneId[] = ZONES.filter((z) => !z.mirrors).map((z) => z.id);

// ===== Aiguilles =============================================================

export interface AigDef {
  id: AigId;
  /** Numéro affiché sur le TCO. */
  label: string;
  /** Point de pivot (la pointe du triangle). */
  x: number;
  y: number;
  /**
   * Position pour laquelle l'aiguille est **en position directe** : la voie
   * continue dans sa propre ligne. L'autre position emprunte l'oblique.
   */
  straight: AigPos;
  /** Vecteur unitaire de la branche directe. */
  vecStraight: readonly [number, number];
  /** Vecteur unitaire de la branche déviée. */
  vecDeviate: readonly [number, number];
  /** Longueur des branches du secteur. */
  arm: number;
  /**
   * Longueur d'une branche en particulier, quand elle doit s'écarter de
   * `arm` — l'aiguille 82 et l'aiguille 83b se font face sur l'oblique 82 et
   * s'y partagent la place de façon dissymétrique.
   */
  armStraight?: number;
  armDeviate?: number;
  /**
   * Ancrage du libellé. `middle` le pose à l'aplomb du cœur, du côté où le
   * secteur n'ouvre pas — 14 px au-dessus de la voie, ou 26 px au-dessous.
   */
  labelAnchor?: 'start' | 'middle' | 'end';
  /** Position du libellé. */
  labelX: number;
  labelY: number;
}

/**
 * Les 7 aiguilles. Les vecteurs sont ceux de la maquette ; `straight` est
 * déduit de la doctrine : c'est la position pour laquelle la voie porteuse
 * reste continue (cf. les `ff*()` d'origine — AG-* demande le couple 85 en
 * « g », donc voie 1 continue et voie M isolée).
 */
export const AIGUILLES: AigDef[] = [
  {
    id: 'aig85a', label: '85a', x: 470, y: 62, straight: 'g',
    vecStraight: [1, 0], vecDeviate: [0.707, 0.707], arm: 44,
    labelX: 470, labelY: 48, labelAnchor: 'middle',
  },
  {
    id: 'aig85b', label: '85b', x: 560, y: 152, straight: 'g',
    vecStraight: [-1, 0], vecDeviate: [-0.707, -0.707], arm: 44,
    labelX: 560, labelY: 178, labelAnchor: 'middle',
  },
  {
    id: 'aig81b', label: '81b', x: 646, y: 302, straight: 'd',
    vecStraight: [1, 0], vecDeviate: [0.702, -0.712], arm: 44,
    labelX: 646, labelY: 328, labelAnchor: 'middle',
  },
  {
    id: 'aig81a', label: '81a', x: 794, y: 152, straight: 'd',
    vecStraight: [-1, 0], vecDeviate: [-0.702, 0.712], arm: 44,
    labelX: 794, labelY: 138, labelAnchor: 'middle',
  },
  {
    id: 'aig83a', label: '83a', x: 1073, y: 152, straight: 'g',
    // Secteur allongé au-delà de la proportion d'origine (0,27 d'oblique) :
    // à 0,36 il se lit mieux, et ses deux lampes rentrent d'autant.
    vecStraight: [1, 0], vecDeviate: [0.7071, 0.7071], arm: 38,
    labelX: 1073, labelY: 138, labelAnchor: 'middle',
  },
  {
    id: 'aig82', label: '82', x: 1073, y: 302, straight: 'd',
    vecStraight: [1, 0], vecDeviate: [0.7071, -0.7071], arm: 38,
    labelX: 1073, labelY: 328, labelAnchor: 'middle',
  },
  {
    id: 'aig83b', label: '83b', x: 1148, y: 227, straight: 'd',
    // Secteur plus petit que celui des deux aiguilles qui lui font face, comme
    // sur le TCO d'origine — mais allongé comme les leurs. Sa limite haute est
    // la coupure de l'oblique 82, qu'il ne doit pas venir toucher.
    vecStraight: [-0.7071, -0.7071], vecDeviate: [-0.7071, 0.7071], arm: 26,
    // Dans l'ouverture du secteur, contre les deux lampes de position.
    labelX: 1098, labelY: 231,
  },
];

export const AIG_IDS: AigId[] = AIGUILLES.map((a) => a.id);

// ===== Signaux ===============================================================

export interface SignalDef {
  id: SignalId;
  label: string;
  /** Ancrage sur la voie. */
  x: number;
  y: number;
  /** Ordonnée du coude (au-dessus ou au-dessous de la voie). */
  elbowY: number;
  /** Extrémité horizontale du bras. */
  armX: number;
  /** Centre du feu. */
  lampX: number;
  lampY: number;
  labelX: number;
  labelY: number;
  /**
   * Ancrage du libellé. `middle` le centre à l'aplomb du feu — le libellé se
   * lit alors franchement au-dessus ou au-dessous du signal, et non en biais.
   * Attention : le libellé n'est **pas** dans le groupe décalé par `dx`, donc
   * `labelX` doit valoir `lampX + dx` pour tomber sur le feu.
   */
  labelAnchor?: 'start' | 'middle' | 'end';
  /**
   * Décalage d'affichage, en pixels. Un signal se trouve **à la limite de deux
   * zones** ; le dessiner exactement là le placerait dans l'interruption du
   * trait. On le décale donc du côté d'où vient le mouvement qu'il protège :
   * il reste lisible et sa position reste juste au regard de la voie.
   */
  dx?: number;
  /** Un carré violet porte un liseré distinct. */
  violet: boolean;
}

export const SIGNALS: SignalDef[] = [
  // Cv 85 protège le mouvement AM → V1, qui vient de la gauche : son mât se
  // pose avant la limite de la zone 89, pas après.
  { id: 'cv85', label: 'Cv 85', dx: -13, x: 415, y: 62, elbowY: 44, armX: 428, lampX: 436, lampY: 44, labelX: 423, labelY: 26, labelAnchor: 'middle', violet: true },
  { id: 'c81', label: 'C 81', dx: -13, x: 440, y: 152, elbowY: 134, armX: 453, lampX: 461, lampY: 134, labelX: 448, labelY: 116, labelAnchor: 'middle', violet: false },
  // Cv 88 protège le mouvement NU → AM, qui circule de droite à gauche : sa
  // potence est donc orientée à gauche, comme C 82 et C 84.
  { id: 'cv88', label: 'Cv 88', dx: 13, x: 655, y: 152, elbowY: 172, armX: 642, lampX: 634, lampY: 172, labelX: 647, labelY: 196, labelAnchor: 'middle', violet: true },
  { id: 'cv83', label: 'Cv 83', dx: -13, x: 470, y: 302, elbowY: 322, armX: 483, lampX: 491, lampY: 322, labelX: 478, labelY: 347, labelAnchor: 'middle', violet: true },
  { id: 'c82', label: 'C 82', dx: 13, x: 1232, y: 302, elbowY: 322, armX: 1219, lampX: 1211, lampY: 322, labelX: 1224, labelY: 347, labelAnchor: 'middle', violet: false },
  { id: 'c84', label: 'C 84', dx: 13, x: 1243, y: 227, elbowY: 250, armX: 1230, lampX: 1222, lampY: 250, labelX: 1235, labelY: 274, labelAnchor: 'middle', violet: false },
];

export const SIGNAL_IDS: SignalId[] = SIGNALS.map((s) => s.id);

/**
 * Signaux hors périmètre du poste, présents sur la maquette au titre du
 * contexte (signal de block voisin). Ils sont dessinés mais **jamais pilotés**
 * par le moteur.
 */
export const DECOR_SIGNALS: Omit<SignalDef, 'id'>[] = [
  { label: 'C 101', x: 1462, y: 152, elbowY: 132, armX: 1475, lampX: 1483, lampY: 132, labelX: 1483, labelY: 114, labelAnchor: 'middle', violet: false },
];

// ===== Zones d'approche ======================================================

export interface ZapDef {
  id: 'zap81' | 'zap82' | 'zap84';
  x: number;
  y: number;
  labelX: number;
  labelY: number;
  /** Zones dont l'occupation déclenche l'approche. */
  triggerZones: ZoneId[];
  /** Annonce (poste voisin) déclenchant aussi l'approche, si applicable. */
  annonce?: 'annv1' | 'annv2';
  /** Signal associé. */
  signal: SignalId;
}

export const ZAPS: ZapDef[] = [
  { id: 'zap81', x: 404, y: 130, labelX: 396, labelY: 118, triggerZones: ['z79'], annonce: 'annv1', signal: 'c81' },
  { id: 'zap84', x: 1292, y: 238, labelX: 1302, labelY: 256, triggerZones: ['z84', 'z86'], signal: 'c84' },
  { id: 'zap82', x: 1282, y: 318, labelX: 1292, labelY: 334, triggerZones: ['z88'], annonce: 'annv2', signal: 'c82' },
];

// ===== Voyants et repères ====================================================

export interface LampDef {
  key: 'vaum' | 'vauac' | 'di' | 'atr' | 'annv1' | 'annv2';
  x: number;
  y: number;
  label: string;
  labelX: number;
  labelY: number;
  /** `middle` sert aux voyants dont le libellé se pose au-dessus. */
  anchor: 'start' | 'middle' | 'end';
}

export const LAMPS: LampDef[] = [
  // Les deux autorisations de l'EP MOE se lisent ensemble : même hauteur,
  // libellé au-dessus de son voyant. Posées entre le rond AM et le mât du
  // Cv 85, la seule portion libre de la voie mère.
  { key: 'vauac', x: 290, y: 48, label: 'Au.Ac', labelX: 290, labelY: 34, anchor: 'middle' },
  { key: 'vaum', x: 345, y: 48, label: 'Au.M', labelX: 345, labelY: 34, anchor: 'middle' },
  { key: 'di', x: 1082, y: 44, label: 'DI', labelX: 1094, labelY: 48, anchor: 'start' },
  { key: 'atr', x: 1160, y: 44, label: 'Atr', labelX: 1172, labelY: 48, anchor: 'start' },
  { key: 'annv1', x: 122, y: 130, label: 'Annonce', labelX: 132, labelY: 134, anchor: 'start' },
  { key: 'annv2', x: 1478, y: 332, label: 'Annonce', labelX: 1466, labelY: 336, anchor: 'end' },
];

/** Pastilles de désignation des origines/destinations d'itinéraire. */
export const ENDPOINTS: { label: string; x: number; y: number }[] = [
  { label: 'AM', x: 250, y: 62 },
  { label: 'AG', x: 330, y: 152 },
  { label: 'DG', x: 330, y: 302 },
  { label: 'N1', x: 1360, y: 152 },
  { label: 'N2', x: 1360, y: 302 },
  { label: 'NU', x: 1330, y: 227 },
];

// ===== Groupes d'aiguilles et enclenchement de transit =======================

/**
 * Les aiguilles se commandent par **groupes**, chacun protégé par son
 * enclenchement de transit propre : c'est la garde que l'on retrouve en tête
 * de chaque `ff*()` du code d'origine. Un annulateur de transit (`bannul*`)
 * relâche la garde correspondante.
 */
export interface SwitchGroupDef {
  id: 'g85' | 'g81' | 'g83' | 'g82';
  members: AigId[];
  guards: { zone: ZoneId; releasedBy: 1 | 2 | 3 }[];
  /**
   * Si `true`, la manœuvre est en plus bloquée quand un itinéraire AM-* est
   * établi alors que `z81` n'est pas libre (garde `(amni==0)||(z81==0)`).
   */
  blockedByAmOnZ81?: boolean;
}

export const SWITCH_GROUPS: SwitchGroupDef[] = [
  {
    id: 'g85',
    members: ['aig85a', 'aig85b'],
    guards: [
      { zone: 'z81', releasedBy: 2 },
      { zone: 'z89', releasedBy: 1 },
    ],
  },
  {
    id: 'g81',
    members: ['aig81a', 'aig81b'],
    guards: [
      { zone: 'z81b', releasedBy: 2 },
      { zone: 'z82a', releasedBy: 3 },
    ],
    blockedByAmOnZ81: true,
  },
  {
    id: 'g83',
    members: ['aig83a', 'aig83b'],
    guards: [
      { zone: 'z81b', releasedBy: 2 },
      { zone: 'z83b', releasedBy: 2 },
    ],
    blockedByAmOnZ81: true,
  },
  {
    id: 'g82',
    members: ['aig82'],
    guards: [{ zone: 'z82b', releasedBy: 3 }],
  },
];

/** Groupe auquel appartient une aiguille. */
export const GROUP_OF_AIG: Record<AigId, SwitchGroupDef['id']> = {
  aig85a: 'g85',
  aig85b: 'g85',
  aig81a: 'g81',
  aig81b: 'g81',
  aig83a: 'g83',
  aig83b: 'g83',
  aig82: 'g82',
};

// ===== Itinéraires ===========================================================

export interface RouteDef {
  id: RouteId;
  /** Libellé principal du bouton de pupitre. */
  label: string;
  /** Qualificatif secondaire (TP, V1, V2) affiché en petit sous le libellé. */
  sub?: string;
  /** Description longue (infobulle). */
  hint: string;
  /** Signal ouvert par l'itinéraire. `null` pour l'autorisation AU-M. */
  signal: SignalId | null;
  /** Signal complémentaire à ouvrir d'abord (NU-AM : Cv88 puis C84). */
  preSignal?: SignalId;
  /** Positions d'aiguilles commandées à la formation. */
  switches: Partial<Record<AigId, AigPos>>;
  /** Zones mises à l'état « tracé » (1) à l'établissement. */
  locks: ZoneId[];
  /** Zones qui doivent être libres (≠ occupée) pour ouvrir le signal. */
  openNeedsFree: ZoneId[];
  /** Positions d'aiguilles contrôlées pour ouvrir le signal. */
  openNeedsSwitches: Partial<Record<AigId, AigPos>>;
  /** Variante « tracé permanent » du même itinéraire, s'il en existe une. */
  tpOf?: RouteId;
  /** Zone d'approche qui gouverne la D.M.T. de cet itinéraire. */
  zap?: 'zap81' | 'zap82' | 'zap84';
  /** Temporisation de destruction manuelle temporisée, en ms. */
  /**
   * Délai de destruction manuelle temporisée. Seuls **six** itinéraires en ont
   * une — le source ne définit que `dtagnida`, `dtagnu`, `dtnuam`,
   * `dtnzdgda`, `dtnudgvi` et `dtnudgvz`. Les tracés permanents n'en ont pas :
   * sous enclenchement d'approche, c'est le bouton de l'itinéraire simple qui
   * porte la temporisation.
   */
  dmtMs?: number;
  /** Code du menu « dérangement d'itinéraire » (`null` si non exposé). */
  derangementKey: string | null;
  /**
   * Garde de groupe re-testée au moment de poser le transit, au-delà des
   * positions d'aiguille. Seul `nudgvz` en porte une : `ffnudgvz()` exige
   * `(z82b==0)||(bannul3==1)||(nudgvz==1)` même quand l'aiguille 82 est déjà
   * en place — cas où aucune manœuvre n'a lieu et où la garde du groupe n'est
   * donc jamais consultée.
   */
  transitAlsoNeedsGroup?: SwitchGroupDef['id'];
}

/**
 * Les 12 commandes du pupitre. Colonnes `switches` / `locks` /
 * `openNeeds*` transcrites depuis les `ff*()` et `fe*()` d'origine —
 * cf. `docs/springfield-prs-spec.md` §5.
 */
export const ROUTES: RouteDef[] = [
  {
    id: 'agnida',
    label: 'AG-N1',
    hint: 'Arrivée AG vers voie 1 — carré 81',
    signal: 'c81',
    switches: { aig85a: 'g', aig85b: 'g', aig81a: 'd', aig81b: 'd', aig83a: 'g', aig83b: 'g' },
    locks: ['z79', 'z81', 'z81bis', 'z81a', 'z81b', 'z81c', 'z85', 'z87'],
    openNeedsFree: ['z81'],
    openNeedsSwitches: { aig81a: 'd', aig83a: 'g', aig85a: 'g', aig85b: 'g' },
    zap: 'zap81',
    dmtMs: 30_000,
    derangementKey: 'agni',
  },
  {
    id: 'agnitp',
    label: 'AG-N1',
    sub: 'TP',
    hint: 'Arrivée AG vers voie 1 — tracé permanent',
    signal: 'c81',
    switches: { aig85a: 'g', aig85b: 'g', aig81a: 'd', aig81b: 'd', aig83a: 'g', aig83b: 'g' },
    locks: ['z79', 'z81', 'z81bis', 'z81a', 'z81b', 'z81c', 'z85', 'z87'],
    openNeedsFree: ['z81'],
    openNeedsSwitches: { aig81a: 'd', aig83a: 'g', aig85a: 'g', aig85b: 'g' },
    tpOf: 'agnida',
    zap: 'zap81',
    derangementKey: 'agni',
  },
  {
    id: 'agnu',
    label: 'AG-NU',
    hint: 'Arrivée AG vers voie NU — carré 81',
    signal: 'c81',
    switches: { aig85a: 'g', aig85b: 'g', aig81a: 'd', aig81b: 'd', aig83a: 'd', aig83b: 'd' },
    locks: ['z79', 'z81', 'z81bis', 'z81a', 'z81b', 'z83a', 'z83b', 'z84', 'z86'],
    openNeedsFree: ['z81', 'z81b', 'z83b', 'z84'],
    openNeedsSwitches: { aig81a: 'd', aig83a: 'd', aig83b: 'd', aig85a: 'g', aig85b: 'g' },
    zap: 'zap81',
    dmtMs: 30_000,
    derangementKey: 'agnu',
  },
  {
    id: 'amni',
    label: 'AM-N1',
    hint: 'Départ voie M vers voie 1 — carré violet 85',
    signal: 'cv85',
    switches: { aig85a: 'd', aig85b: 'd', aig81a: 'd', aig81b: 'd', aig83a: 'g', aig83b: 'g' },
    locks: ['z89', 'z81', 'z81a', 'z81b', 'z81c', 'z85', 'z87'],
    openNeedsFree: ['z89', 'z81'],
    openNeedsSwitches: { aig85a: 'd', aig85b: 'd', aig81a: 'd', aig83a: 'g' },
    derangementKey: 'amni',
  },
  {
    id: 'amnu',
    label: 'AM-NU',
    hint: 'Départ voie M vers voie NU — carré violet 85',
    signal: 'cv85',
    switches: { aig85a: 'd', aig85b: 'd', aig81a: 'd', aig81b: 'd', aig83a: 'd', aig83b: 'd' },
    locks: ['z89', 'z81', 'z81a', 'z81b', 'z83a', 'z83b', 'z84', 'z86'],
    openNeedsFree: ['z89', 'z81', 'z81b', 'z83b', 'z84'],
    openNeedsSwitches: { aig85a: 'd', aig85b: 'd', aig81a: 'd', aig83a: 'd', aig83b: 'd' },
    derangementKey: 'amnu',
  },
  {
    id: 'nuam',
    label: 'NU-AM',
    hint: 'Arrivée NU vers voie M — Cv88 puis carré 84',
    signal: 'c84',
    preSignal: 'cv88',
    switches: { aig85a: 'd', aig85b: 'd', aig81a: 'd', aig81b: 'd', aig83a: 'd', aig83b: 'd' },
    locks: ['z89', 'z81', 'z81a', 'z81b', 'z83a', 'z83b', 'z84', 'z86'],
    openNeedsFree: ['z83b', 'z89', 'z81', 'z81b'],
    openNeedsSwitches: { aig81a: 'd', aig83a: 'd', aig83b: 'd', aig85a: 'd', aig85b: 'd' },
    zap: 'zap84',
    dmtMs: 10_000,
    derangementKey: 'nuam',
  },
  {
    id: 'dgni',
    label: 'DG-N1',
    hint: 'Arrivée DG vers voie 1 — carré violet 83',
    signal: 'cv83',
    switches: { aig81a: 'g', aig81b: 'g', aig83a: 'g', aig83b: 'g' },
    locks: ['z82a', 'z82d', 'z81b', 'z81c', 'z81d', 'z85', 'z87'],
    openNeedsFree: ['z82a', 'z81b', 'z85', 'z87'],
    openNeedsSwitches: { aig81a: 'g', aig81b: 'g', aig83a: 'g' },
    derangementKey: null,
  },
  {
    id: 'nzdgda',
    label: 'N2-DG',
    hint: 'Arrivée N2 vers DG — carré 82',
    signal: 'c82',
    switches: { aig82: 'd', aig81a: 'd', aig81b: 'd' },
    locks: ['z82a', 'z82b', 'z82c', 'z80', 'z88'],
    openNeedsFree: ['z82a'],
    openNeedsSwitches: { aig81b: 'd', aig82: 'd' },
    zap: 'zap82',
    dmtMs: 30_000,
    derangementKey: 'nzdg',
  },
  {
    id: 'nzdgtp',
    label: 'N2-DG',
    sub: 'TP',
    hint: 'Arrivée N2 vers DG — tracé permanent',
    signal: 'c82',
    switches: { aig82: 'd', aig81a: 'd', aig81b: 'd' },
    locks: ['z82a', 'z82b', 'z82c', 'z80', 'z88'],
    openNeedsFree: ['z82a'],
    openNeedsSwitches: { aig81b: 'd', aig82: 'd' },
    tpOf: 'nzdgda',
    zap: 'zap82',
    derangementKey: 'nzdg',
  },
  {
    id: 'nudgvi',
    label: 'NU-DG',
    sub: 'V1',
    hint: 'Arrivée NU vers DG par voie 1 — carré 84',
    signal: 'c84',
    switches: { aig81a: 'g', aig81b: 'g', aig83a: 'd', aig83b: 'd' },
    locks: ['z80', 'z81b', 'z81d', 'z82a', 'z82d', 'z83a', 'z83b', 'z84', 'z86'],
    openNeedsFree: ['z83b'],
    openNeedsSwitches: { aig81a: 'g', aig81b: 'g', aig83a: 'd', aig83b: 'd' },
    zap: 'zap84',
    dmtMs: 15_000,
    derangementKey: 'nudgvi',
  },
  {
    id: 'nudgvz',
    label: 'NU-DG',
    sub: 'V2',
    hint: 'Arrivée NU vers DG par voie 2 — carré 84',
    signal: 'c84',
    switches: { aig81a: 'd', aig81b: 'd', aig82: 'g', aig83a: 'g', aig83b: 'g' },
    locks: ['z80', 'z82a', 'z82b', 'z82e', 'z83b', 'z84', 'z86'],
    openNeedsFree: ['z83b'],
    openNeedsSwitches: { aig81b: 'd', aig83b: 'g', aig82: 'g' },
    zap: 'zap84',
    dmtMs: 15_000,
    derangementKey: 'nudgvz',
    transitAlsoNeedsGroup: 'g82',
  },
  {
    id: 'aum',
    label: 'Au.M',
    hint: "Autorisation d'accès à la voie M (EP MOE) — pas de signal",
    signal: null,
    switches: { aig85a: 'g', aig85b: 'g' },
    locks: ['z89'],
    openNeedsFree: [],
    openNeedsSwitches: {},
    derangementKey: null,
  },
];

export const ROUTE_BY_ID: Record<RouteId, RouteDef> = Object.fromEntries(
  ROUTES.map((r) => [r.id, r]),
) as Record<RouteId, RouteDef>;

export const ROUTE_IDS: RouteId[] = ROUTES.map((r) => r.id);

/** Libellé complet d'un itinéraire, qualificatif compris. */
export function routeFullLabel(r: RouteDef): string {
  return r.sub ? `${r.label} ${r.sub}` : r.label;
}

/**
 * Disposition du pupitre : grille 5 × 3, telle que dessinée sur la maquette.
 * `null` = alvéole vide (le poste n'a pas de bouton à cet emplacement).
 */
export const PUPITRE_GRID: (RouteId | null)[] = [
  'amni', 'amnu', 'aum', null, 'nuam',
  'agnida', 'agnitp', 'agnu', 'nudgvi', 'nudgvz',
  'dgni', null, null, 'nzdgda', 'nzdgtp',
];

/**
 * Incompatibilités entre itinéraires : deux itinéraires s'opposent dès qu'ils
 * verrouillent une zone commune ou exigent des positions d'aiguille
 * contradictoires. C'est ce que testent les longues conditions de refus
 * (`bX = 3`) du code d'origine, exprimé ici de façon dérivée.
 */
/**
 * Itinéraires dont les transits se **substituent** au lieu de s'exclure.
 *
 * `ffagnida()` pose `agnida=1` puis efface `amni=0` ; `ffamni()` fait
 * l'inverse. Ces couples partagent destination et zones avales, seule
 * l'origine diffère : former l'un chasse le transit attardé de l'autre plutôt
 * que de se faire refuser. Sans cette table, le port enregistrerait
 * l'itinéraire au lieu de le former.
 */
export const TRANSIT_SUBSTITUTES: Partial<Record<RouteId, RouteId[]>> = {
  agnida: ['amni'],
  agnitp: ['amni'],
  amni: ['agnida', 'agnitp'],
  agnu: ['amnu'],
  amnu: ['agnu'],
};

export function routesConflict(a: RouteDef, b: RouteDef): boolean {
  if (a.id === b.id) return false;
  // Les deux variantes d'un même itinéraire (simple / TP) ne s'opposent pas :
  // elles se remplacent l'une l'autre.
  if (a.tpOf === b.id || b.tpOf === a.id) return false;
  if (TRANSIT_SUBSTITUTES[a.id]?.includes(b.id)) return false;

  for (const z of a.locks) {
    if (b.locks.includes(z)) return true;
  }
  for (const [aig, pos] of Object.entries(a.switches) as [AigId, AigPos][]) {
    const other = b.switches[aig];
    if (other && other !== pos) return true;
  }
  return false;
}

/**
 * Une entrée de la liste de rejeu des **commandes enregistrées**.
 * Cf. la queue de chaque `dX()` de `gaestro.js` :
 *
 * ```js
 * if (bagnu==3) {bagnu=0; fagnu();}          // rejeu d'une commande enregistrée
 * if (bagnitp==5) {bagnitp=0; fagnitp();}    // idem, variante T.P.
 * ```
 */
export interface ReplayEntry {
  id: RouteId;
  /** Rejoué depuis l'état 5 seulement (T.P.), pas depuis 3. */
  only5?: boolean;
  /**
   * Rejoué aussi depuis l'état **1** — `if ((bnudgvi==3)||(bnudgvi==1))`.
   * Ce n'est plus un rejeu de commande en attente mais une **reformation** :
   * l'itinéraire est déjà établi, et la destruction de celui-ci vient de
   * libérer les aiguilles qu'il n'avait pas pu prendre. La rejouer ramène ses
   * aiguilles et rouvre son signal.
   */
  alsoFrom1?: boolean;
  /** Rejeu inhibé tant que cet itinéraire est établi. */
  unless?: RouteId;
}

/**
 * Ordre de rejeu des commandes enregistrées à la destruction de chaque
 * itinéraire — transcrit **littéralement** depuis les `dX()` d'origine, y
 * compris l'ordre, qui fixe la priorité quand plusieurs commandes attendent.
 *
 * Les entrées `bX == 1` des listes originales (réexécution d'un `fX()` sur un
 * itinéraire encore établi, pour rouvrir son signal) ne sont pas reprises :
 * `recomputeSignals()` les couvre déjà, de façon idempotente.
 */
export const REPLAY_ON_DESTROY: Record<RouteId, ReplayEntry[]> = {
  // daum()
  aum: [
    { id: 'amnu' }, { id: 'nuam' }, { id: 'amni' },
    { id: 'agnitp' }, { id: 'nzdgtp' },
  ],
  // dagnida() — le T.P. AG-N1 n'est rejoué que depuis 5 : un 3 signifierait
  // qu'il attend derrière son propre D.A., ce que la bascule T.P. gère.
  agnida: [
    { id: 'agnu' }, { id: 'dgni' }, { id: 'amni' }, { id: 'nudgvi' },
    { id: 'amnu' }, { id: 'nuam' },
    { id: 'agnitp', only5: true },
    { id: 'nzdgtp', only5: true, unless: 'nzdgda' },
  ],
  // dagnitp()
  agnitp: [
    { id: 'agnu' }, { id: 'dgni' }, { id: 'amni' }, { id: 'nudgvi' },
    { id: 'amnu' }, { id: 'nuam' },
  ],
  // dagnu()
  agnu: [
    { id: 'agnida' }, { id: 'nudgvi', alsoFrom1: true }, { id: 'nuam' }, { id: 'amnu' },
    { id: 'nudgvz' }, { id: 'amni' }, { id: 'dgni' },
    { id: 'agnitp' }, { id: 'nzdgtp' },
  ],
  // damni()
  amni: [
    { id: 'aum' }, { id: 'agnida' }, { id: 'dgni' }, { id: 'amnu' },
    { id: 'nuam' }, { id: 'nudgvi' }, { id: 'agnu' },
    { id: 'agnitp' }, { id: 'nzdgtp' },
  ],
  // damnu()
  amnu: [
    { id: 'aum' }, { id: 'nuam' }, { id: 'agnu' }, { id: 'amni' },
    { id: 'nudgvi' }, { id: 'nudgvz' }, { id: 'agnida' }, { id: 'dgni' },
    { id: 'agnitp' }, { id: 'nzdgtp' },
  ],
  // dnuam()
  nuam: [
    { id: 'aum' }, { id: 'amnu' }, { id: 'agnu' }, { id: 'amni' },
    { id: 'nudgvi' }, { id: 'nudgvz' }, { id: 'agnida' }, { id: 'dgni' },
    { id: 'agnitp' }, { id: 'nzdgtp' },
  ],
  // ddgni()
  dgni: [
    { id: 'agnida' }, { id: 'nudgvi' }, { id: 'nzdgda' }, { id: 'amnu' },
    { id: 'nuam' }, { id: 'amni' }, { id: 'agnu' }, { id: 'nudgvz' },
    { id: 'agnitp' }, { id: 'nzdgtp' },
  ],
  // dnzdgda()
  nzdgda: [
    { id: 'dgni' }, { id: 'nudgvz' }, { id: 'nudgvi' },
    { id: 'nzdgtp', only5: true },
    { id: 'agnitp' },
  ],
  // dnzdgtp()
  nzdgtp: [{ id: 'dgni' }, { id: 'nudgvz' }, { id: 'nudgvi' }],
  // dnudgvi()
  nudgvi: [
    { id: 'agnu' }, { id: 'dgni', alsoFrom1: true }, { id: 'nzdgda' }, { id: 'amni' },
    { id: 'amnu' }, { id: 'nuam' }, { id: 'agnida' }, { id: 'nudgvz' },
    { id: 'agnitp' }, { id: 'nzdgtp' },
  ],
  // dnudgvz()
  nudgvz: [
    { id: 'nzdgda' }, { id: 'dgni' }, { id: 'agnu' }, { id: 'nudgvi' },
    { id: 'amnu' }, { id: 'nuam' },
    { id: 'agnitp' }, { id: 'nzdgtp' },
  ],
};

/**
 * Zones « de parcours » dont l'occupation **maintient l'itinéraire établi**
 * malgré la commande de destruction. Transcrit la condition qui garde le
 * `X = 0` de chaque `dX()` — par exemple `dagnu()` :
 *
 * ```js
 * if (((z83b!=2)&&(z81!=2)&&(z81b!=2))||(bannul2==1)) {agnu=0; ped81=0; amnu=0;}
 * ```
 *
 * Toutes ces conditions ont la même forme : un « ET » de zones libres, chaque
 * zone pouvant être libérée par son annulateur de transit (`ATR_SCOPE` :
 * z89 → ATR 1, z81/z81b/z83b → ATR 2, z82a → ATR 3). Les zones d'approche
 * (`z79`, `z88`) et les zones d'aval partagées (`z85`, `z87`, `z84`, `z86`,
 * `z80`) n'en font pas partie : elles ont leurs propres conditions de
 * libération, portées par `heldByOther()`.
 *
 * `aum` n'en a aucune : `daum()` libère sans condition.
 */
/**
 * Ordre de libération des zones à la destruction, **dans le sens de la
 * marche**, tel que l'écrivent les `dX()`.
 *
 * Chaque entrée est un cran : les zones d'un même cran tombent ensemble, un
 * circuit et ses tronçons d'affichage. L'ordre compte, parce que la libération
 * est une **cascade** — un cran ne se rend que si tous les crans de parcours
 * qui le précèdent sont libres, ou que leur annulateur est actionné :
 *
 * ```js
 * // damni()
 * if ((z89!=2) && …)                                 {z89=0;}
 * if ((z81!=2) && ((bannul1==1)||(z89!=2)))          {z81=0;}
 * if ((z81b!=2) && ((bannul2==1)||(z81!=2))
 *                && ((bannul1==1)||(z89!=2)))        {z81b=0;z81c=0;z81a=0;}
 * ```
 *
 * Les crans **avant** les zones de parcours (approche : z79, z88, z80 côté
 * origine) se rendent sans attendre le transit ; ceux **après** exigent qu'il
 * soit tombé. C'est la position dans la liste qui tranche.
 *
 * L'itinéraire NU-AM descend la liste à l'envers des autres : il circule de
 * droite à gauche.
 */
export const RELEASE_ORDER: Record<RouteId, ZoneId[][]> = {
  aum: [['z89']],
  agnida: [['z79'], ['z81', 'z81bis'], ['z81a', 'z81b', 'z81c'], ['z85'], ['z87']],
  // `dagnitp()` ne rend pas z81b : le tracé permanent se dégrade en itinéraire
  // simple, qui la garde.
  agnitp: [['z79'], ['z81', 'z81bis'], ['z85'], ['z87']],
  agnu: [['z79'], ['z81', 'z81bis'], ['z81a', 'z81b'], ['z83a', 'z83b'], ['z84'], ['z86']],
  amni: [['z89'], ['z81'], ['z81a', 'z81b', 'z81c'], ['z85'], ['z87']],
  amnu: [['z89'], ['z81'], ['z81a', 'z81b'], ['z83a', 'z83b'], ['z84'], ['z86']],
  nuam: [['z86'], ['z84'], ['z83a', 'z83b'], ['z81a', 'z81b'], ['z81'], ['z89']],
  dgni: [['z82a', 'z82d'], ['z81b', 'z81c', 'z81d'], ['z85'], ['z87']],
  nzdgda: [['z88'], ['z82a', 'z82b', 'z82c'], ['z80']],
  nzdgtp: [['z88'], ['z82a', 'z82b', 'z82c'], ['z80']],
  nudgvi: [['z86'], ['z84'], ['z83a', 'z83b'], ['z81b', 'z81d'], ['z82a', 'z82d'], ['z80']],
  nudgvz: [['z86'], ['z84'], ['z83a', 'z83b'], ['z82a', 'z82b', 'z82e'], ['z80']],
};

/**
 * Transits qui **retiennent** une zone au moment de la rendre.
 *
 * Les `dX()` n'appliquent pas de règle générale du type « encore tenue par un
 * autre itinéraire » : chaque zone porte une liste **nommée**, et beaucoup
 * n'en portent aucune.
 *
 * ```js
 * // dagnu()  — les zones de parcours ne craignent que NU-AM
 * if ((z81!=2)&&(nuam!=1))                                   {z81=0;}
 * // dagnida() — z85 en craint deux, mais pas DG-N1 qui la verrouille pourtant
 * if ((z85!=2)&&(agnida==0)&&(amni==0)&&(agnitp==0))         {z85=0;}
 * ```
 *
 * L'omission de DG-N1 dans la seconde n'est pas une erreur de relevé : le
 * source est ainsi. Une règle générique serait plus stricte que le poste, et
 * empêcherait notamment la reformation du § 4.3.
 *
 * Le transit **de l'itinéraire détruit** n'y figure pas : il est traité par la
 * position du cran dans `RELEASE_ORDER` — les zones d'aval attendent qu'il
 * tombe.
 */
export const RELEASE_BLOCKERS: Record<RouteId, Partial<Record<ZoneId, RouteId[]>>> = {
  aum: {},
  agnida: { z85: ['amni', 'agnitp'], z87: ['amni', 'agnitp'] },
  agnitp: { z85: ['agnida', 'amni'], z87: ['agnida', 'amni'] },
  agnu: {
    z81: ['nuam'], z81bis: ['nuam'], z81a: ['nuam'], z81b: ['nuam'],
    z83a: ['nuam'], z83b: ['nuam'],
    z84: ['amnu'], z86: ['amnu'],
  },
  // `damni()` seule tolère l'annulateur 1 contre NU-AM : `(nuam!=1)||(bannul1==1)`.
  // L'autorisation Au.M, elle, retient sans recours.
  amni: { z89: ['nuam', 'aum'], z85: ['agnida', 'agnitp'], z87: ['agnida', 'agnitp'] },
  amnu: {
    z89: ['nuam', 'aum'],
    z81: ['nuam'], z81a: ['nuam'], z81b: ['nuam'], z83a: ['nuam'], z83b: ['nuam'],
    z84: ['agnu'], z86: ['agnu'],
  },
  nuam: {
    z86: ['agnu', 'amnu'], z84: ['agnu', 'amnu'],
    z83a: ['agnu', 'amnu'], z83b: ['agnu', 'amnu'],
    z81a: ['amnu', 'amni'], z81b: ['amnu', 'amni'],
    z81: ['amnu', 'amni'], z89: ['amnu', 'amni'],
  },
  dgni: {
    z85: ['agnida', 'amni', 'agnitp'],
    z87: ['agnida', 'amni', 'agnitp'],
  },
  nzdgda: {},
  nzdgtp: {},
  nudgvi: {
    z86: ['agnu', 'amnu'], z84: ['agnu', 'amnu'],
    z81b: ['dgni'], z81d: ['dgni'], z82a: ['dgni'], z82d: ['dgni'],
  },
  nudgvz: {
    z86: ['agnu', 'amnu'], z84: ['agnu', 'amnu'],
    z83a: ['agnu', 'amnu'], z83b: ['agnu', 'amnu'],
  },
};

export const CORE_LOCKS: Record<RouteId, ZoneId[]> = {
  agnida: ['z81', 'z81b'],
  agnitp: ['z81', 'z81b'],
  agnu: ['z81', 'z81b', 'z83b'],
  amni: ['z89', 'z81', 'z81b'],
  amnu: ['z89', 'z81', 'z81b', 'z83b'],
  nuam: ['z89', 'z81', 'z81b', 'z83b'],
  dgni: ['z81b', 'z82a'],
  nzdgda: ['z82a'],
  nzdgtp: ['z82a'],
  nudgvi: ['z81b', 'z83b', 'z82a'],
  nudgvz: ['z83b', 'z82a'],
  aum: [],
};
