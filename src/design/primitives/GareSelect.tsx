// Sélecteur de gare — `<select>` natif stylé sombre.
//
// Pas de dropdown custom (cf. décision spec : pas de form library, pas de
// composant complexe pour ce qui peut être natif). Le rendu sombre cohérent
// avec le reste de l'app suffit ; le menu déroulant est celui de l'OS.

import type { CSSProperties } from 'react';
import { colors, radii, typography } from '../tokens';

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  label?: string;
}

export function GareSelect({ value, onChange, options, label = 'Gare' }: Props) {
  const labelStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    color: colors.text.secondary,
    fontFamily: typography.ui.family,
    fontSize: typography.size.sm,
  };

  const selectStyle: CSSProperties = {
    minHeight: 30,
    padding: '4px 8px',
    background: colors.surface.medium,
    color: colors.text.primary,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radii.md,
    fontFamily: typography.ui.family,
    fontSize: typography.size.sm,
    cursor: 'pointer',
  };

  return (
    <label style={labelStyle}>
      {label} :
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={selectStyle}
        aria-label={`Sélection de ${label.toLowerCase()}`}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
