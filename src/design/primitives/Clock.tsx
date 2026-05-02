// Horloge de simulation avec pastille de pulsation.
//
// La pastille pulse (animation CSS) quand la sim avance (`running`),
// reste statique sinon. Format `HH:MM:SS` en police mono pour stabilité
// visuelle (chiffres tabulaires).
//
// Pas d'interactivité : la primitive est uniquement informative.

import type { CSSProperties } from 'react';
import { colors, typography } from '../tokens';

interface Props {
  /** Temps simulé en ms (epoch). */
  timeMs: number;
  /** True si la sim avance (speed > 0 et mode = play). */
  running?: boolean;
}

function formatTime(ms: number): string {
  if (!ms) return '--:--:--';
  const d = new Date(ms);
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mm = d.getUTCMinutes().toString().padStart(2, '0');
  const ss = d.getUTCSeconds().toString().padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

const pulseKeyframes = `
@keyframes gessieClockPulse {
  0%   { opacity: 1; transform: scale(1); }
  50%  { opacity: 0.3; transform: scale(0.8); }
  100% { opacity: 1; transform: scale(1); }
}
`;

let stylesInjected = false;
function injectStylesOnce() {
  if (stylesInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.dataset.gessie = 'clock-pulse';
  style.textContent = pulseKeyframes;
  document.head.appendChild(style);
  stylesInjected = true;
}

export function Clock({ timeMs, running = false }: Props) {
  injectStylesOnce();

  const dotStyle: CSSProperties = {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: running ? colors.accent.success : colors.text.muted,
    animation: running ? 'gessieClockPulse 1200ms ease-in-out infinite' : undefined,
  };

  const wrapperStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    fontFamily: typography.mono.family,
    fontSize: typography.size.md,
    color: colors.text.primary,
    fontVariantNumeric: 'tabular-nums',
  };

  return (
    <span style={wrapperStyle} aria-label={`Horloge simulation ${formatTime(timeMs)}`}>
      <span style={dotStyle} aria-hidden />
      {formatTime(timeMs)}
    </span>
  );
}
