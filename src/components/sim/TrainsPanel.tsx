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

  const wrapStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 12,
    background: '#0f1923',
    color: '#ecf0f1',
    fontSize: 12,
    fontFamily: 'system-ui',
    borderTop: '1px solid #34495e',
    maxHeight: 200,
    overflowY: 'auto',
  };
  const rowStyle: React.CSSProperties = {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    flexWrap: 'wrap',
  };
  const selectStyle: React.CSSProperties = {
    background: '#1a242f',
    color: '#ecf0f1',
    border: '1px solid #34495e',
    borderRadius: 3,
    padding: '2px 4px',
    fontSize: 12,
    fontFamily: 'inherit',
  };
  const btnStyle: React.CSSProperties = {
    padding: '4px 14px',
    fontSize: 12,
    fontFamily: 'inherit',
    borderRadius: 3,
    border: '1px solid #2980b9',
    background: '#2980b9',
    color: 'white',
    cursor: 'pointer',
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
    <div style={wrapStyle}>
      <div style={rowStyle}>
        <strong>Trains</strong>
        <label>
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
        <label>
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
        <label>
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
        <label>
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
        <button style={btnStyle} onClick={handleLaunch}>
          Lancer un train
        </button>
      </div>

      <div style={{ ...rowStyle, fontFamily: 'monospace', fontSize: 11, color: '#95a5a6' }}>
        <span>events: {events.length}</span>
        <span>paused: {pausedEvents.length}</span>
        {events.slice(0, 8).map((e) => (
          <span key={e.uid}>
            [{e.type}
            {e.target ? ` ${e.target}` : ''} {formatRelative(e.time)}
            {e.train ? ` (${e.train.name})` : ''}]
          </span>
        ))}
        {events.length > 8 && <span>… +{events.length - 8}</span>}
      </div>
    </div>
  );
}
