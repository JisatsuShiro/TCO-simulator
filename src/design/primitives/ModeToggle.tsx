// Bascule entre mode Édition et mode Simulation.
//
// Segmented control à 2 positions. Visuellement plus engageant qu'un simple
// bouton "Lancer / Arrêter" : Léa voit en permanence dans quel mode elle se
// trouve, et la transition est un clic sur l'autre segment.

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { colors, radii, typography } from '../tokens';

export type Mode = 'edit' | 'play';

interface Props {
  mode: Mode;
  onChange: (mode: Mode) => void;
}

export function ModeToggle({ mode, onChange }: Props) {
  const wrapperStyle: CSSProperties = {
    display: 'inline-flex',
    background: colors.surface.darkest,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radii.md,
    padding: 2,
    gap: 2,
  };

  return (
    <div style={wrapperStyle} role="radiogroup" aria-label="Mode de l'application">
      <Segment
        label="Édition"
        active={mode === 'edit'}
        accent={colors.text.secondary}
        onClick={() => onChange('edit')}
      />
      <Segment
        label="Simulation"
        active={mode === 'play'}
        accent={colors.accent.success}
        onClick={() => onChange('play')}
      />
    </div>
  );
}

function Segment({
  label,
  active,
  accent,
  onClick,
}: {
  label: string;
  active: boolean;
  accent: string;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);

  const style: CSSProperties = {
    minHeight: 28,
    padding: '4px 12px',
    background: active ? accent : hover ? colors.surface.light : 'transparent',
    color: active ? '#0F1419' : colors.text.secondary,
    border: 'none',
    borderRadius: radii.sm,
    fontFamily: typography.ui.family,
    fontSize: typography.size.sm,
    fontWeight: active ? typography.weight.semibold : typography.weight.medium,
    cursor: 'pointer',
    transition: 'background 120ms ease, color 120ms ease',
  };

  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={style}
    >
      {label}
    </button>
  );
}
