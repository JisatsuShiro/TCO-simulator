// Bouton standard de l'UI Voie Libre.
//
// Quatre variantes (cf. spec UX section "Hiérarchie des boutons") :
//   - primary       : action engageante, max 1 par panel (Lancer simulation,
//                     Lancer un train). Rempli accent.primary.
//   - default       : action neutre (Test C211, Reddition, Voie libre, Annonce).
//                     surface.light + border.default.
//   - ghost         : action secondaire dans un panel encombré. Transparent
//                     + border.subtle.
//   - ghost-danger  : action de réversion (Annuler ATR, Stop simulation).
//                     Transparent + border accent.danger ; texte accent.danger.
//
// Pas de :hover en CSS inline → on simule via onMouseEnter/Leave + state local.
// Hauteur ≥ 32 px (cible cliquable WCAG).

import { useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { colors, radii, spacing, typography } from '../tokens';

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'ghost-danger';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  children: ReactNode;
}

interface Palette {
  bg: string;
  bgHover: string;
  border: string;
  borderHover: string;
  fg: string;
  fgHover: string;
}

const palettes: Record<ButtonVariant, Palette> = {
  primary: {
    bg: colors.accent.primary,
    bgHover: '#7AB0FF',
    border: colors.accent.primary,
    borderHover: '#7AB0FF',
    fg: '#FFFFFF',
    fgHover: '#FFFFFF',
  },
  default: {
    bg: colors.surface.light,
    bgHover: '#3A4458',
    border: colors.border.default,
    borderHover: colors.border.strong,
    fg: colors.text.primary,
    fgHover: colors.text.primary,
  },
  ghost: {
    bg: 'transparent',
    bgHover: colors.surface.light,
    border: colors.border.subtle,
    borderHover: colors.border.default,
    fg: colors.text.secondary,
    fgHover: colors.text.primary,
  },
  'ghost-danger': {
    bg: 'transparent',
    bgHover: 'rgba(220, 38, 38, 0.12)',
    border: colors.accent.danger,
    borderHover: colors.accent.danger,
    fg: colors.accent.danger,
    fgHover: '#F87171',
  },
};

export function Button({
  variant = 'default',
  size = 'md',
  children,
  disabled,
  ...rest
}: Props) {
  const [hover, setHover] = useState(false);
  const p = palettes[variant];

  const padY = size === 'sm' ? 4 : 6;
  const padX = size === 'sm' ? spacing.sm : spacing.md;
  const fontSize = size === 'sm' ? typography.size.xs : typography.size.sm;
  const minHeight = size === 'sm' ? 26 : 32;

  return (
    <button
      {...rest}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight,
        padding: `${padY}px ${padX}px`,
        background: disabled ? colors.surface.medium : hover ? p.bgHover : p.bg,
        color: disabled ? colors.text.muted : hover ? p.fgHover : p.fg,
        border: `1px solid ${disabled ? colors.border.subtle : hover ? p.borderHover : p.border}`,
        borderRadius: radii.md,
        fontFamily: typography.ui.family,
        fontSize,
        fontWeight: typography.weight.medium,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'background 120ms ease, border-color 120ms ease, color 120ms ease',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}
