// Catalogue de dérangements du PRS de Springfield.
//
// Transcription du formulaire `forme` de `gaestro.html` : zones, aiguilles,
// signaux, itinéraires — plus le bouton « Immédiat » (`fimm()`) et la
//
// Tant que ce panneau est ouvert, le TCO passe en **mode dérangement** : un
// clic sur une pastille de zone, une aiguille ou un signal pose ou retire son
// dérangement, ce qui évite de chercher l'élément dans les listes.
// « R.A.Z » (`iniderang()`). Cf. `docs/springfield-prs-spec.md` §8.

import type { ReactNode } from 'react';
import { AIGUILLES, ROUTES, SIGNALS, routeFullLabel } from './topology';
import type { AigId, RouteId, SignalId } from './topology';
import {
  AIG_FAULT_LABELS,
  ROUTE_FAULT_LABELS,
  SIGNAL_FAULT_LABELS,
  ZONE_FAULT_LABELS,
} from './engine';
import type {
  AigFaultKind,
  PrsState,
  RouteFaultKind,
  SignalFaultKind,
  ZoneFaultKey,
} from './engine';
import { FieldLabel, Panel } from './ui';
import { actionButton, hintStyle, selectStyle } from './styles';
import { prs } from './theme';

/**
 * Itinéraires exposés au menu « dérangement d'itinéraire » : l'original
 * n'en propose que 8 (ni DG-N1 ni AU-M), et les variantes T.P. partagent la
 * clé de leur itinéraire simple.
 */
const FAULTABLE_ROUTES: RouteId[] = ROUTES.filter(
  (r) => r.derangementKey != null && !r.tpOf,
).map((r) => r.id);

export interface PrsDerangementsProps {
  state: PrsState;
  onSetZoneFault: (k: ZoneFaultKey | null) => void;
  onApplyZoneNow: () => void;
  onSetAigFault: (f: { id: AigId; kind: AigFaultKind } | null) => void;
  onSetSignalFault: (f: { id: SignalId; kind: SignalFaultKind } | null) => void;
  onSetRouteFault: (f: { id: RouteId; kind: RouteFaultKind } | null) => void;
  onReset: () => void;
}

export function PrsDerangements(p: PrsDerangementsProps) {
  const f = p.state.faults;

  return (
    <Panel
      title="Dérangements"
      accent="amber"
      aside={
        <button type="button" onClick={p.onReset} style={actionButton('amber')}>
          R.A.Z
        </button>
      }
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 14,
        }}
      >
        <Field label="Zone">
          <Select
            value={f.zone ?? ''}
            onChange={(v) => p.onSetZoneFault((v || null) as ZoneFaultKey | null)}
            options={[
              { value: '', label: 'Aucun' },
              ...(Object.keys(ZONE_FAULT_LABELS) as ZoneFaultKey[]).map((k) => ({
                value: k,
                label: ZONE_FAULT_LABELS[k],
              })),
            ]}
          />
          <button
            type="button"
            onClick={p.onApplyZoneNow}
            disabled={!f.zone}
            style={{ ...actionButton('red'), opacity: f.zone ? 1 : 0.45, padding: '7px 14px' }}
            title="Occupe immédiatement les zones du dérangement sélectionné"
          >
            Immédiat
          </button>
        </Field>

        <Field label="Aiguille">
          <Select
            value={f.aig?.id ?? ''}
            onChange={(v) =>
              p.onSetAigFault(v ? { id: v as AigId, kind: f.aig?.kind ?? 'noCtrlD' } : null)
            }
            options={[
              { value: '', label: 'Aucune' },
              ...AIGUILLES.map((a) => ({ value: a.id, label: `aig ${a.label}` })),
            ]}
          />
          <Select
            value={f.aig?.kind ?? 'noCtrlD'}
            disabled={!f.aig}
            onChange={(v) => f.aig && p.onSetAigFault({ id: f.aig.id, kind: v as AigFaultKind })}
            options={(Object.keys(AIG_FAULT_LABELS) as AigFaultKind[]).map((k) => ({
              value: k,
              label: AIG_FAULT_LABELS[k],
            }))}
          />
        </Field>

        <Field label="Signal">
          <Select
            value={f.signal?.id ?? ''}
            onChange={(v) =>
              p.onSetSignalFault(v ? { id: v as SignalId, kind: f.signal?.kind ?? 'ro' } : null)
            }
            options={[
              { value: '', label: 'Aucun' },
              ...SIGNALS.map((s) => ({ value: s.id, label: s.label })),
            ]}
          />
          <Select
            value={f.signal?.kind ?? 'ro'}
            disabled={!f.signal}
            onChange={(v) =>
              f.signal && p.onSetSignalFault({ id: f.signal.id, kind: v as SignalFaultKind })
            }
            options={(Object.keys(SIGNAL_FAULT_LABELS) as SignalFaultKind[]).map((k) => ({
              value: k,
              label: SIGNAL_FAULT_LABELS[k],
            }))}
          />
        </Field>

        <Field label="Itinéraire">
          <Select
            value={f.route?.id ?? ''}
            onChange={(v) =>
              p.onSetRouteFault(v ? { id: v as RouteId, kind: f.route?.kind ?? 'formation' } : null)
            }
            options={[
              { value: '', label: 'Aucun' },
              ...FAULTABLE_ROUTES.map((id) => ({
                value: id,
                label: routeFullLabel(ROUTES.find((r) => r.id === id)!),
              })),
            ]}
          />
          <Select
            value={f.route?.kind ?? 'formation'}
            disabled={!f.route}
            onChange={(v) => f.route && p.onSetRouteFault({ id: f.route.id, kind: v as RouteFaultKind })}
            options={(Object.keys(ROUTE_FAULT_LABELS) as RouteFaultKind[]).map((k) => ({
              value: k,
              label: ROUTE_FAULT_LABELS[k],
            }))}
          />
        </Field>
      </div>

      <p style={hintStyle}>
        Le menu d'origine ne propose que « raté d'ouverture » et « extinction » pour les signaux :
        le code contient un troisième cas (« raté de fermeture ») resté inatteignable, non repris ici.
      </p>
    </Panel>
  );
}

// ===== Primitives ============================================================

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...selectStyle, fontSize: 12, opacity: disabled ? 0.45 : 1, color: prs.textDim }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
