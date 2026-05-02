// Panneau de lancement de trains et debug événements.
//
// Permet de :
//   - Sélectionner un point de départ (zones + cantonnements détectés dans
//     `Player.data.affectations`).
//   - Choisir direction (pair/impair), taille (Petit/Moyen/Grand), vitesse.
//   - Lancer un train : appelle `startTrain` du store qui assigne un nom
//     (≥4000, parité cohérente) et programme un moveTrainIn immédiat.
//
// Affiche aussi en debug la liste des events en file (running + paused) avec
// type, target éventuel et time relatif au currentTime — utile pour vérifier
// le programming des moveTrainIn / moveTrainOut.

import { useState, useMemo } from 'react';
import { useGessieStore } from '../../store/useGessieStore';
import type { Direction, TrainSize } from '../../sim/types';
import { Panel } from '../../design/primitives/Panel';
import { Button } from '../../design/primitives/Button';
import { colors, radii, spacing, typography } from '../../design/tokens';

const SIZES: TrainSize[] = ['Petit', 'Moyen', 'Grand'];
const SPEEDS = [1, 2, 5, 10];
const DIRECTIONS: Direction[] = ['pair', 'impair'];

export function TrainsPanel() {
  const data = useGessieStore((s) => s.player.data);
  const events = useGessieStore((s) => s.clock.events);
  const pausedEvents = useGessieStore((s) => s.clock.pausedEvents);
  const currentTime = useGessieStore((s) => s.clock.currentTime);
  const startTrain = useGessieStore((s) => s.startTrain);

  // Liste des points de départ disponibles : zones + gare-X.
  const startingPoints = useMemo(() => {
    if (!data) return [] as string[];
    const ids = Object.keys(data.affectations).filter((id) => {
      const a = data.affectations[id];
      // Zones : type === 'zone' (typiquement préfixe "z ").
      if (a.type === 'zone') return true;
      // Cantonnements : id commence par "gare-" (toujours préfixé par builder).
      if (id.startsWith('gare-')) return true;
      return false;
    });
    return ids.sort();
  }, [data]);

  const [direction, setDirection] = useState<Direction>('pair');
  const [size, setSize] = useState<TrainSize>('Moyen');
  const [speed, setSpeed] = useState<number>(1);
  const [startingPoint, setStartingPoint] = useState<string>(() => startingPoints[0] ?? '');

  // Si la liste change (changement de gare), réajuste le starting point.
  if (startingPoints.length > 0 && !startingPoints.includes(startingPoint)) {
    setStartingPoint(startingPoints[0]);
  }

  if (!data) return null;

  const selectStyle: React.CSSProperties = {
    background: colors.surface.medium,
    color: colors.text.primary,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radii.sm,
    padding: '3px 6px',
    fontSize: typography.size.sm,
    fontFamily: typography.ui.family,
  };

  const labelStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing.xs,
    color: colors.text.secondary,
    fontSize: typography.size.sm,
  };

  const handleLaunch = (): void => {
    if (!startingPoint) return;
    startTrain({ direction, size, speed, startingPoint });
  };

  const formatRelative = (time: number | undefined): string => {
    if (time == null) return 'paused';
    const dt = time - currentTime;
    if (dt < 0) return 'OVERDUE';
    return `+${(dt / 1000).toFixed(1)}s`;
  };

  return (
    <Panel
      title="Trains"
      meta={`${events.length} events · ${pausedEvents.length} paused`}
      scroll
      maxHeight={200}
      bodyDirection="row"
      bodyGap={spacing.sm}
    >
      <label style={labelStyle}>
        Direction&nbsp;:
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as Direction)}
          style={selectStyle}
        >
          {DIRECTIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <label style={labelStyle}>
        Taille&nbsp;:
        <select
          value={size}
          onChange={(e) => setSize(e.target.value as TrainSize)}
          style={selectStyle}
        >
          {SIZES.map((sz) => (
            <option key={sz} value={sz}>
              {sz}
            </option>
          ))}
        </select>
      </label>
      <label style={labelStyle}>
        Vitesse&nbsp;:
        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          style={selectStyle}
        >
          {SPEEDS.map((sp) => (
            <option key={sp} value={sp}>
              ×{sp}
            </option>
          ))}
        </select>
      </label>
      <label style={labelStyle}>
        Départ&nbsp;:
        <select
          value={startingPoint}
          onChange={(e) => setStartingPoint(e.target.value)}
          style={selectStyle}
        >
          {startingPoints.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <Button variant="primary" onClick={handleLaunch}>
        + Lancer un train
      </Button>

      <div
        style={{
          flexBasis: '100%',
          display: 'flex',
          gap: spacing.xs,
          flexWrap: 'wrap',
          fontFamily: typography.mono.family,
          fontSize: typography.size.xs,
          color: colors.text.muted,
        }}
      >
        {events.slice(0, 8).map((e) => (
          <span key={e.uid}>
            [{e.type}
            {e.target ? ` ${e.target}` : ''} {formatRelative(e.time)}
            {e.train ? ` (${e.train.name})` : ''}]
          </span>
        ))}
        {events.length > 8 && <span>… +{events.length - 8}</span>}
      </div>
    </Panel>
  );
}
