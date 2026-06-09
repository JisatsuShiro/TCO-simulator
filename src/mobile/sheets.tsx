// Feuilles (bottom sheets) : fiche levier détaillée + journal des refus.
// Pilotées par le vrai store (affectations réelles, journal `leverRefusals`).

import type { ReactNode } from 'react';
import { M } from './theme';
import { ManoeuvreControl } from './controls';
import type { LeverPosition } from './controls';
import type { FcControl } from './DeepDock';
import { affEtatLabel } from './leverModel';
import type { Affectation, Lever as SimLever } from '../sim/types';
import type { LeverRefusalEntry } from '../store/useGessieStore';

export interface AeControl {
  on: boolean;
  onToggle: () => void;
}

function formatSimTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '--:--:--';
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function SheetShell({
  children,
  onClose,
  title,
  sub,
  top = 110,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
  sub?: string;
  top?: number;
}) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: '#000a', zIndex: 100 }} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          top,
          zIndex: 105,
          background: M.panel,
          borderRadius: '24px 24px 0 0',
          border: `1px solid ${M.border}`,
          borderBottom: 'none',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -20px 50px -10px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ flexShrink: 0, padding: '10px 18px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: 42, height: 5, borderRadius: 3, background: M.dim, marginBottom: 12 }} />
          <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span>
              {sub && <span style={{ fontSize: 11.5, color: M.faint, fontFamily: M.mono }}>{sub}</span>}
            </div>
            <button
              onClick={onClose}
              style={{ width: 34, height: 34, borderRadius: 11, border: 'none', background: M.panel2, color: M.muted, cursor: 'pointer', fontSize: 18 }}
            >
              ×
            </button>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 18px 24px' }}>{children}</div>
      </div>
    </>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: M.faint, fontFamily: M.mono, margin: '18px 0 9px' }}>
      {children}
    </div>
  );
}

function AffRow({ id, aff }: { id: string; aff: Affectation | undefined }) {
  const etat = affEtatLabel(aff);
  const known = etat !== '—';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 11px',
        borderRadius: 11,
        background: M.panel2,
        border: `1px solid ${M.border}`,
      }}
    >
      <span style={{ fontSize: 12.5, fontFamily: M.mono, color: M.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {id}
        {aff?.type && <span style={{ color: M.faint, marginLeft: 8 }}>{aff.type}</span>}
      </span>
      <span style={{ fontSize: 11.5, fontWeight: 600, fontFamily: M.mono, color: known ? M.amber : M.faint }}>{etat}</span>
    </div>
  );
}

function SwitchButton({ on, onToggle, labelOn, labelOff }: { on: boolean; onToggle: () => void; labelOn: string; labelOff: string }) {
  return (
    <button
      onClick={onToggle}
      style={{
        height: 46,
        width: '100%',
        borderRadius: 13,
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 600,
        fontFamily: M.mono,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
        border: `1px solid ${on ? M.amber : M.border}`,
        background: on ? `color-mix(in oklch, ${M.amber} 20%, ${M.panel2})` : M.panel2,
        color: on ? M.amber : M.muted,
      }}
    >
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: on ? M.amber : M.faint, boxShadow: on ? `0 0 6px ${M.amber}` : 'none' }} />
      {on ? labelOn : labelOff}
    </button>
  );
}

export function DeepDetailSheet({
  lever,
  label,
  group,
  affectations,
  ae,
  fc,
  onManoeuvre,
  refusals,
  stationName,
  onClose,
}: {
  lever: SimLever;
  label: string;
  group: 'Signaux' | 'Aiguilles';
  affectations: Record<string, Affectation>;
  ae: AeControl | null;
  fc: FcControl | null;
  onManoeuvre: (target: LeverPosition) => void;
  refusals: LeverRefusalEntry[];
  stationName: string;
  onClose: () => void;
}) {
  return (
    <SheetShell onClose={onClose} title={`Levier ${lever.id} · ${label}`} sub={`${group} · ${stationName}`}>
      <SectionTitle>Commande</SectionTitle>
      <ManoeuvreControl position={lever.position} onManoeuvre={onManoeuvre} size="lg" />

      <SectionTitle>Affectations pilotées</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {lever.affectations.length === 0 ? (
          <div style={{ fontSize: 12.5, color: M.faint, padding: '6px 2px' }}>Aucune affectation.</div>
        ) : (
          lever.affectations.map((affId) => <AffRow key={affId} id={affId} aff={affectations[affId]} />)
        )}
      </div>

      {ae && (
        <>
          <SectionTitle>Annulateur électrique</SectionTitle>
          <SwitchButton on={ae.on} onToggle={ae.onToggle} labelOn="Sceau brisé (AE armé)" labelOff="AE au repos" />
        </>
      )}

      {fc && (
        <>
          <SectionTitle>Commutateur FC</SectionTitle>
          <SwitchButton on={fc.on} onToggle={fc.onToggle} labelOn="FC engagé (carré fermé)" labelOff="FC au repos" />
        </>
      )}

      <SectionTitle>Refus de ce levier</SectionTitle>
      {refusals.length === 0 ? (
        <div style={{ fontSize: 12.5, color: M.faint, padding: '6px 2px' }}>Aucun refus enregistré.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {refusals.map((r) => (
            <div key={r.uid} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12.5 }}>
              <span style={{ fontFamily: M.mono, color: M.faint, fontSize: 11, marginTop: 1 }}>{formatSimTime(r.time)}</span>
              <span style={{ color: M.text, lineHeight: 1.4 }}>{r.reason}</span>
            </div>
          ))}
        </div>
      )}
    </SheetShell>
  );
}

export function DeepRefusSheet({
  refusals,
  onClose,
  onClear,
  onPick,
}: {
  refusals: LeverRefusalEntry[];
  onClose: () => void;
  onClear: () => void;
  onPick: (id: string) => void;
}) {
  const ordered = [...refusals].reverse();
  return (
    <SheetShell onClose={onClose} title="Journal des refus" sub={`${refusals.length} manœuvre(s) refusée(s)`} top={150}>
      {refusals.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '50px 0', color: M.faint }}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="15" stroke={M.dim} strokeWidth="2" />
            <path d="M13 20.5 L18 25.5 L28 14.5" stroke={M.dim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontSize: 13 }}>Aucun refus — manœuvres conformes.</span>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ordered.map((r) => (
              <button
                key={r.uid}
                onClick={() => onPick(r.leverId)}
                style={{
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 11,
                  padding: '11px 12px',
                  borderRadius: 12,
                  cursor: 'pointer',
                  background: M.panel2,
                  border: `1px solid ${M.border}`,
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    fontFamily: M.mono,
                    color: M.red,
                    flexShrink: 0,
                    padding: '3px 7px',
                    borderRadius: 6,
                    border: `1px solid ${M.red}`,
                    marginTop: 1,
                    textTransform: 'uppercase',
                  }}
                >
                  {r.guard}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>
                    Levier {r.leverId}
                    <span style={{ color: M.faint, fontFamily: M.mono, fontWeight: 400, marginLeft: 8, fontSize: 11 }}>{formatSimTime(r.time)}</span>
                  </span>
                  <span style={{ fontSize: 12.5, color: M.muted, lineHeight: 1.4 }}>{r.reason}</span>
                </div>
              </button>
            ))}
          </div>
          <button
            onClick={onClear}
            style={{
              marginTop: 14,
              height: 38,
              width: '100%',
              borderRadius: 11,
              border: `1px solid ${M.border}`,
              background: M.panel2,
              color: M.muted,
              fontSize: 12.5,
              cursor: 'pointer',
            }}
          >
            Vider le journal
          </button>
        </>
      )}
    </SheetShell>
  );
}
