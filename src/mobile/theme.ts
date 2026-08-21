// Palette mobile — socle commun de la vue mobile gessieWeb.
// Portée depuis la maquette « gessieWeb Mobile V1 (Bandeau, approfondie) ».
//
// Les couleurs sont des renvois vers les variables CSS de
// `../design/theme.css`, où la palette existe en clair et en sombre : la vue
// mobile suit le thème comme le reste de l'application. Les valeurs sombres
// sont celles de la maquette, au chiffre près.
//
// `mono`/`sans` réutilisent les polices déjà auto-hostées par le projet
// (cf. `@fontsource/inter` + `@fontsource/ibm-plex-mono` dans main.tsx).
export const M = {
  bg: 'var(--m-bg)',
  panel: 'var(--m-panel)',
  panel2: 'var(--m-panel2)',
  panel3: 'var(--m-panel3)',
  border: 'var(--m-border)',
  borderSoft: 'var(--m-border-soft)',
  text: 'var(--m-text)',
  muted: 'var(--m-muted)',
  faint: 'var(--m-faint)',
  dim: 'var(--m-dim)',
  accent: 'var(--m-accent)',
  accentDim: 'var(--m-accent-dim)',
  amber: 'var(--m-amber)',
  brand: 'var(--m-brand)',
  green: 'var(--m-green)',
  red: 'var(--m-red)',
  yellow: 'var(--m-yellow)',
  mono: "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace",
  sans: "'Inter', system-ui, -apple-system, sans-serif",
} as const;
