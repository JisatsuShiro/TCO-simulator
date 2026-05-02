// Plaque laiton numérotée — représente une clé physique tenue en main
// ou attachée à une boîte à clés.
//
// Visuel : rectangle arrondi en gradient laiton, anneau au bord supérieur,
// numéro centré en mono. Pas d'animation, pas de hover (purement décoratif
// dans la majorité des cas — le `onClick` reste possible si besoin).
//
// Variant `held` (clé en main) : légère élévation visuelle (ombre +
// border accent.warning pour souligner la possession).

import type { CSSProperties, ReactNode } from 'react';
import { typography } from '../tokens';

interface Props {
  label: string;
  /** Clé tenue en main → mise en valeur visuelle. */
  held?: boolean;
  onClick?: () => void;
  /** Slot avant le numéro (ex. icône). */
  prefix?: ReactNode;
}

export function KeyTag({ label, held = false, onClick, prefix }: Props) {
  const wrapperStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    minHeight: 24,
    padding: '3px 10px 3px 18px',
    position: 'relative',
    background: 'linear-gradient(180deg, #DCB372 0%, #B8924A 50%, #8E6A2E 100%)',
    color: '#2A1F0E',
    border: held ? '1px solid #F0D89A' : '1px solid #6E4F1E',
    borderRadius: 4,
    fontFamily: typography.mono.family,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    letterSpacing: 0.4,
    cursor: onClick ? 'pointer' : 'default',
    boxShadow: held
      ? '0 2px 6px rgba(220, 170, 80, 0.35), inset 0 1px 0 rgba(255, 230, 170, 0.5)'
      : 'inset 0 1px 0 rgba(255, 230, 170, 0.4), 0 1px 2px rgba(0,0,0,0.4)',
    textShadow: '0 1px 0 rgba(255, 230, 170, 0.4)',
  };

  // Trou d'anneau dessiné en pseudo via inset shadow + border-radius circulaire
  // sur un span absolu en début de plaque.
  const ringStyle: CSSProperties = {
    position: 'absolute',
    left: 4,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#0A0E13',
    boxShadow: 'inset 0 1px 1px rgba(255, 230, 170, 0.4)',
  };

  return (
    <span
      role={onClick ? 'button' : undefined}
      onClick={onClick}
      style={wrapperStyle}
      aria-label={`Clé ${label}${held ? ' (en main)' : ''}`}
    >
      <span style={ringStyle} aria-hidden />
      {prefix}
      <span>{label}</span>
    </span>
  );
}
