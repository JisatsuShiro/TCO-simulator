// Menu contextuel des dérangements du TCO.
//
// Un clic droit sur une pastille de zone, une aiguille ou un signal ouvre ce
// menu à la position du curseur : il liste les dérangements applicables à cet
// élément — les mêmes que ceux du menu `forme` de `gaestro.html` (§8 de la
// spec) — et permet de retirer celui qui est actif.
//
// Le poste ne tient qu'**un seul dérangement par famille** (zone, aiguille,
// signal, itinéraire), comme l'original : poser un dérangement de zone en
// remplace un autre.

import { useEffect, useRef } from 'react';
import { faultTargetLabel } from './engine';
import type { FaultOption, FaultTarget } from './engine';
import { prs, prsFont } from './theme';

export interface FaultMenuState {
  target: FaultTarget;
  x: number;
  y: number;
}

export interface PrsFaultMenuProps {
  menu: FaultMenuState;
  options: FaultOption[];
  /** Un dérangement porte déjà sur cet élément. */
  hasFault: boolean;
  onPick: (option: FaultOption) => void;
  onClear: () => void;
  onClose: () => void;
}

export function PrsFaultMenu({
  menu,
  options,
  hasFault,
  onPick,
  onClear,
  onClose,
}: PrsFaultMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  // La page se re-rend à chaque tick d'horloge ; on garde une référence stable
  // vers la fermeture pour que les écouteurs ne soient pas reposés sans cesse.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  // Fermeture au clic ailleurs, au clic droit ailleurs, ou sur Échap.
  //
  // Les écouteurs sont posés **au tick suivant** : `contextmenu` est un
  // événement discret, que React traite de façon synchrone. Sans ce délai,
  // l'effet s'exécute pendant que l'événement d'ouverture remonte encore vers
  // `window`, et le menu se referme dans la foulée sans jamais s'afficher.
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close.current();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    const attach = () => {
      window.addEventListener('mousedown', away);
      window.addEventListener('contextmenu', away);
    };
    const h = window.setTimeout(attach, 0);
    window.addEventListener('keydown', key);
    return () => {
      window.clearTimeout(h);
      window.removeEventListener('mousedown', away);
      window.removeEventListener('contextmenu', away);
      window.removeEventListener('keydown', key);
    };
  }, []);

  return (
    <div
      ref={ref}
      role="menu"
      style={{
        position: 'fixed',
        // On décale d'un pixel pour que le curseur ne soit pas déjà « dedans ».
        left: Math.min(menu.x + 2, window.innerWidth - 320),
        top: Math.min(menu.y + 2, window.innerHeight - 180),
        zIndex: 60,
        minWidth: 260,
        background: prs.panel,
        border: `1px solid ${prs.borderStrong}`,
        borderRadius: prs.radius.md,
        boxShadow: '0 10px 30px rgba(0,0,0,.45)',
        padding: 5,
      }}
    >
      <div
        style={{
          font: `600 11px ${prsFont.mono}`,
          color: prs.textFaint,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          padding: '5px 8px 7px',
        }}
      >
        {faultTargetLabel(menu.target)}
      </div>

      {options.length === 0 ? (
        <div style={{ ...itemStyle, color: prs.textFaint, cursor: 'default' }}>
          Aucun dérangement prévu pour cet élément
        </div>
      ) : (
        options.map((o) => (
          <button
            key={o.label}
            type="button"
            role="menuitem"
            onClick={() => onPick(o)}
            style={{
              ...itemStyle,
              color: o.active ? prs.amberSoft : prs.textDim,
              background: o.active ? prs.amberBg : 'transparent',
            }}
          >
            {o.label}
          </button>
        ))
      )}

      {hasFault && (
        <>
          <div style={{ height: 1, background: prs.border, margin: '5px 4px' }} />
          <button
            type="button"
            role="menuitem"
            onClick={onClear}
            style={{ ...itemStyle, color: prs.redSoft }}
          >
            Retirer le dérangement
          </button>
        </>
      )}
    </div>
  );
}

const itemStyle = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  background: 'transparent',
  border: 'none',
  borderRadius: prs.radius.sm,
  padding: '7px 8px',
  font: `13px ${prsFont.ui}`,
  cursor: 'pointer',
} as const;
