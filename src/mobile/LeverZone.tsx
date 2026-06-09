// Zone leviers commutable : « grid » (grille de tuiles, défilement vertical,
// par défaut) ou « band » (bande à défilement horizontal). Pilotée par les
// vrais leviers de la gare chargée.

import type { RefObject } from 'react';
import { M } from './theme';
import { LeverGlyph } from './controls';
import { leverLabel } from './leverModel';
import type { Lever as SimLever } from '../sim/types';

export type LeverLayout = 'grid' | 'band';

function LeverTile({
  lever,
  label,
  on,
  isBlink,
  onClick,
  refCb,
}: {
  lever: SimLever;
  label: string;
  on: boolean;
  isBlink: boolean;
  onClick: () => void;
  refCb: (el: HTMLButtonElement | null) => void;
}) {
  const pos = lever.position;
  return (
    <button
      ref={refCb}
      onClick={onClick}
      style={{
        borderRadius: 14,
        cursor: 'pointer',
        padding: '9px 6px 8px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 5,
        width: '100%',
        minWidth: 0,
        border: `1.5px solid ${isBlink ? M.red : on ? M.amber : M.border}`,
        background: on ? `color-mix(in oklch, ${M.amber} 12%, ${M.panel})` : M.panel,
        boxShadow: isBlink
          ? `0 0 0 3px color-mix(in oklch, ${M.red} 30%, transparent)`
          : on
            ? `0 0 0 3px color-mix(in oklch, ${M.amber} 16%, transparent)`
            : 'none',
        transition: 'border-color .15s, box-shadow .15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <span style={{ fontSize: 13, fontWeight: 800, fontFamily: M.mono, color: on ? M.amber : M.text }}>{lever.id}</span>
        {pos === 'minus' && <span style={{ width: 7, height: 7, borderRadius: '50%', background: M.amber, boxShadow: `0 0 5px ${M.amber}` }} />}
      </div>
      <LeverGlyph position={pos} size={30} />
      <span
        style={{
          fontSize: 8.5,
          fontFamily: M.mono,
          color: M.muted,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '100%',
        }}
      >
        {label}
      </span>
      <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
        {(['minus', 'plus'] as const).map((p) => (
          <span
            key={p}
            style={{
              fontSize: 9,
              fontWeight: 800,
              fontFamily: M.mono,
              lineHeight: 1,
              color: pos === p ? M.amber : M.dim,
            }}
          >
            {p === 'plus' ? '+' : '−'}
          </span>
        ))}
      </div>
    </button>
  );
}

export function LeverZone({
  layout,
  list,
  counts,
  sel,
  setSel,
  blink,
  bandRef,
  cardRefs,
}: {
  layout: LeverLayout;
  list: SimLever[];
  counts: Record<string, number>;
  sel: string | null;
  setSel: (id: string) => void;
  blink: string[];
  bandRef: RefObject<HTMLDivElement | null>;
  cardRefs: RefObject<Record<string, HTMLButtonElement | null>>;
}) {
  if (layout === 'grid') {
    return (
      <div
        ref={bandRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '4px 14px 12px',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
          alignContent: 'start',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {list.map((l) => (
          <LeverTile
            key={l.id}
            lever={l}
            label={leverLabel(l, counts)}
            on={sel === l.id}
            isBlink={blink.includes(l.id)}
            onClick={() => setSel(l.id)}
            refCb={(el) => {
              cardRefs.current[l.id] = el;
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      ref={bandRef}
      style={{
        flex: 1,
        minHeight: 0,
        overflowX: 'auto',
        overflowY: 'hidden',
        display: 'flex',
        gap: 10,
        padding: '4px 14px 12px',
        scrollSnapType: 'x proximity',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {list.map((l) => (
        <div key={l.id} style={{ scrollSnapAlign: 'center', flexShrink: 0, width: 90 }}>
          <LeverTile
            lever={l}
            label={leverLabel(l, counts)}
            on={sel === l.id}
            isBlink={blink.includes(l.id)}
            onClick={() => setSel(l.id)}
            refCb={(el) => {
              cardRefs.current[l.id] = el;
            }}
          />
        </div>
      ))}
    </div>
  );
}
