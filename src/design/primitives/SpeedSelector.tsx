// Sélecteur de vitesse — segmented control horizontal.
//
// Vitesses standard Gessie : 0 (pause), 1, 2, 5, 10. Le segment actif est
// surligné avec `accent.primary` ; les autres restent neutres.
//
// L'utilisateur clique directement sur le segment voulu (pas de menu déroulant).

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { colors, radii, typography } from '../tokens';

const DEFAULT_SPEEDS = [0, 1, 2, 5, 10];

interface Props {
  speed: number;
  onChange: (speed: number) => void;
  /** Override de la liste de vitesses si besoin. Défaut : [0,1,2,5,10]. */
  speeds?: number[];
}

export function SpeedSelector({ speed, onChange, speeds = DEFAULT_SPEEDS }: Props) {
  const wrapperStyle: CSSProperties = {
    display: 'inline-flex',
    background: colors.surface.darkest,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radii.md,
    padding: 2,
    gap: 2,
  };

  return (
    <div style={wrapperStyle} role="radiogroup" aria-label="Vitesse de simulation">
      {speeds.map((s) => (
        <SpeedSegment key={s} value={s} active={s === speed} onClick={() => onChange(s)} />
      ))}
    </div>
  );
}

function SpeedSegment({
  value,
  active,
  onClick,
}: {
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const label = value === 0 ? '⏸' : `×${value}`;

  const style: CSSProperties = {
    minWidth: 32,
    minHeight: 26,
    padding: '2px 8px',
    background: active
      ? colors.accent.primary
      : hover
        ? colors.surface.light
        : 'transparent',
    color: active ? '#FFFFFF' : colors.text.secondary,
    border: 'none',
    borderRadius: radii.sm,
    fontFamily: typography.ui.family,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    cursor: 'pointer',
    transition: 'background 120ms ease, color 120ms ease',
  };

  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={value === 0 ? 'Pause' : `Vitesse fois ${value}`}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={style}
    >
      {label}
    </button>
  );
}
