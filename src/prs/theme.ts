// Palette et primitives visuelles du poste PRS.
//
// Reprise de la maquette Claude Design « PRS TCO — Voie Libre »
// (projet `Redesign prs.png avec gessie.png`). Ces valeurs sont volontairement
// locales au module PRS : elles sont proches de `src/design/tokens.ts` mais
// pas identiques, et on ne veut pas déplacer la charte du reste de l'app.

export const prs = {
  // — Surfaces
  bg: 'var(--prs-bg)',
  header: 'var(--prs-header)',
  panel: 'var(--prs-panel)',
  /**
   * Le panneau du TCO, distinct des autres.
   *
   * En sombre les deux se confondent ; en clair le TCO retrouve son ivoire,
   * un peu plus chaud que les panneaux qui l'entourent — le poste d'origine
   * portait des voies sombres sur ivoire, c'est le portage qui avait inversé.
   */
  tco: 'var(--prs-tco)',
  /** Fond des champs, chips et encarts. */
  inset: 'var(--prs-inset)',
  /** Fond des boutons neutres. */
  button: 'var(--prs-button)',
  buttonHover: 'var(--prs-button-hover)',
  /** Fond d'un coupon d'annulateur. */
  ticket: 'var(--prs-ticket)',
  /** Intérieur des cartouches sombres (mini-schéma). */
  well: 'var(--prs-well)',
  /**
   * Secteur d'aiguille sur le TCO. Sur le poste d'origine c'est une forme
   * **claire** posée sur le fond, qui porte les deux lampes de position ; il
   * doit donc trancher sur le panneau, pas s'y fondre.
   */
  switchFill: 'var(--prs-switch-fill)',
  /**
   * Lampes de position d'aiguille. Comme sur le poste réel, les deux sont
   * vertes : c'est la lampe **allumée** qui désigne la position tenue, pas sa
   * couleur. Éteintes, elles restent vertes et sombres — une lampe au repos,
   * pas un voyant absent.
   */
  switchLampOn: 'var(--prs-switch-lamp-on)',
  switchLampOff: 'var(--prs-switch-lamp-off)',
  switchLampBezel: 'var(--prs-switch-lamp-bezel)',

  // — Traits du TCO
  line: 'var(--prs-line)',
  endpointStroke: 'var(--prs-endpoint-stroke)',

  // — Texte
  text: 'var(--prs-text)',
  textDim: 'var(--prs-text-dim)',
  textMuted: 'var(--prs-text-muted)',
  textFaint: 'var(--prs-text-faint)',
  /** Libellés d'aiguille et de voyant sur le TCO. */
  label: 'var(--prs-label)',
  labelSoft: 'var(--prs-label-soft)',

  // — Accents
  amber: 'var(--prs-amber)',
  amberSoft: 'var(--prs-amber-soft)',
  amberBg: 'var(--prs-amber-bg)',
  green: 'var(--prs-green)',
  red: 'var(--prs-red)',
  redSoft: 'var(--prs-red-soft)',
  blue: 'var(--prs-blue)',
  blueBg: 'var(--prs-blue-bg)',
  blueText: 'var(--prs-blue-text)',

  // — Bordures
  border: 'var(--prs-border)',
  borderSoft: 'var(--prs-border-soft)',
  borderMid: 'var(--prs-border-mid)',
  borderStrong: 'var(--prs-border-strong)',
  borderBlue: 'var(--prs-border-blue)',
  borderAmber: 'var(--prs-border-amber)',
  borderRed: 'var(--prs-border-red)',

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
  0: 'var(--prs-zone-libre)',
  1: 'var(--prs-zone-tracee)',
  2: 'var(--prs-zone-occupee)',
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
      bg: 'var(--prs-lamp-da-rest-bg)',
      border: 'var(--prs-lamp-da-rest-border)',
      fg: 'var(--prs-lamp-da-rest-fg)',
      glow: 'none',
    },
    lit: {
      bg: 'var(--prs-lamp-da-lit-bg)',
      border: 'var(--prs-lamp-da-lit-border)',
      fg: 'var(--prs-lamp-da-lit-fg)',
      glow: 'var(--prs-lamp-da-lit-glow)',
    },
  },
  tp: {
    rest: {
      bg: 'var(--prs-lamp-tp-rest-bg)',
      border: 'var(--prs-lamp-tp-rest-border)',
      fg: 'var(--prs-lamp-tp-rest-fg)',
      glow: 'none',
    },
    lit: {
      bg: 'var(--prs-lamp-tp-lit-bg)',
      border: 'var(--prs-lamp-tp-lit-border)',
      fg: 'var(--prs-lamp-tp-lit-fg)',
      glow: 'var(--prs-lamp-tp-lit-glow)',
    },
  },
} as const;

export const ZONE_STATE_LABEL = {
  0: 'Libre',
  1: 'Itinéraire tracé',
  2: 'Occupée',
} as const;
