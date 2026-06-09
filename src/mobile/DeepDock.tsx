// Dock de commande du levier sélectionné (en bas d'écran). Pilote le vrai
// levier : manœuvre +/−, commutateur FC (si applicable), accès au détail.

import { M } from './theme';
import { ManoeuvreControl } from './controls';
import type { LeverPosition } from './controls';
import type { Lever as SimLever } from '../sim/types';

export interface FcControl {
  on: boolean;
  onToggle: () => void;
}

export function DeepDock({
  lever,
  label,
  group,
  etat,
  fc,
  onManoeuvre,
  onDetail,
}: {
  lever: SimLever;
  label: string;
  group: 'Signaux' | 'Aiguilles';
  etat: string;
  fc: FcControl | null;
  onManoeuvre: (target: LeverPosition) => void;
  onDetail: () => void;
}) {
  return (
    <div
      style={{
        flexShrink: 0,
        padding: '11px 14px 8px',
        background: M.panel,
        borderTop: `1px solid ${M.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{ fontSize: 20, fontWeight: 800, fontFamily: M.mono, color: M.amber, lineHeight: 1 }}>{lever.id}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
          <span style={{ fontSize: 10.5, color: M.faint, fontFamily: M.mono }}>
            {group} · {etat} · {lever.position === 'plus' ? '+' : '−'}
          </span>
        </div>
        {fc && (
          <button
            onClick={fc.onToggle}
            style={{
              height: 32,
              padding: '0 11px',
              borderRadius: 10,
              cursor: 'pointer',
              fontSize: 11.5,
              fontWeight: 600,
              fontFamily: M.mono,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              border: `1px solid ${fc.on ? M.amber : M.border}`,
              background: fc.on ? `color-mix(in oklch, ${M.amber} 22%, ${M.panel2})` : M.panel2,
              color: fc.on ? M.amber : M.muted,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: fc.on ? M.amber : M.faint,
                boxShadow: fc.on ? `0 0 5px ${M.amber}` : 'none',
              }}
            />
            FC
          </button>
        )}
        <button
          onClick={onDetail}
          aria-label="Détail du levier"
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            cursor: 'pointer',
            padding: 0,
            border: `1px solid ${M.border}`,
            background: M.panel2,
            color: M.muted,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M8 7.2 V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="5" r="0.9" fill="currentColor" />
          </svg>
        </button>
      </div>
      <ManoeuvreControl position={lever.position} onManoeuvre={onManoeuvre} size="lg" />
    </div>
  );
}
