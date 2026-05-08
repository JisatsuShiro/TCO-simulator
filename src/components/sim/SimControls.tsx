// Barre de contrôle de la sim : horloge, sélecteur de vitesse, compteur de
// discordances. Le ModeToggle Édition/Simulation est caché : l'app reste
// toujours en mode play (initPlayer auto sur load de gare dans App.tsx).

import { useGessieStore } from '../../store/useGessieStore';
import { useClockTick } from '../../sim/useClockTick';
import { Clock } from '../../design/primitives/Clock';
import { SpeedSelector } from '../../design/primitives/SpeedSelector';
import { colors, spacing, typography } from '../../design/tokens';

export function SimControls() {
  // Pose le setInterval tant qu'on est en mode play.
  useClockTick();

  const mode = useGessieStore((s) => s.player.mode);
  const speed = useGessieStore((s) => s.clock.speed);
  const currentTime = useGessieStore((s) => s.clock.currentTime);
  const discordancesCount = useGessieStore(
    (s) => s.player.data?.discordances_count ?? 0,
  );

  const setSpeed = useGessieStore((s) => s.setSpeed);

  const wrapperStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${spacing.xs}px ${spacing.md}px`,
    background: colors.surface.medium,
    color: colors.text.primary,
    fontSize: typography.size.sm,
    fontFamily: typography.ui.family,
    borderTop: `1px solid ${colors.border.subtle}`,
  };

  const running = mode === 'play' && speed > 0;

  return (
    <div style={wrapperStyle}>
      <Clock timeMs={currentTime} running={running} />
      {mode === 'play' && (
        <SpeedSelector speed={speed} onChange={setSpeed} />
      )}
      {discordancesCount > 0 && (
        <span
          aria-label={`${discordancesCount} discordance${discordancesCount > 1 ? 's' : ''} active${discordancesCount > 1 ? 's' : ''}`}
          title="Aiguilles ou taquets en discordance (contrôle absent)"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '2px 10px',
            background: colors.signal.rouge,
            color: colors.text.primary,
            border: '1px solid #7A1414',
            borderRadius: 999,
            fontFamily: typography.mono.family,
            fontSize: typography.size.xs,
            fontWeight: typography.weight.bold,
            letterSpacing: 0.4,
            marginLeft: spacing.sm,
          }}
        >
          <span aria-hidden="true">⚠</span>
          DISC {discordancesCount}
        </span>
      )}
    </div>
  );
}
