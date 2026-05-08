// Wrapper standard d'un panel d'opérateur.
//
// Fournit la structure visuelle commune à tous les panels :
//   - bandeau d'en-tête `<header>` avec titre + zone meta optionnelle
//   - corps `<div>` qui contient les enfants (boutons, listes, formulaires)
//
// Pas de logique métier ici. Les panels existants conservent leurs sélecteurs
// Zustand et viennent simplement habiller leur contenu avec ce wrapper.
//
// `scroll` activable pour les panels longs (Blocs, ATR, Trains avec events).
// Quand `scroll` est vrai, on applique `maxHeight` (par défaut 220 px,
// override possible) + `overflowY: auto`.

import type { CSSProperties, ReactNode } from 'react';
import { colors, spacing, typography } from '../tokens';

interface Props {
  /**
   * Titre du panel. `string` pour le cas usuel (libellé), `ReactNode` quand
   * un panel veut composer une UI riche en place du titre — typiquement
   * une rangée d'onglets (cf. `LeversPanel`).
   */
  title: ReactNode;
  /** Élément(s) affiché(s) à droite du titre (compteurs, méta). */
  meta?: ReactNode;
  /** Active le scroll vertical avec maxHeight (par défaut 220 px). */
  scroll?: boolean;
  maxHeight?: number;
  /** Override du gap interne entre enfants. Défaut spacing.xs. */
  bodyGap?: number;
  /** Override du padding du corps. Défaut spacing.sm. */
  padding?: number;
  /**
   * Direction du flexbox du corps. Défaut 'column' (panels classiques).
   * `'row'` pour les panels denses qui s'étalent (Trains, SimControls).
   */
  bodyDirection?: 'row' | 'column';
  /**
   * Alignement des enfants dans le corps. `'start'` (défaut) colle au début,
   * `'center'` centre sur les deux axes (utile pour les panels exposant
   * un contenu visuel comme la rangée des leviers).
   */
  bodyAlign?: 'start' | 'center';
  children: ReactNode;
}

export function Panel({
  title,
  meta,
  scroll = false,
  maxHeight = 220,
  bodyGap,
  padding = spacing.sm,
  bodyDirection = 'column',
  bodyAlign = 'start',
  children,
}: Props) {
  const wrapperStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    background: colors.surface.dark,
    color: colors.text.primary,
    borderTop: `1px solid ${colors.border.subtle}`,
    fontFamily: typography.ui.family,
    fontSize: typography.size.sm,
  };

  const headerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    padding: `${spacing.xs}px ${padding}px`,
    background: colors.surface.medium,
    borderBottom: `1px solid ${colors.border.subtle}`,
  };

  const bodyStyle: CSSProperties = {
    display: 'flex',
    flexDirection: bodyDirection,
    flexWrap: bodyDirection === 'row' ? 'wrap' : undefined,
    gap: bodyGap ?? (bodyDirection === 'row' ? spacing.sm : spacing.xs),
    padding,
    ...(bodyAlign === 'center'
      ? {
          justifyContent: 'center',
          alignItems: 'center',
          alignContent: 'center',
        }
      : {}),
    ...(scroll
      ? { maxHeight, overflowY: 'auto' as const }
      : {}),
  };

  return (
    <section style={wrapperStyle}>
      <header style={headerStyle}>
        {typeof title === 'string' ? (
          <span
            style={{
              fontWeight: typography.weight.semibold,
              color: colors.text.primary,
              fontSize: typography.size.sm,
              letterSpacing: 0.2,
            }}
          >
            {title}
          </span>
        ) : (
          // Title custom (rangée d'onglets, contrôles…) — pas d'enrobage
          // pour laisser le panel composer sa propre apparence.
          title
        )}
        {meta != null && (
          <span style={{ color: colors.text.secondary, fontSize: typography.size.xs }}>
            {meta}
          </span>
        )}
      </header>
      <div style={bodyStyle}>{children}</div>
    </section>
  );
}
