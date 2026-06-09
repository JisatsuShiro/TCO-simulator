// Contrôles mobiles : commande de manœuvre +/− et mini-manche.
// Les leviers PRS sont binaires : « plus » (manche haut, repos) / « minus »
// (manche basculé). On manœuvre donc en + ou en − (et non G/N/D).

import { M } from './theme';

export type LeverPosition = 'plus' | 'minus';

/* ───────── ManoeuvreControl : commande − / + ───────── */
export function ManoeuvreControl({
  position,
  onManoeuvre,
  size = 'md',
}: {
  position: LeverPosition;
  onManoeuvre: (target: LeverPosition) => void;
  size?: 'sm' | 'md' | 'lg';
}) {
  const h = size === 'lg' ? 44 : size === 'sm' ? 28 : 36;
  const opts: [LeverPosition, string][] = [
    ['minus', '−'],
    ['plus', '+'],
  ];
  return (
    <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 11, background: M.panel, border: `1px solid ${M.border}` }}>
      {opts.map(([v, lbl]) => {
        const on = position === v;
        return (
          <button
            key={v}
            onClick={() => onManoeuvre(v)}
            aria-label={v === 'plus' ? 'Manœuvrer en plus' : 'Manœuvrer en moins'}
            style={{
              flex: 1,
              height: h,
              minWidth: h,
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: size === 'lg' ? 22 : 17,
              lineHeight: 1,
              fontFamily: M.mono,
              background: on ? `color-mix(in oklch, ${M.amber} 26%, ${M.panel})` : 'transparent',
              color: on ? M.amber : M.faint,
              boxShadow: on ? `inset 0 0 0 1px ${M.amber}66` : 'none',
            }}
          >
            {lbl}
          </button>
        );
      })}
    </div>
  );
}

/* ───────── LeverGlyph : mini manche, vertical (plus) ou basculé (minus) ───────── */
export function LeverGlyph({ position, size = 26 }: { position: LeverPosition; size?: number }) {
  const angle = position === 'minus' ? 52 : 0;
  const on = position === 'minus';
  return (
    <svg width={size} height={size} viewBox="0 0 26 26">
      <line x1="13" y1="22" x2="13" y2="6" stroke={M.dim} strokeWidth="1.5" strokeLinecap="round" />
      <g transform={`rotate(${angle} 13 22)`} style={{ transition: 'transform 200ms cubic-bezier(.4,1.6,.6,1)' }}>
        <line x1="13" y1="22" x2="13" y2="7" stroke={on ? M.amber : M.muted} strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="13" cy="6" r="3" fill={on ? M.amber : M.muted} style={{ filter: on ? `drop-shadow(0 0 4px ${M.amber})` : 'none' }} />
      </g>
      <circle cx="13" cy="22" r="1.6" fill={M.faint} />
    </svg>
  );
}
