// Palette mobile (thème sombre) — socle commun de la vue mobile gessieWeb.
// Portée depuis la maquette « gessieWeb Mobile V1 (Bandeau, approfondie) ».
// Les valeurs (oklch + hex) sont reprises telles quelles de la maquette ;
// `mono`/`sans` réutilisent les polices déjà auto-hostées par le projet
// (cf. `@fontsource/inter` + `@fontsource/ibm-plex-mono` dans main.tsx).
export const M = {
  bg: '#06090c',
  panel: '#0d141a',
  panel2: '#121b22',
  panel3: '#18232b',
  border: '#1f2b34',
  borderSoft: '#16202733',
  text: '#e2e9ee',
  muted: '#8c99a4',
  faint: '#5b6770',
  dim: '#3a444d',
  accent: 'oklch(0.72 0.13 250)',
  accentDim: 'oklch(0.40 0.08 250)',
  amber: 'oklch(0.80 0.16 80)',
  brand: 'oklch(0.70 0.16 35)',
  green: 'oklch(0.72 0.16 145)',
  red: 'oklch(0.64 0.21 25)',
  yellow: 'oklch(0.82 0.17 85)',
  mono: "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace",
  sans: "'Inter', system-ui, -apple-system, sans-serif",
} as const;
