// Bascule clair/sombre.
//
// Un seul bouton, pas trois : « clair », « sombre » et « comme le système »
// feraient un sélecteur là où l'on veut un interrupteur. Le troisième état
// existe quand même — c'est celui de départ, tant qu'on n'a rien touché — et
// l'on y revient par un clic long ou un clic droit, ce que l'infobulle dit.
//
// L'icône montre **ce que le clic donnera**, pas l'état courant : en sombre
// c'est un soleil, en clair une lune. C'est la convention la plus répandue, et
// la seule qui se lise sans texte.

import type { CSSProperties } from 'react';
import { useTheme } from '../useTheme';

export interface ThemeToggleProps {
  /** Couleur du tracé ; par défaut celle du texte environnant. */
  color?: string;
  /** Couleur de la bordure. */
  borderColor?: string;
  size?: number;
}

export function ThemeToggle({ color, borderColor, size = 30 }: ThemeToggleProps) {
  const { theme, suitLeSysteme, basculer, suivreLeSysteme } = useTheme();
  const versClair = theme === 'dark';

  const style: CSSProperties = {
    width: size,
    height: size,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    background: 'transparent',
    border: `1px solid ${borderColor ?? 'currentColor'}`,
    color: color ?? 'currentColor',
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
  };

  return (
    <button
      type="button"
      onClick={basculer}
      // Clic droit : on rend la main au système. Le geste est discret, à
      // l'image du réglage — on n'y revient qu'une fois, et rarement.
      onContextMenu={(e) => {
        e.preventDefault();
        suivreLeSysteme();
      }}
      title={
        (versClair ? 'Passer en thème clair' : 'Passer en thème sombre') +
        (suitLeSysteme
          ? ' (actuellement réglé par le système)'
          : ' — clic droit pour suivre à nouveau le système')
      }
      aria-label={versClair ? 'Passer en thème clair' : 'Passer en thème sombre'}
      style={style}
    >
      <svg
        width={Math.round(size * 0.55)}
        height={Math.round(size * 0.55)}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        aria-hidden="true"
      >
        {versClair ? (
          <>
            <circle cx={10} cy={10} r={3.6} />
            <path d="M10 1.6v2M10 16.4v2M1.6 10h2M16.4 10h2M4.1 4.1l1.4 1.4M14.5 14.5l1.4 1.4M15.9 4.1l-1.4 1.4M5.5 14.5l-1.4 1.4" />
          </>
        ) : (
          <path
            d="M15.6 12.4A6.4 6.4 0 0 1 7.6 4.4a6.4 6.4 0 1 0 8 8Z"
            fill="currentColor"
            stroke="none"
          />
        )}
      </svg>
    </button>
  );
}
