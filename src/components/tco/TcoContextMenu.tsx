// Menu contextuel TCO — apparaît au clic-droit sur un item (aiguille,
// contrôle/carré, zone) et propose les avaries applicables à cet item.
//
// Reproduit le comportement Gessie (renderer.js @276350 pour aiguille,
// @278700 pour contrôle, @289600 pour zone) : un clic = toggle de
// l'avarie + fermeture du menu.
//
// Le menu est positionné en `position: fixed` aux coordonnées clientX/Y
// de l'événement contextmenu. Il se ferme au clic en dehors ou à Escape.

import { useEffect, useRef } from 'react';
import { useGessieStore } from '../../store/useGessieStore';
import { colors, radii, spacing, typography } from '../../design/tokens';

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
};

export interface ContextMenuTarget {
  /** Clé dans `data.affectations`. */
  id: string;
  affType: 'aiguille' | 'controle' | 'zone';
  hasEap?: boolean;
  hasEpa?: boolean;
  hasProxi?: boolean;
}

function disturbancesFor(t: ContextMenuTarget): string[] {
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
  }
}

interface Props {
  x: number;
  y: number;
  target: ContextMenuTarget;
  onClose: () => void;
}

export function TcoContextMenu({ x, y, target, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const toggleDisturbance = useGessieStore((s) => s.toggleDisturbance);

  // Liste CSV des avaries actives sur cette cible (pattern scalaire pour
  // éviter les boucles getSnapshot avec Zustand).
  const activeCsv = useGessieStore(
    (s) => s.player.data?.affectations[target.id]?.disturbances.sort().join('\n') ?? '',
  );
  const active = activeCsv === '' ? [] : activeCsv.split('\n');

  const applicable = disturbancesFor(target);

  // Fermeture au clic extérieur et à Escape.
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

  // Repositionne pour ne pas dépasser à droite/bas si trop près du bord.
  const left = Math.min(x, window.innerWidth - 260);
  const top = Math.min(y, window.innerHeight - 280);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Avaries pour ${target.affType} ${target.id}`}
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
      onContextMenu={(e) => e.preventDefault()}
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
        {target.affType.toUpperCase()} {target.id}
      </div>
      {applicable.map((d) => {
        const isActive = active.indexOf(d) !== -1;
        return (
          <MenuItem
            key={d}
            label={DISTURBANCE_LABELS[d] ?? d}
            active={isActive}
            onClick={() => {
              toggleDisturbance({ affectationId: target.id, disturbance: d });
              onClose();
            }}
          />
        );
      })}
    </div>
  );
}

function MenuItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
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
        color: active ? colors.accent.danger : colors.text.primary,
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
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: active ? colors.accent.danger : 'transparent',
          border: `1px solid ${active ? colors.accent.danger : colors.border.default}`,
          flexShrink: 0,
        }}
      />
      {label}
    </button>
  );
}
