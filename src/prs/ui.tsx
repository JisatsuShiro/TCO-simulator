// Primitives de mise en page des panneaux du poste PRS.
//
// Reprend le vocabulaire de la maquette : un panneau est une surface
// `prs.panel` arrondie, coiffée d'une « puce » de titre colorée suivie d'un
// filet horizontal. Les helpers de style vivent dans `./styles`.

import type { ReactNode } from 'react';
import { prs, prsFont } from './theme';

export type PanelAccent = 'blue' | 'amber' | 'neutral';

const ACCENT: Record<PanelAccent, { fg: string; border: string }> = {
  blue: { fg: prs.blue, border: 'rgba(143,184,232,.35)' },
  amber: { fg: prs.amber, border: 'rgba(240,180,90,.35)' },
  neutral: { fg: prs.textDim, border: prs.borderMid },
};

export function Panel({
  title,
  accent = 'neutral',
  aside,
  grow,
  children,
}: {
  title: string;
  accent?: PanelAccent;
  aside?: ReactNode;
  /** Occupe l'espace restant dans une rangée flex. */
  grow?: boolean;
  children: ReactNode;
}) {
  const a = ACCENT[accent];
  return (
    <section
      style={{
        background: prs.panel,
        border: `1px solid ${prs.border}`,
        borderRadius: prs.radius.lg,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        ...(grow ? { flex: 1, minWidth: 0 } : null),
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            background: prs.inset,
            border: `1px solid ${a.border}`,
            borderRadius: prs.radius.md,
            padding: '5px 12px',
            font: `600 13px ${prsFont.ui}`,
            color: a.fg,
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </div>
        <div style={{ flex: 1, height: 1, background: prs.border }} />
        {aside}
      </header>
      {children}
    </section>
  );
}

/** Petite étiquette de section à l'intérieur d'un panneau. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        color: prs.textFaint,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        fontFamily: prsFont.ui,
      }}
    >
      {children}
    </span>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <FieldLabel>{label}</FieldLabel>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {children}
      </div>
    </div>
  );
}
