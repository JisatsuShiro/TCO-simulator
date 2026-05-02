// Barre de contrôle de la sim : ModeToggle (édition / simulation),
// horloge, sélecteur de vitesse, compteurs.

import { useGessieStore } from '../../store/useGessieStore';
import { useClockTick } from '../../sim/useClockTick';
import { ModeToggle } from '../../design/primitives/ModeToggle';
import { Clock } from '../../design/primitives/Clock';
import { SpeedSelector } from '../../design/primitives/SpeedSelector';
import { colors, spacing, typography } from '../../design/tokens';

export function SimControls() {
  // Pose le setInterval tant qu'on est en mode play.
  useClockTick();

  const mode = useGessieStore((s) => s.player.mode);
  const speed = useGessieStore((s) => s.clock.speed);
  const currentTime = useGessieStore((s) => s.clock.currentTime);
  const eventsCount = useGessieStore((s) => s.clock.events.length);
  const affectationsCount = useGessieStore((s) =>
    s.player.data ? Object.keys(s.player.data.affectations).length : 0
  );
  const leversCount = useGessieStore((s) =>
    s.player.data ? Object.keys(s.player.data.levers).length : 0
  );

  const initPlayer = useGessieStore((s) => s.initPlayer);
  const exitPlayer = useGessieStore((s) => s.exitPlayer);
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

  const handleModeChange = (next: 'edit' | 'play') => {
    if (next === 'play' && mode === 'edit') initPlayer();
    else if (next === 'edit' && mode === 'play') exitPlayer();
  };

  const running = mode === 'play' && speed > 0;

  return (
    <div style={wrapperStyle}>
      <ModeToggle mode={mode} onChange={handleModeChange} />
      <Clock timeMs={currentTime} running={running} />
      {mode === 'play' && (
        <SpeedSelector speed={speed} onChange={setSpeed} />
      )}
      <span
        style={{
          color: colors.text.muted,
          marginLeft: 'auto',
          fontFamily: typography.mono.family,
          fontSize: typography.size.xs,
        }}
      >
        {affectationsCount} affectations · {leversCount} leviers · {eventsCount} events
      </span>
    </div>
  );
}
