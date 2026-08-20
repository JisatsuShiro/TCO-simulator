// Fiche de situation de travail (« T.S.T. ») d'un scénario, en fenêtre.
//
// Le bouton `btst`, à côté du sélecteur de scénario, appelle `ftst()` :
//
//   if (tsc==1)  {open("doc/tst/scenar1.html","target_blank","");}
//   …
//   if (tsc==94) {open("doc/tst/scenarsn4.html","target_blank","");}
//
// Chacune de ces pages ne contient qu'une planche scannée : le **graphique de
// circulation prévu**, numéro par numéro — heure et itinéraire, sens impair à
// gauche, sens pair à droite. C'est le document sur lequel l'aiguilleur
// travaille : sans lui, il découvre les circulations au fur et à mesure.
//
// Les planches sont ici transcrites (`./tst`) et rendues en tableau plutôt
// qu'affichées en image : le texte reste lisible à toute taille, se
// sélectionne, et suit le thème du poste.
//
// Et l'itinéraire cède la place aux **deux voies** — celle par laquelle la
// circulation arrive, celle vers laquelle elle repart. `AG-N1` ne dit rien de
// plus que le bouton du pupitre ; « voie 1 → voie 1 » dit que le train passe
// tout droit, et « voie 1 → voie centrale » qu'il faut le garer. La traduction
// est en table dans `./tst` (`VOIES`).

import { Fragment, useEffect, useRef } from 'react';
import { SCENARIO_BY_ID } from './scenarios';
import { rangees, TST, VOIES } from './tst';
import type { TstFiche, TstLigne } from './tst';
import { prs, prsFont } from './theme';

export interface PrsFicheProps {
  /** Identifiant du scénario en cours. */
  id: string;
  onClose: () => void;
}

export function PrsFiche({ id, onClose }: PrsFicheProps) {
  // La page se re-rend à chaque tick d'horloge ; on garde une référence stable
  // vers la fermeture pour que l'écouteur ne soit pas reposé sans cesse.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const def = SCENARIO_BY_ID[id];
  const fiche = TST[id];
  if (!def || !fiche) return null;

  // L'astérisque ne se met qu'en face d'une ligne qui la porte : le renvoi des
  // planches 11 et 92 désigne l'évolution, celui des 93 et 94 explique une
  // absence et ne renvoie à rien.
  const renvoi = [...fiche.impair, ...fiche.pair].some((r) => r.num.includes('*'));

  const debut = `${String(def.start.h).padStart(2, '0')}h${String(def.start.m).padStart(2, '0')}`;

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'rgba(4,7,11,.62)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        overflowY: 'auto',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Fiche de situation de travail — ${def.label}`}
        style={{
          width: 'min(1040px, 100%)',
          maxHeight: '100%',
          overflowY: 'auto',
          background: prs.panel,
          border: `1px solid ${prs.borderAmber}`,
          borderRadius: prs.radius.md,
          boxShadow: '0 18px 50px rgba(0,0,0,.55)',
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div
          style={{
            font: `600 12px ${prsFont.mono}`,
            color: prs.amber,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          Situation de travail — {def.label}
        </div>
        <p style={{ margin: 0, font: `12px/17px ${prsFont.ui}`, color: prs.textFaint }}>
          Graphique de circulation prévu : {def.hint.toLowerCase()}. Prise de service à {debut}.
        </p>

        <Graphique fiche={fiche} />

        {fiche.note && (
          <p style={{ margin: 0, font: `11.5px ${prsFont.ui}`, color: prs.textFaint }}>
            {renvoi && '* '}
            {fiche.note}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '7px 14px',
              borderRadius: prs.radius.sm,
              background: 'transparent',
              border: `1px solid ${prs.borderStrong}`,
              color: prs.textDim,
              font: `13px ${prsFont.ui}`,
              cursor: 'pointer',
            }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Le graphique : un seul tableau, l'heure au milieu.
 *
 * La planche d'origine en tient deux côte à côte, chacun avec sa colonne
 * d'heures, et aligne les lignes en laissant des cases vides. Une colonne
 * d'heures unique dit la même chose : ce qui se présente à cette minute-là, et
 * dans quel sens.
 */
function Graphique({ fiche }: { fiche: TstFiche }) {
  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
        font: `12.5px ${prsFont.mono}`,
        color: prs.text,
      }}
    >
      {/* Largeurs figées : les deux moitiés doivent se répondre, sinon le sens
          qui porte le libellé le plus long élargit son côté. */}
      <colgroup>
        <col style={{ width: '13%' }} />
        <col style={{ width: '13%' }} />
        <col style={{ width: '19%' }} />
        <col style={{ width: '10%' }} />
        <col style={{ width: '13%' }} />
        <col style={{ width: '13%' }} />
        <col style={{ width: '19%' }} />
      </colgroup>
      <thead>
        <tr>
          <th style={{ ...th, ...sens }} colSpan={3}>
            Sens impair
          </th>
          <th style={{ ...th, ...colHeure }} rowSpan={2}>
            Heure
          </th>
          <th style={{ ...th, ...sens }} colSpan={3}>
            Sens pair
          </th>
        </tr>
        <tr>
          {['impair', 'pair'].map((s) => (
            <Fragment key={s}>
              <th style={th}>Train n°</th>
              <th style={th}>Arrive par</th>
              <th style={th}>Se dirige vers</th>
            </Fragment>
          ))}
        </tr>
      </thead>
      <tbody>
        {rangees(fiche).map((r, i) => (
          <tr key={`${r.heure}-${r.impair?.num ?? ''}-${r.pair?.num ?? ''}-${i}`}>
            <Demi ligne={r.impair} />
            <td style={{ ...td, ...colHeure, fontWeight: 700 }}>{r.heure}</td>
            <Demi ligne={r.pair} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Une moitié de ligne : la circulation d'un sens, ou trois cases vides. */
function Demi({ ligne }: { ligne?: TstLigne }) {
  // La planche écrit l'itinéraire ; l'aiguilleur, lui, a besoin des deux voies.
  // Un itinéraire hors table se lirait tel quel plutôt que de disparaître.
  const v = ligne && VOIES[ligne.itineraire];
  return (
    <>
      <td style={{ ...td, color: prs.amber, fontWeight: 700 }}>{ligne?.num ?? ''}</td>
      <td style={voie}>{v ? v.de : (ligne?.itineraire ?? '')}</td>
      <td style={voie}>{v?.vers ?? ''}</td>
    </>
  );
}

const th = {
  border: `1px solid ${prs.borderMid}`,
  background: prs.inset,
  padding: '5px 8px',
  font: `600 11px ${prsFont.ui}`,
  color: prs.textFaint,
  textAlign: 'center',
  whiteSpace: 'nowrap',
} as const;

const td = {
  border: `1px solid ${prs.border}`,
  padding: '4px 8px',
  textAlign: 'center',
  whiteSpace: 'nowrap',
} as const;

/** Une voie : lue en clair, et alignée à gauche pour se comparer d'une ligne à l'autre. */
const voie = {
  ...td,
  textAlign: 'left',
  fontFamily: prsFont.ui,
  color: prs.textDim,
} as const;

/** L'en-tête d'un sens, qui coiffe ses trois colonnes. */
const sens = {
  font: `600 12px ${prsFont.ui}`,
  color: prs.textDim,
  letterSpacing: 0.4,
  textTransform: 'none',
} as const;

/** La colonne d'heures : l'axe du graphique, détaché des deux sens. */
const colHeure = {
  background: prs.inset,
  borderLeft: `1px solid ${prs.borderMid}`,
  borderRight: `1px solid ${prs.borderMid}`,
  color: prs.text,
} as const;
