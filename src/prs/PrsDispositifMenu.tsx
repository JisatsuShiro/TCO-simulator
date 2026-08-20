// Menu contextuel de pose et de retrait des dispositifs.
//
// Un clic droit sur un bouton d'itinéraire ouvre ce menu à la position du
// curseur : trois dispositifs, chacun avec sa pose et son retrait, et le
// compte actuellement porté par le bouton.
//
// Le poste d'origine s'y prend autrement : le menu « Dispositifs divers »
// arme un **mode** (`dispda()` pose `da = 1` ou `dr = 1`), et le prochain
// appui sur un bouton d'itinéraire y pose ou retire un dispositif au lieu de
// commander l'itinéraire. C'est un détour hérité d'une interface sans clic
// droit : le mode reste armé, et l'aiguilleur doit penser à le désarmer.
// Le clic droit désigne directement le bouton visé — le mode reste porté par
// le moteur, il n'est simplement plus le seul chemin.
//
// Le plafond est **commun aux trois** : `magnida()` fait
// `dar1 = disp1 + dispr1; if (dar1 > 4) {disp1--;}`.

import { useEffect, useRef } from 'react';
import { DISPOSITIF_LABELS, DISPOSITIF_MAX, dispositifsPoses } from './engine';
import type { DispositifKind, PrsState } from './engine';
import { ROUTE_BY_ID, routeFullLabel } from './topology';
import type { RouteId } from './topology';
import { prs, prsFont } from './theme';

export interface DispositifMenuState {
  route: RouteId;
  x: number;
  y: number;
}

export interface PrsDispositifMenuProps {
  menu: DispositifMenuState;
  state: PrsState;
  onChange: (id: RouteId, kind: DispositifKind, delta: 1 | -1) => void;
  onClose: () => void;
}

const ORDRE: DispositifKind[] = ['da', 'dr', 'dsa'];

/** Teinte de chaque dispositif, la même que sur la pastille du bouton. */
const TEINTE: Record<DispositifKind, string> = {
  da: '#2b6cb0',
  dr: '#a9660b',
  dsa: '#2f7a5b',
};

export function PrsDispositifMenu({ menu, state, onChange, onClose }: PrsDispositifMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  // La page se re-rend à chaque tick d'horloge ; on garde une référence stable
  // vers la fermeture pour que les écouteurs ne soient pas reposés sans cesse.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  // Fermeture au clic ailleurs, au clic droit ailleurs, ou sur Échap. Les
  // écouteurs sont posés **au tick suivant** : sans ce délai, l'effet
  // s'exécute pendant que l'événement d'ouverture remonte encore vers
  // `window`, et le menu se referme sans jamais s'afficher.
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

  const total = dispositifsPoses(state, menu.route);
  const plein = total >= DISPOSITIF_MAX;

  return (
    <div
      ref={ref}
      role="menu"
      style={{
        position: 'fixed',
        left: Math.min(menu.x + 2, window.innerWidth - 280),
        top: Math.min(menu.y + 2, window.innerHeight - 240),
        zIndex: 60,
        minWidth: 240,
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
        {routeFullLabel(ROUTE_BY_ID[menu.route])}
      </div>

      {ORDRE.map((kind) => {
        const n = state[kind][menu.route];
        return (
          <div
            key={kind}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 8px 2px 6px' }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: TEINTE[kind],
                flex: '0 0 auto',
              }}
            />
            <span
              style={{
                flex: 1,
                font: `13px ${prsFont.ui}`,
                color: n > 0 ? prs.text : prs.textDim,
              }}
            >
              {DISPOSITIF_LABELS[kind]}
              {n > 0 && (
                <span style={{ fontFamily: prsFont.mono, color: prs.textFaint }}> × {n}</span>
              )}
            </span>
            <button
              type="button"
              role="menuitem"
              onClick={() => onChange(menu.route, kind, -1)}
              disabled={n === 0}
              title={`Retirer un ${DISPOSITIF_LABELS[kind]}`}
              style={pas(n === 0)}
            >
              −
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => onChange(menu.route, kind, 1)}
              disabled={plein}
              title={
                plein
                  ? `Maximum de ${DISPOSITIF_MAX} dispositifs atteint sur ce bouton`
                  : `Poser un ${DISPOSITIF_LABELS[kind]}`
              }
              style={pas(plein)}
            >
              +
            </button>
          </div>
        );
      })}

      <div style={{ height: 1, background: prs.border, margin: '6px 4px 4px' }} />
      <div
        style={{
          font: `11px ${prsFont.mono}`,
          color: plein ? prs.amber : prs.textFaint,
          padding: '2px 8px 5px',
        }}
      >
        {total} / {DISPOSITIF_MAX} posés
      </div>
    </div>
  );
}

/** Bouton « + » ou « − », grisé quand la manœuvre n'est pas possible. */
const pas = (inactif: boolean) =>
  ({
    width: 26,
    height: 24,
    borderRadius: prs.radius.sm,
    background: inactif ? 'transparent' : prs.button,
    border: `1px solid ${inactif ? prs.border : prs.borderStrong}`,
    color: inactif ? prs.textFaint : prs.text,
    font: `600 15px/1 ${prsFont.mono}`,
    cursor: inactif ? 'default' : 'pointer',
    opacity: inactif ? 0.45 : 1,
  }) as const;
