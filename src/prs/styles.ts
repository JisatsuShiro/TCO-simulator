// Helpers de style du poste PRS, alignés sur la maquette Claude Design.
// Module sans composant : le Fast Refresh de Vite exige qu'un fichier
// exportant des composants n'exporte rien d'autre.

import type { CSSProperties } from 'react';
import { prs, prsFont } from './theme';

/** Bouton carré du pupitre (Test aig, S 81, A.Sn.Di…). */
export function padButton(active: boolean, disabled = false): CSSProperties {
  return {
    // La hauteur vient de la grille qui l'accueille, celle des itinéraires.
    height: '100%',
    borderRadius: prs.radius.md,
    background: active ? prs.blue : prs.blueBg,
    border: `1px solid ${prs.borderBlue}`,
    color: active ? prs.bg : prs.blueText,
    font: `600 13px ${prsFont.ui}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    lineHeight: 1.25,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    padding: 0,
  };
}


/** Petit bouton secondaire (barre de pied de page, actions de panneau). */
export function actionButton(accent?: 'amber' | 'red'): CSSProperties {
  const border =
    accent === 'amber' ? prs.borderAmber : accent === 'red' ? prs.borderRed : prs.borderStrong;
  const color = accent === 'amber' ? prs.amber : accent === 'red' ? prs.redSoft : prs.text;
  return {
    background: prs.button,
    color,
    border: `1px solid ${border}`,
    borderRadius: prs.radius.md,
    padding: '9px 16px',
    font: `600 13px ${prsFont.ui}`,
    cursor: 'pointer',
  };
}

/** Bouton compact d'un panneau (bascules, sélections d'aiguille). */
export function chipButton(active: boolean, accent: string = prs.blue): CSSProperties {
  return {
    padding: '5px 10px',
    fontSize: 11.5,
    fontFamily: prsFont.mono,
    background: active ? accent : prs.inset,
    color: active ? prs.bg : prs.textDim,
    border: `1px solid ${active ? accent : prs.borderMid}`,
    borderRadius: prs.radius.sm,
    cursor: 'pointer',
    fontWeight: active ? 700 : 500,
  };
}

/** Liste déroulante, style maquette. */
export const selectStyle: CSSProperties = {
  background: prs.inset,
  color: prs.textDim,
  border: `1px solid ${prs.borderStrong}`,
  borderRadius: prs.radius.md,
  padding: '7px 10px',
  fontSize: 13,
  fontFamily: prsFont.ui,
  width: '100%',
};

export const hintStyle: CSSProperties = {
  margin: 0,
  fontSize: 11,
  lineHeight: '15px',
  color: prs.textFaint,
  fontFamily: prsFont.ui,
};
