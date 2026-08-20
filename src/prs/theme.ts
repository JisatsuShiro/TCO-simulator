// Palette et primitives visuelles du poste PRS.
//
// Reprise de la maquette Claude Design « PRS TCO — Voie Libre »
// (projet `Redesign prs.png avec gessie.png`). Ces valeurs sont volontairement
// locales au module PRS : elles sont proches de `src/design/tokens.ts` mais
// pas identiques, et on ne veut pas déplacer la charte du reste de l'app.

export const prs = {
  // — Surfaces
  bg: '#0d141d',
  header: '#131c27',
  panel: '#151e29',
  /** Fond des champs, chips et encarts. */
  inset: '#1b2532',
  /** Fond des boutons neutres. */
  button: '#232d3b',
  buttonHover: '#2c3846',
  /** Fond d'un coupon d'annulateur. */
  ticket: '#2a3341',
  /** Intérieur des cartouches sombres (mini-schéma). */
  well: '#101822',
  /**
   * Secteur d'aiguille sur le TCO. Sur le poste d'origine c'est une forme
   * **claire** posée sur le fond, qui porte les deux lampes de position ; il
   * doit donc trancher sur le panneau, pas s'y fondre.
   */
  switchFill: '#38455a',
  /**
   * Lampes de position d'aiguille. Comme sur le poste réel, les deux sont
   * vertes : c'est la lampe **allumée** qui désigne la position tenue, pas sa
   * couleur. Éteintes, elles restent vertes et sombres — une lampe au repos,
   * pas un voyant absent.
   */
  switchLampOn: '#4fd18b',
  switchLampOff: '#1c4230',
  switchLampBezel: '#0b1119',

  // — Traits du TCO
  line: '#cfd8e3',
  endpointStroke: '#8fa3ba',

  // — Texte
  text: '#e6ebf2',
  textDim: '#cfd8e3',
  textMuted: '#9fb2c8',
  textFaint: '#6f8299',
  /** Libellés d'aiguille et de voyant sur le TCO. */
  label: '#aebdcf',
  labelSoft: '#dfe7f0',

  // — Accents
  amber: '#f0b45a',
  amberSoft: '#f6d9a5',
  amberBg: '#2f3f53',
  green: '#4fd18b',
  red: '#e8503f',
  redSoft: '#f07a68',
  blue: '#8fb8e8',
  blueBg: '#20344f',
  blueText: '#bcd6f2',

  // — Bordures
  border: 'rgba(255,255,255,.08)',
  borderSoft: 'rgba(255,255,255,.06)',
  borderMid: 'rgba(255,255,255,.10)',
  borderStrong: 'rgba(255,255,255,.14)',
  borderBlue: 'rgba(143,184,232,.40)',
  borderAmber: 'rgba(240,180,90,.50)',
  borderRed: 'rgba(232,80,63,.35)',

  radius: { sm: 5, md: 6, lg: 10, pill: 999 },
} as const;

export const prsFont = {
  ui: "'Segoe UI', system-ui, -apple-system, sans-serif",
  mono: 'ui-monospace, Menlo, "IBM Plex Mono", monospace',
} as const;

/**
 * Couleurs d'état de zone, relevées sur les sprites d'origine
 * (`PRS/construc/tco/z82a{0,1,2}.gif`) :
 *
 * | État | Sprite | Couleur |
 * |---|---|---|
 * | 0 — libre | `…0.gif` | vert foncé `#008500` — la voie au repos |
 * | 1 — itinéraire tracé | `…1.gif` | **vert vif `#00FF10`** |
 * | 2 — occupée | `…2.gif` | rouge `#FF0000` |
 *
 * Le tracé s'allume donc en **vert**, pas en ambre. Les teintes sont
 * légèrement tempérées ici pour tenir sur le fond sombre du portage, mais
 * gardent les tons d'origine. L'état « libre » reste clair : le portage
 * dessine une voie claire sur fond sombre, là où l'original dessinait une
 * voie sombre sur panneau ivoire.
 */
export const ZONE_FILL = {
  0: '#e8edf4',
  1: '#2fe053',
  2: '#e8503f',
} as const;

/**
 * Couleurs des boutons d'itinéraire du pupitre.
 *
 * **Destruction automatique** — bouton **bleu** au repos, qui **s'allume en
 * blanc**. Écart assumé avec les sprites d'origine, qui montrent un bouton
 * gris clair `#CECECE` s'allumant en jaune `#FFFF65` : la convention retenue
 * ici est celle du poste réel.
 *
 * **Tracé permanent** — conforme aux sprites : gris sombre `#656565` au repos,
 * **orange** `#FF9900` allumé.
 *
 * Dans les deux cas, le sprite « commande enregistrée » (`…2.gif`) est le même
 * dessin dans un GIF **animé à deux images** : un bouton enregistré ou
 * surenregistré **clignote dans sa couleur allumée**, il n'en change pas.
 */
export const ROUTE_LAMP = {
  da: {
    rest: {
      bg: '#20344f',
      border: 'rgba(143,184,232,.45)',
      fg: '#bcd6f2',
      glow: 'none',
    },
    lit: {
      bg: '#eaf1fa',
      border: '#ffffff',
      fg: '#101b27',
      glow: 'inset 0 0 0 1px rgba(255,255,255,.55)',
    },
  },
  tp: {
    rest: {
      bg: '#232d3b',
      border: 'rgba(255,255,255,.10)',
      fg: '#dfe7f0',
      glow: 'none',
    },
    lit: {
      bg: 'rgba(224,140,30,.16)',
      border: 'rgba(224,140,30,.55)',
      fg: '#f8cf94',
      glow: 'inset 0 0 0 1px rgba(224,140,30,.22)',
    },
  },
} as const;

export const ZONE_STATE_LABEL = {
  0: 'Libre',
  1: 'Itinéraire tracé',
  2: 'Occupée',
} as const;
