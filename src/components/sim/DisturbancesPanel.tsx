// Panel des disturbances (avaries) — UI minimale pour activer/désactiver
// les anomalies que Gessie expose via clic-droit sur le TCO.
//
// Reproduit fidèlement les menus contextuels de Gessie :
//   - aiguille (renderer.js @276350) : ABSENCE_CONTROLE_*
//   - controle (renderer.js @278700) : RATE_*, NON_LIBERATION_*, DERANGEMENT_*
//                                       (selon présence eap / epa / Proxi)
//   - zone (renderer.js @289600)     : FORCAGE_/MAINTIEN_OCCUPATION, ARRET_TRAIN
//   - bloc (renderer.js @298900)     : REDDITION_IMPOSSIBLE, ANNONCE_IMPOSSIBLE,
//                                       TEST_IMPOSSIBLE, NON_RECEPTION_*,
//                                       DERANGEMENT_BLOC
//
// UI : sélecteur de cible (dropdown) + Pill-toggle des disturbances
// applicables. Section "Actives" qui liste les disturbances en cours
// (toutes cibles confondues) avec un clic = désactive.

import { useMemo, useState } from 'react';
import { useGessieStore } from '../../store/useGessieStore';
import { Panel } from '../../design/primitives/Panel';
import { Pill } from '../../design/primitives/Pill';
import { colors, radii, spacing, typography } from '../../design/tokens';

// ===== Catalogue =====

const DISTURBANCE_LABELS: Record<string, string> = {
  RATE_OUVERTURE: "Raté d'ouverture",
  RATE_FERMETURE: 'Raté de fermeture',
  NON_LIBERATION_ZAP: 'Non libération ZAP',
  NON_LIBERATION_EAP: 'Non libération EAP',
  DERANGEMENT_EAP: 'Dérangement EAP',
  NON_LIBERATION_EPA: 'Non libération EPA',
  DERANGEMENT_EPA: 'Dérangement EPA',
  NON_LIBERATION_EP: 'Non libération EP',
  ABSENCE_CONTROLE_GAUCHE: 'Absence de contrôle gauche',
  ABSENCE_CONTROLE_DROITE: 'Absence de contrôle droite',
  ABSENCE_CONTROLE_COMPLET: 'Absence de contrôle complet',
  FORCAGE_OCCUPATION: 'Forçage occupation',
  MAINTIEN_OCCUPATION: 'Maintien occupation',
  ARRET_TRAIN: 'Arrêter le prochain train',
  REDDITION_IMPOSSIBLE: 'Reddition impossible',
  ANNONCE_IMPOSSIBLE: 'Annonce impossible',
  TEST_IMPOSSIBLE: 'Non apparition du test',
  NON_RECEPTION_VOIE_LIBRE: 'Non réception voie libre',
  NON_RECEPTION_ANNONCE: "Non réception de l'annonce",
  DERANGEMENT_BLOC: 'Dérangement du bloc',
};

interface Target {
  kind: 'affectation' | 'bloc';
  id: string;
  /** Type sous-jacent pour filtrer les disturbances (ignoré pour bloc). */
  affType?: string;
  hasEap?: boolean;
  hasEpa?: boolean;
  hasProxi?: boolean;
}

function disturbancesFor(t: Target): string[] {
  if (t.kind === 'bloc') {
    return [
      'REDDITION_IMPOSSIBLE',
      'ANNONCE_IMPOSSIBLE',
      'TEST_IMPOSSIBLE',
      'NON_RECEPTION_VOIE_LIBRE',
      'NON_RECEPTION_ANNONCE',
      'DERANGEMENT_BLOC',
    ];
  }
  switch (t.affType) {
    case 'aiguille':
      return ['ABSENCE_CONTROLE_GAUCHE', 'ABSENCE_CONTROLE_DROITE', 'ABSENCE_CONTROLE_COMPLET'];
    case 'zone':
      return ['FORCAGE_OCCUPATION', 'MAINTIEN_OCCUPATION', 'ARRET_TRAIN'];
    case 'controle': {
      const list = ['RATE_OUVERTURE', 'RATE_FERMETURE'];
      if (t.hasEap) list.push('NON_LIBERATION_ZAP', 'NON_LIBERATION_EAP', 'DERANGEMENT_EAP');
      if (t.hasEpa) list.push('NON_LIBERATION_EPA', 'DERANGEMENT_EPA');
      if (t.hasProxi) list.push('NON_LIBERATION_EP');
      return list;
    }
    default:
      return [];
  }
}

// ===== Sélecteurs scalaires =====

/** Liste de toutes les cibles dispo (concat affectations + blocs), encodée
 *  en CSV pour rester scalaire au sens Zustand (évite la boucle getSnapshot). */
function useTargetsCsv(): string {
  return useGessieStore((s) => {
    if (!s.player.data) return '';
    const lines: string[] = [];
    for (const [id, a] of Object.entries(s.player.data.affectations)) {
      if (a.type !== 'controle' && a.type !== 'aiguille' && a.type !== 'zone') continue;
      const hasEap = a.eap ? '1' : '0';
      const hasEpa = a.epa ? '1' : '0';
      const hasProxi = a.pedales?.Proxi ? '1' : '0';
      lines.push(`${a.type}|${id}|${hasEap}|${hasEpa}|${hasProxi}`);
    }
    for (const b of s.player.data.blocs) {
      lines.push(`bloc|${b.id}|0|0|0`);
    }
    return lines.sort().join('\n');
  });
}

function decodeTargets(csv: string): Target[] {
  if (!csv) return [];
  return csv.split('\n').map((line) => {
    const [type, id, hasEap, hasEpa, hasProxi] = line.split('|');
    if (type === 'bloc') return { kind: 'bloc' as const, id };
    return {
      kind: 'affectation' as const,
      id,
      affType: type,
      hasEap: hasEap === '1',
      hasEpa: hasEpa === '1',
      hasProxi: hasProxi === '1',
    };
  });
}

/** Disturbances actives sur une cible — string CSV des disturbances. */
function useActiveDisturbances(target: Target | null): string[] {
  const csv = useGessieStore((s) => {
    if (!target || !s.player.data) return '';
    if (target.kind === 'bloc') {
      return s.player.data.blocs.find((b) => b.id === target.id)?.disturbances.sort().join('\n') ?? '';
    }
    return s.player.data.affectations[target.id]?.disturbances.sort().join('\n') ?? '';
  });
  return csv === '' ? [] : csv.split('\n');
}

/** Toutes les disturbances actives (sur toutes les cibles), CSV de
 *  "kind|targetId|disturbance" — pour la liste globale. */
function useAllActiveDisturbances(): { kind: 'bloc' | 'affectation'; id: string; disturbance: string }[] {
  const csv = useGessieStore((s) => {
    if (!s.player.data) return '';
    const lines: string[] = [];
    for (const [id, a] of Object.entries(s.player.data.affectations)) {
      for (const d of a.disturbances) lines.push(`affectation|${id}|${d}`);
    }
    for (const b of s.player.data.blocs) {
      for (const d of b.disturbances) lines.push(`bloc|${b.id}|${d}`);
    }
    return lines.sort().join('\n');
  });
  if (csv === '') return [];
  return csv.split('\n').map((l) => {
    const [kind, id, disturbance] = l.split('|');
    return { kind: kind as 'bloc' | 'affectation', id, disturbance };
  });
}

// ===== Composant principal =====

export function DisturbancesPanel() {
  const targetsCsv = useTargetsCsv();
  const targets = useMemo(() => decodeTargets(targetsCsv), [targetsCsv]);
  const active = useAllActiveDisturbances();
  const toggle = useGessieStore((s) => s.toggleDisturbance);

  const [selectedId, setSelectedId] = useState<string>('');
  const selected = targets.find((t) => `${t.kind}:${t.id}` === selectedId) ?? null;
  const selectedDisturbances = useActiveDisturbances(selected);

  if (targets.length === 0) return null;

  const applicable = selected ? disturbancesFor(selected) : [];

  const meta = active.length > 0 ? `${active.length} active${active.length > 1 ? 's' : ''}` : undefined;

  const selectStyle: React.CSSProperties = {
    flex: '0 1 280px',
    padding: '4px 8px',
    fontSize: typography.size.sm,
    fontFamily: typography.ui.family,
    background: colors.surface.medium,
    color: colors.text.primary,
    border: `1px solid ${colors.border.default}`,
    borderRadius: radii.md,
  };

  return (
    <Panel title="Avaries" meta={meta} scroll maxHeight={240}>
      {/* === Section : disturbances actives (toutes cibles) === */}
      {active.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: spacing.xs,
            paddingBottom: spacing.xs,
          }}
        >
          <span
            style={{
              fontSize: typography.size.xs,
              color: colors.text.muted,
              alignSelf: 'center',
              textTransform: 'uppercase',
              letterSpacing: 0.6,
              fontWeight: typography.weight.medium,
            }}
          >
            Actives
          </span>
          {active.map(({ kind, id, disturbance }) => (
            <Pill
              key={`${kind}:${id}:${disturbance}`}
              variant="danger"
              active
              title="Cliquer pour désactiver"
              onClick={() =>
                toggle(
                  kind === 'bloc'
                    ? { blocId: id, disturbance }
                    : { affectationId: id, disturbance },
                )
              }
            >
              <span style={{ fontFamily: typography.mono.family }}>{id}</span>
              <span style={{ opacity: 0.7 }}>·</span>
              <span>{DISTURBANCE_LABELS[disturbance] ?? disturbance}</span>
            </Pill>
          ))}
        </div>
      )}

      {/* === Sélecteur de cible + disturbances applicables === */}
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
        <span
          style={{
            fontSize: typography.size.xs,
            color: colors.text.muted,
            textTransform: 'uppercase',
            letterSpacing: 0.6,
            fontWeight: typography.weight.medium,
          }}
        >
          Cible
        </span>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          style={selectStyle}
        >
          <option value="">— choisir —</option>
          {targets.map((t) => (
            <option key={`${t.kind}:${t.id}`} value={`${t.kind}:${t.id}`}>
              {t.kind === 'bloc' ? `bloc ${t.id}` : `${t.affType} ${t.id}`}
            </option>
          ))}
        </select>
      </div>

      {selected && applicable.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs }}>
          {applicable.map((d) => {
            const on = selectedDisturbances.indexOf(d) !== -1;
            return (
              <Pill
                key={d}
                size="md"
                variant={on ? 'danger' : 'neutral'}
                active={on}
                onClick={() =>
                  toggle(
                    selected.kind === 'bloc'
                      ? { blocId: selected.id, disturbance: d }
                      : { affectationId: selected.id, disturbance: d },
                  )
                }
              >
                {DISTURBANCE_LABELS[d] ?? d}
              </Pill>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
