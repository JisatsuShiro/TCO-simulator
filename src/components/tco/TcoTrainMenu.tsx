// Menu contextuel "Lancer un train" — apparaît au clic-droit sur une voie
// (ou zone) du TCO. Compact form avec direction / taille / vitesse / point
// de départ + bouton Lancer.
//
// Reprend les options du `TrainsPanel` qu'il remplace pour le flux de
// lancement : un seul écran condensé, ouvert là où l'opérateur veut un
// nouveau train.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useGessieStore } from '../../store/useGessieStore';
import { Button } from '../../design/primitives/Button';
import { colors, radii, spacing, typography } from '../../design/tokens';
import type { Direction, TrainSize } from '../../sim/types';

const SIZES: TrainSize[] = ['Petit', 'Moyen', 'Grand'];
const SPEEDS = [1, 2, 5, 10];
const DIRECTIONS: Direction[] = ['pair', 'impair'];

interface Props {
  x: number;
  y: number;
  /** Point de départ pré-sélectionné (inféré depuis l'item cliqué). */
  suggestedStartingPoint?: string | null;
  onClose: () => void;
}

export function TcoTrainMenu({ x, y, suggestedStartingPoint, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const startTrain = useGessieStore((s) => s.startTrain);

  // CSV des points de départ disponibles (zones + cantonnements gare-X).
  // Pattern scalaire pour rester compatible Zustand (cf. autres panels).
  const startingPointsCsv = useGessieStore((s) => {
    if (!s.player.data) return '';
    const ids = Object.keys(s.player.data.affectations).filter((id) => {
      const a = s.player.data?.affectations[id];
      if (!a) return false;
      if (a.type === 'zone') return true;
      if (id.startsWith('gare-')) return true;
      return false;
    });
    return ids.sort().join('|');
  });
  const startingPoints = useMemo(
    () => (startingPointsCsv === '' ? [] : startingPointsCsv.split('|')),
    [startingPointsCsv],
  );

  // Sélection initiale : suggestion (clic sur item résolu) si elle est
  // valide ; sinon premier point disponible.
  const initialStart =
    suggestedStartingPoint && startingPoints.indexOf(suggestedStartingPoint) !== -1
      ? suggestedStartingPoint
      : (startingPoints[0] ?? '');

  const [startingPoint, setStartingPoint] = useState(initialStart);
  const [direction, setDirection] = useState<Direction>('pair');
  const [size, setSize] = useState<TrainSize>('Moyen');
  const [speed, setSpeed] = useState<number>(1);

  // Fermeture clic extérieur / Escape.
  useEffect(() => {
    const onMousedown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onMousedown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onMousedown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  if (startingPoints.length === 0) return null;

  // Repositionne pour ne pas dépasser à droite/bas.
  const left = Math.min(x, window.innerWidth - 320);
  const top = Math.min(y, window.innerHeight - 320);

  const handleLaunch = () => {
    if (!startingPoint) return;
    startTrain({ direction, size, speed, startingPoint });
    onClose();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Lancer un train"
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 1000,
        minWidth: 280,
        background: colors.surface.dark,
        border: `1px solid ${colors.border.default}`,
        borderRadius: radii.md,
        boxShadow: '0 12px 28px rgba(0,0,0,0.55)',
        padding: spacing.sm,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.sm,
        fontFamily: typography.ui.family,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        style={{
          fontSize: typography.size.sm,
          color: colors.text.primary,
          fontWeight: typography.weight.semibold,
          letterSpacing: 0.2,
        }}
      >
        Lancer un train
      </div>

      <FieldRow label="Départ">
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
      </FieldRow>

      <FieldRow label="Sens">
        <Segmented
          options={DIRECTIONS}
          value={direction}
          onChange={setDirection}
          renderLabel={(d) => d}
        />
      </FieldRow>

      <FieldRow label="Taille">
        <Segmented
          options={SIZES}
          value={size}
          onChange={setSize}
          renderLabel={(s) => s}
        />
      </FieldRow>

      <FieldRow label="Vitesse">
        <Segmented
          options={SPEEDS}
          value={speed}
          onChange={setSpeed}
          renderLabel={(s) => `×${s}`}
        />
      </FieldRow>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: spacing.xxs }}>
        <Button variant="primary" onClick={handleLaunch}>
          Lancer
        </Button>
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
      <span
        style={{
          minWidth: 56,
          fontSize: typography.size.xs,
          color: colors.text.muted,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          fontWeight: typography.weight.medium,
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, display: 'flex' }}>{children}</div>
    </div>
  );
}

interface SegmentedProps<T> {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  renderLabel: (v: T) => string;
}

function Segmented<T extends string | number>({ options, value, onChange, renderLabel }: SegmentedProps<T>) {
  return (
    <div
      style={{
        display: 'inline-flex',
        background: colors.surface.darkest,
        border: `1px solid ${colors.border.default}`,
        borderRadius: radii.md,
        padding: 2,
        gap: 2,
      }}
      role="radiogroup"
    >
      {options.map((o) => {
        const active = o === value;
        return (
          <button
            key={String(o)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o)}
            style={{
              minHeight: 26,
              padding: '2px 10px',
              background: active ? colors.accent.primary : 'transparent',
              color: active ? '#FFFFFF' : colors.text.secondary,
              border: 'none',
              borderRadius: radii.sm,
              fontFamily: typography.ui.family,
              fontSize: typography.size.sm,
              fontWeight: active ? typography.weight.semibold : typography.weight.medium,
              cursor: 'pointer',
              transition: 'background 120ms ease, color 120ms ease',
            }}
          >
            {renderLabel(o)}
          </button>
        );
      })}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  flex: 1,
  padding: '4px 8px',
  background: colors.surface.medium,
  color: colors.text.primary,
  border: `1px solid ${colors.border.default}`,
  borderRadius: radii.md,
  fontFamily: typography.ui.family,
  fontSize: typography.size.sm,
};
