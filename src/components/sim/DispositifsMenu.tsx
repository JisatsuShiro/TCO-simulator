// Menu contextuel "Dispositifs d'attention" — apparaît au clic-droit sur un
// levier ou un bloc et permet d'AJOUTER ou de RETIRER les étiquettes mémo
// (DA, DSA, DR) que l'opérateur utilise pour son propre suivi.
//
//   - sur lever : DA / DSA / DR
//   - sur bloc  : DA / DR
//
// Plusieurs exemplaires du même dispositif sont autorisés : « Ajouter X » est
// toujours proposé et empile un exemplaire ; « Retirer X » n'apparaît que si
// au moins un exemplaire est présent et en enlève un. Le compteur courant est
// rappelé en face de chaque ligne.
//
// Positionné en `position: fixed` aux coordonnées clientX/Y de l'événement.
// Se ferme au clic en dehors ou à Escape.

import { useEffect, useRef } from 'react';
import { useGessieStore } from '../../store/useGessieStore';
import { colors, radii, spacing, typography } from '../../design/tokens';

const DISPOSITIF_LABELS: Record<string, string> = {
  DA: "Dispositif d'attention",
  DSA: "Dispositif spécial d'attention",
  DR: 'Dispositif de rappel',
};

const LEVER_DISPOSITIFS = ['DA', 'DSA', 'DR'] as const;
const BLOC_DISPOSITIFS = ['DA', 'DR'] as const;

export type DispositifsTarget =
  | { kind: 'lever'; leverId: string }
  | { kind: 'bloc'; blocId: string };

interface Props {
  x: number;
  y: number;
  target: DispositifsTarget;
  onClose: () => void;
}

export function DispositifsMenu({ x, y, target, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const changeDispositif = useGessieStore((s) => s.changeDispositifAttention);

  // Sélecteur scalaire CSV (doublons préservés) — évite les boucles getSnapshot.
  const activeCsv = useGessieStore((s) => {
    const data = s.player.data;
    if (!data) return '';
    if (target.kind === 'lever') {
      return (data.levers[target.leverId]?.dispositifs ?? []).slice().sort().join('\n');
    }
    const bloc = data.blocs.find((b) => b.id === target.blocId);
    return (bloc?.dispositifs ?? []).slice().sort().join('\n');
  });
  const active = activeCsv === '' ? [] : activeCsv.split('\n');

  // Compteur par type de dispositif.
  const counts = active.reduce<Record<string, number>>((acc, d) => {
    acc[d] = (acc[d] ?? 0) + 1;
    return acc;
  }, {});

  const applicable = target.kind === 'lever' ? LEVER_DISPOSITIFS : BLOC_DISPOSITIFS;
  const hasAny = applicable.some((d) => (counts[d] ?? 0) > 0);

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

  const left = Math.min(x, window.innerWidth - 260);
  const top = Math.min(y, window.innerHeight - 260);

  const headerLabel =
    target.kind === 'lever' ? `Levier ${target.leverId}` : `Bloc ${target.blocId}`;

  // Émet l'action sans fermer le menu : l'opérateur peut empiler / retirer
  // plusieurs exemplaires d'affilée. Fermeture manuelle (clic ext / Escape).
  const dispatch = (dispositif: string, op: 'add' | 'remove') => {
    if (target.kind === 'lever') {
      changeDispositif({ leverId: target.leverId, dispositif, op });
    } else {
      changeDispositif({ blocId: target.blocId, dispositif, op });
    }
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Dispositifs d'attention pour ${headerLabel}`}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 1000,
        minWidth: 240,
        background: colors.surface.dark,
        border: `1px solid ${colors.border.default}`,
        borderRadius: radii.md,
        boxShadow: '0 12px 28px rgba(0,0,0,0.55)',
        padding: spacing.xxs,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: typography.ui.family,
      }}
    >
      <div
        style={{
          padding: `${spacing.xs}px ${spacing.sm}px`,
          fontSize: typography.size.xs,
          color: colors.text.muted,
          fontFamily: typography.mono.family,
          letterSpacing: 0.4,
          borderBottom: `1px solid ${colors.border.subtle}`,
          marginBottom: spacing.xxs,
        }}
      >
        {headerLabel.toUpperCase()}
      </div>

      {applicable.map((d) => (
        <MenuItem
          key={`add-${d}`}
          verb="Ajouter"
          code={d}
          label={DISPOSITIF_LABELS[d] ?? d}
          count={counts[d] ?? 0}
          tone="add"
          onClick={() => dispatch(d, 'add')}
        />
      ))}

      {hasAny && (
        <div
          style={{
            borderTop: `1px solid ${colors.border.subtle}`,
            margin: `${spacing.xxs}px 0`,
          }}
        />
      )}

      {applicable
        .filter((d) => (counts[d] ?? 0) > 0)
        .map((d) => (
          <MenuItem
            key={`remove-${d}`}
            verb="Retirer"
            code={d}
            label={DISPOSITIF_LABELS[d] ?? d}
            count={counts[d] ?? 0}
            tone="remove"
            onClick={() => dispatch(d, 'remove')}
          />
        ))}
    </div>
  );
}

function MenuItem({
  verb,
  code,
  label,
  count,
  tone,
  onClick,
}: {
  verb: string;
  code: string;
  label: string;
  count: number;
  tone: 'add' | 'remove';
  onClick: () => void;
}) {
  const accent = tone === 'add' ? colors.accent.primary : colors.accent.warning;
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xs,
        padding: `${spacing.xs}px ${spacing.sm}px`,
        background: 'transparent',
        border: 'none',
        borderRadius: radii.sm,
        color: colors.text.primary,
        textAlign: 'left',
        fontSize: typography.size.sm,
        fontFamily: typography.ui.family,
        cursor: 'pointer',
        transition: 'background 100ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = colors.surface.medium;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <span
        aria-hidden
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 14,
          height: 14,
          color: accent,
          fontWeight: typography.weight.bold,
          fontSize: 14,
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        {tone === 'add' ? '+' : '−'}
      </span>
      <span style={{ minWidth: 48 }}>{verb}</span>
      <span
        style={{
          fontFamily: typography.mono.family,
          fontWeight: typography.weight.semibold,
          minWidth: 32,
        }}
      >
        {code}
      </span>
      <span
        style={{
          fontSize: typography.size.xs,
          color: colors.text.secondary,
          flex: 1,
        }}
      >
        {label}
      </span>
      {count > 0 && (
        <span
          title={`${count} posé${count > 1 ? 's' : ''}`}
          style={{
            fontFamily: typography.mono.family,
            fontSize: 11,
            fontWeight: typography.weight.bold,
            color: colors.surface.darkest,
            background: colors.accent.warning,
            borderRadius: radii.sm,
            padding: '1px 5px',
            lineHeight: 1.3,
            flexShrink: 0,
          }}
        >
          ×{count}
        </span>
      )}
    </button>
  );
}
