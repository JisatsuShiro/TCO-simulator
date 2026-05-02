// Design tokens — référence d'implémentation pour `src/design/primitives/*`
// et tous les composants UI. Voir `_bmad-output/planning-artifacts/ux-design-specification.md`
// (sections "Fondation visuelle" et "Stratégie de composants").
//
// Convention : valeurs littérales avec `as const` pour bénéficier d'un typage
// strict et d'inférences précises côté consommateurs.

export const colors = {
  surface: {
    darkest: '#0F1419',
    dark: '#161B22',
    medium: '#1E2530',
    light: '#2A3343',
  },
  text: {
    primary: '#E6E8EC',
    secondary: '#9CA3AF',
    muted: '#6B7280',
  },
  border: {
    subtle: '#2A3343',
    default: '#3A4458',
    strong: '#4F5B73',
  },
  metal: {
    base: '#4B5460',
    highlight: '#6E7787',
    shadow: '#2A3038',
    deep: '#3F4854',
    knob: '#B4BCC9',
    knobShine: '#E1E5EC',
  },
  signal: {
    rouge: '#E11D26',
    jaune: '#EAB308',
    vert: '#22C55E',
    blanc: '#F3F4F6',
    violet: '#8B5CF6',
    zoneOccupee: '#DC2626',
    zoneVerrouillee: '#EAB308',
    zoneAnnulee: '#6B7280',
  },
  accent: {
    primary: '#5B9BFF',
    success: '#22C55E',
    warning: '#F59E0B',
    danger: '#DC2626',
    signalPN: '#5B9BFF',
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
  sm: '0 1px 2px rgba(0,0,0,0.2)',
  md: '0 4px 12px rgba(0,0,0,0.3)',
  metallicOuter: '0 2px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
  metallicKnob: '0 2px 4px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.4)',
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
