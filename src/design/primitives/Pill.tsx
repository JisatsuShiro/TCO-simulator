// Étiquette d'état (Pill) — badge compact pour signaler une avarie,
// un état d'avertissement, une info ou un succès.
//
// 5 variantes de couleur : neutral, info, warning, danger, success.
// État `active` : pill remplie de la couleur du variant. Sinon contour
// discret + texte coloré (bordure transparente sur le neutral).
//
// Cliquable optionnel via `onClick`. Hover géré localement (pas de :hover
// inline).

import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { colors, radii, typography } from '../tokens';

export type PillVariant = 'neutral' | 'info' | 'warning' | 'danger' | 'success';

interface Props {
  variant?: PillVariant;
  active?: boolean;
  size?: 'sm' | 'md';
  onClick?: () => void;
  title?: string;
  children: ReactNode;
}

interface Palette {
  /** Couleur dominante du variant (texte + bordure quand inactif). */
  base: string;
  /** Couleur de fond quand actif. */
  fill: string;
  /** Couleur du texte quand actif. */
  fillText: string;
  /** Bordure quand inactif. */
  border: string;
  /** Fond hover quand inactif. */
  hover: string;
}

const palettes: Record<PillVariant, Palette> = {
  neutral: {
    base: colors.text.secondary,
    fill: colors.surface.light,
    fillText: colors.text.primary,
    border: colors.border.default,
    hover: colors.surface.medium,
  },
  info: {
    base: colors.accent.primary,
    fill: colors.accent.primary,
    fillText: '#FFFFFF',
    border: 'rgba(91, 155, 255, 0.4)',
    hover: 'rgba(91, 155, 255, 0.12)',
  },
  warning: {
    base: colors.accent.warning,
    fill: colors.accent.warning,
    fillText: '#1F1605',
    border: 'rgba(245, 158, 11, 0.4)',
    hover: 'rgba(245, 158, 11, 0.12)',
  },
  danger: {
    base: colors.accent.danger,
    fill: colors.accent.danger,
    fillText: '#FFFFFF',
    border: 'rgba(220, 38, 38, 0.4)',
    hover: 'rgba(220, 38, 38, 0.12)',
  },
  success: {
    base: colors.accent.success,
    fill: colors.accent.success,
    fillText: '#0F1419',
    border: 'rgba(34, 197, 94, 0.4)',
    hover: 'rgba(34, 197, 94, 0.12)',
  },
};

export function Pill({
  variant = 'neutral',
  active = false,
  size = 'sm',
  onClick,
  title,
  children,
}: Props) {
  const [hover, setHover] = useState(false);
  const p = palettes[variant];
  const clickable = onClick != null;

  const padY = size === 'sm' ? 2 : 4;
  const padX = size === 'sm' ? 8 : 10;
  const fontSize = size === 'sm' ? typography.size.xs : typography.size.sm;

  const baseBg = active ? p.fill : 'transparent';
  const baseFg = active ? p.fillText : p.base;
  const baseBorder = active ? p.fill : p.border;

  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: `${padY}px ${padX}px`,
    background: clickable && hover && !active ? p.hover : baseBg,
    color: baseFg,
    border: `1px solid ${baseBorder}`,
    borderRadius: radii.pill,
    fontFamily: typography.ui.family,
    fontSize,
    fontWeight: typography.weight.medium,
    cursor: clickable ? 'pointer' : 'default',
    transition: 'background 120ms ease, color 120ms ease, border-color 120ms ease',
    whiteSpace: 'nowrap',
  };

  if (clickable) {
    return (
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title={title}
        aria-pressed={active}
        style={style}
      >
        {children}
      </button>
    );
  }

  return (
    <span title={title} style={style}>
      {children}
    </span>
  );
}
