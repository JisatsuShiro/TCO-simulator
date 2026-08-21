// Design tokens — référence d'implémentation pour `src/design/primitives/*`
// et tous les composants UI. Voir `_bmad-output/planning-artifacts/ux-design-specification.md`
// (sections "Fondation visuelle" et "Stratégie de composants").
//
// Les **couleurs** ne sont plus des littéraux mais des renvois vers les
// variables CSS de `./theme.css`, où la palette existe en deux exemplaires,
// clair et sombre. Tout est peint en styles *inline* dans ce projet : un objet
// JavaScript ne changerait pas de valeur à la bascule, une variable CSS si.
// Les consommateurs n'ont rien à changer — `colors.surface.dark` reste une
// chaîne valide en CSS.
//
// Le reste — espacements, typographie, rayons, mouvement — ne dépend pas du
// thème et garde ses valeurs littérales.

export const colors = {
  surface: {
    darkest: 'var(--vl-surface-darkest)',
    dark: 'var(--vl-surface-dark)',
    medium: 'var(--vl-surface-medium)',
    light: 'var(--vl-surface-light)',
  },
  text: {
    primary: 'var(--vl-text-primary)',
    secondary: 'var(--vl-text-secondary)',
    muted: 'var(--vl-text-muted)',
  },
  border: {
    subtle: 'var(--vl-border-subtle)',
    default: 'var(--vl-border-default)',
    strong: 'var(--vl-border-strong)',
  },
  metal: {
    base: 'var(--vl-metal-base)',
    highlight: 'var(--vl-metal-highlight)',
    shadow: 'var(--vl-metal-shadow)',
    deep: 'var(--vl-metal-deep)',
    knob: 'var(--vl-metal-knob)',
    knobShine: 'var(--vl-metal-knob-shine)',
  },
  signal: {
    rouge: 'var(--vl-signal-rouge)',
    jaune: 'var(--vl-signal-jaune)',
    vert: 'var(--vl-signal-vert)',
    blanc: 'var(--vl-signal-blanc)',
    violet: 'var(--vl-signal-violet)',
    zoneOccupee: 'var(--vl-signal-zone-occupee)',
    zoneVerrouillee: 'var(--vl-signal-zone-verrouillee)',
    zoneAnnulee: 'var(--vl-signal-zone-annulee)',
  },
  accent: {
    primary: 'var(--vl-accent-primary)',
    success: 'var(--vl-accent-success)',
    warning: 'var(--vl-accent-warning)',
    danger: 'var(--vl-accent-danger)',
    signalPN: 'var(--vl-accent-primary)',
  },
} as const;

// Polices auto-hostées via @fontsource (cf. `src/main.tsx`). Les fallbacks
// restent en place pour le flash initial avant que woff2 ne soient parsés.
export const typography = {
  ui: {
    family: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
  mono: {
    family: "'IBM Plex Mono', 'JetBrains Mono', Consolas, ui-monospace, monospace",
  },
  size: {
    xs: 11,
    sm: 12,
    base: 14,
    md: 16,
    lg: 18,
    xl: 22,
  },
  lineHeight: {
    xs: 16,
    sm: 18,
    base: 20,
    md: 24,
    lg: 26,
    xl: 30,
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

export const radii = {
  none: 0,
  sm: 2,
  md: 6,
  lg: 10,
  pill: 999,
} as const;

export const shadows = {
  sm: 'var(--vl-shadow-sm)',
  md: 'var(--vl-shadow-md)',
  metallicOuter: 'var(--vl-shadow-metallic-outer)',
  metallicKnob: 'var(--vl-shadow-metallic-knob)',
} as const;

export const motion = {
  duration: {
    instant: 0,
    fast: 120,
    normal: 240,
    slow: 380,
  },
  easing: {
    linear: 'linear',
    easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
    easeInOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
    bumpStop: 'cubic-bezier(0.7, 0, 0.84, 0)',
  },
} as const;
