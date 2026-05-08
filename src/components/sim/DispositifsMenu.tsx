// Menu contextuel "Dispositifs d'attention" — apparaît au clic-droit sur un
// levier ou un bloc et permet de poser/retirer les étiquettes mémo (DA, DSA,
// DR) que l'opérateur utilise pour son propre suivi.
//
// Reproduit le menu Electron Gessie (renderer.js) :
//   - sur lever : DA / DSA / DR (3 cases à cocher)
//   - sur bloc  : DA / DR (2 cases à cocher)
// Chaque clic dispatch `toggleDispositifAttention` avec leverId | blocId.
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
  const toggleDispositif = useGessieStore((s) => s.toggleDispositifAttention);

  // Sélecteur scalaire CSV — évite les boucles getSnapshot.
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

  const applicable = target.kind === 'lever' ? LEVER_DISPOSITIFS : BLOC_DISPOSITIFS;

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

  const left = Math.min(x, window.innerWidth - 240);
  const top = Math.min(y, window.innerHeight - 180);

  const headerLabel =
    target.kind === 'lever'
      ? `Levier ${target.leverId}`
      : `Bloc ${target.blocId}`;

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
        minWidth: 220,
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
      {applicable.map((d) => {
        const isActive = active.indexOf(d) !== -1;
        return (
          <MenuItem
            key={d}
            code={d}
            label={DISPOSITIF_LABELS[d] ?? d}
            active={isActive}
            onClick={() => {
              if (target.kind === 'lever') {
                toggleDispositif({ leverId: target.leverId, dispositif: d });
              } else {
                toggleDispositif({ blocId: target.blocId, dispositif: d });
              }
              // Pas d'`onClose()` — on laisse l'opérateur cocher plusieurs
              // cases d'affilée, conforme au comportement d'un menu Electron
              // à checkboxes (Gessie). Fermeture manuelle (clic ext / Escape).
            }}
          />
        );
      })}
    </div>
  );
}

function MenuItem({
  code,
  label,
  active,
  onClick,
}: {
  code: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={active}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xs,
        padding: `${spacing.xs}px ${spacing.sm}px`,
        background: 'transparent',
        border: 'none',
        borderRadius: radii.sm,
        color: active ? colors.accent.warning : colors.text.primary,
        textAlign: 'left',
        fontSize: typography.size.sm,
        fontFamily: typography.ui.family,
        fontWeight: active ? typography.weight.semibold : typography.weight.regular,
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
          borderRadius: 3,
          background: active ? colors.accent.warning : 'transparent',
          border: `1px solid ${active ? colors.accent.warning : colors.border.default}`,
          flexShrink: 0,
          color: colors.surface.darkest,
          fontSize: 10,
          fontWeight: typography.weight.bold,
          lineHeight: 1,
        }}
      >
        {active ? '✓' : ''}
      </span>
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
        }}
      >
        {label}
      </span>
    </button>
  );
}
