// Graphique de circulation — le S.A.A.T. du poste de Springfield.
//
// Le poste d'origine l'affiche en haut à droite : un schéma simplifié de la
// gare, tracé en vert sur fond noir (`img/divers/saat.gif`), sur lequel six
// champs de saisie reçoivent le numéro du train présent ou attendu sur chaque
// tronçon. Le simulateur les remplit lui-même au fil des mouvements, et
// l'aiguilleur peut les corriger.
//
// Le cartouche sert deux fois. Au pupitre, il se saisit au clavier. Dans la
// fenêtre des imprimés, il se **désigne** : c'est un second exemplaire
// (`saatb`) que l'original pose à côté du Bulletin Cba, et dont chaque case
// remplit l'imprimé d'un clic.

import { useState } from 'react';
import { estEntree, SAAT_CELLS, setSaatCell } from './engine';
import type { PrsState, SaatCell } from './engine';
import type { ReactNode } from 'react';
import { Panel } from './ui';
import { prs, prsFont } from './theme';

/** Vert des tracés, repris du fond d'origine. */
const TRAIT = '#28a83c';

/**
 * Agrandissement du cartouche.
 *
 * Le relevé reste exprimé dans les 240 × 140 du GIF d'origine ; tout le reste
 * — cases comprises — en découle, pour que les proportions ne bougent pas.
 */
const ECHELLE = 1.6;
const LARGEUR = 240 * ECHELLE;
const HAUTEUR = 140 * ECHELLE;

/**
 * Position de chaque case sur le schéma, en unités du `viewBox`.
 *
 * Les cases sont posées **au-dessus** de leur voie plutôt que dessus : le
 * cartouche d'origine est un GIF opaque que les champs recouvrent, ici le tracé
 * doit rester lisible.
 */
const CASES: Record<SaatCell, { x: number; y: number }> = {
  vm: { x: 20, y: 2 },
  v1ag: { x: 24, y: 32 },
  v1n1: { x: 176, y: 32 },
  nu: { x: 176, y: 62 },
  v2dg: { x: 24, y: 92 },
  v2n2: { x: 176, y: 92 },
};

export interface PrsSaatProps {
  state: PrsState;
  onChange: (next: PrsState) => void;
  /**
   * Mode **désignation** : les cases cessent d'être des champs pour devenir
   * cliquables, et rendent la circulation qu'elles portent.
   *
   * C'est ainsi que l'original remplit le Bulletin Cba — chaque case de
   * `saatb` porte un `onfocus="rempautocba…()"` qui recopie le numéro et
   * désigne le signal devant lequel ce train est arrêté.
   */
  onPick?: (cell: SaatCell, num: string) => void;
  /**
   * Annonce d'une circulation à la main : un numéro saisi dans une case
   * **d'entrée** — voie 1 côté AG, voie 2 côté N2, voie NU, voie mère — puis
   * validé engage un train sur ce fil.
   *
   * Le poste d'origine ne l'offre pas : ses six cases sont de simples champs
   * que le trafic remplit. C'est un ajout, mais qui passe par la même porte —
   * le train engagé est en tout point celui qu'un scénario aurait créé.
   */
  onAnnoncer?: (cell: SaatCell, num: string) => void;
  /** Sans panneau ni titre : la fenêtre des imprimés porte les siens. */
  nu?: boolean;
}

export function PrsSaat({ state, onChange, onPick, onAnnoncer, nu }: PrsSaatProps) {
  // La case suivait-elle une circulation quand on s'y est mis ?
  //
  // C'est ce qui sépare l'annonce de la correction. Sur une case qui porte le
  // numéro d'un train en ligne, on ne peut que corriger — le trafic la
  // réécrira de toute façon au prochain mouvement. Ailleurs, Entrée annonce.
  // Le relevé se fait à la prise de focus, avant que la saisie ne l'efface.
  const [suiviAuFocus, setSuiviAuFocus] = useState(false);

  const cases = SAAT_CELLS.map((c) => {
    const num = state.saat[c.id];
    const style = {
      position: 'absolute' as const,
      left: CASES[c.id].x * ECHELLE,
      top: CASES[c.id].y * ECHELLE,
      width: 44 * ECHELLE,
      height: 18 * ECHELLE,
      background: 'rgba(4,7,11,.85)',
      border: `1px solid ${num ? prs.amber : 'rgba(40,168,60,.45)'}`,
      borderRadius: 2,
      color: num ? prs.amber : prs.textDim,
      font: `600 ${Math.round(11 * ECHELLE)}px ${prsFont.mono}`,
      textAlign: 'center' as const,
      padding: 0,
    };

    // En désignation, une case vide n'a personne à désigner.
    if (onPick) {
      return (
        <button
          key={c.id}
          type="button"
          onClick={num ? () => onPick(c.id, num) : undefined}
          disabled={!num}
          title={
            num
              ? `Remettre l'imprimé au ${num} — ${c.label.toLowerCase()}`
              : `${c.label} — aucune circulation`
          }
          aria-label={c.label}
          style={{
            ...style,
            cursor: num ? 'pointer' : 'default',
            borderColor: num ? prs.amber : 'rgba(40,168,60,.25)',
          }}
        >
          {num}
        </button>
      );
    }

    // Seules les quatre entrées du poste annoncent — voie 1 côté AG, voie 2
    // côté N2, voie NU, voie mère. Les deux autres cases sont des sorties.
    const entree = onAnnoncer !== undefined && estEntree(c.id);

    return (
      <input
        key={c.id}
        type="text"
        value={num}
        onChange={(e) => onChange(setSaatCell(state, c.id, e.target.value))}
        onFocus={() => setSuiviAuFocus(state.trains.some((t) => String(t.num) === num))}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || !entree || suiviAuFocus) return;
          e.preventDefault();
          e.currentTarget.blur();
          onAnnoncer(c.id, num);
        }}
        title={
          entree
            ? `${c.label} — numéro de circulation (${c.origine}). Entrée annonce la circulation saisie.`
            : `${c.label} — numéro de circulation (${c.origine})`
        }
        aria-label={c.label}
        style={style}
      />
    );
  });

  if (nu) return <Cartouche>{cases}</Cartouche>;

  return (
    <Panel title="Graphique de circulation" accent="neutral">
      <Cartouche>{cases}</Cartouche>
      {onAnnoncer && (
        // Le geste ne se devine pas : les cases ont toujours été de simples
        // champs. Une ligne suffit à le dire, sous le cartouche.
        <p
          style={{
            margin: '8px 0 0',
            font: `11.5px/16px ${prsFont.ui}`,
            color: prs.textFaint,
            maxWidth: LARGEUR,
          }}
        >
          Annoncer une circulation : son numéro dans une case d’arrivée — voie 1
          côté AG, voie 2 côté N2, voie NU, voie mère — puis <b>Entrée</b>.
        </p>
      )}
    </Panel>
  );
}

/** Le cartouche : le tracé de la gare, et les cases posées dessus. */
function Cartouche({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: 'relative',
        width: LARGEUR,
        height: HAUTEUR,
        background: '#04070b',
        border: `1px solid ${prs.borderMid}`,
        borderRadius: prs.radius.sm,
      }}
    >
      <svg
        viewBox="0 0 240 140"
        width={LARGEUR}
        height={HAUTEUR}
        style={{ position: 'absolute', inset: 0, display: 'block' }}
        aria-hidden="true"
      >
        <g stroke={TRAIT} strokeWidth={2} fill="none">
          {/* Voie mère et son raccordement sur la voie 1. */}
          <path d="M14 26 L72 26 L115 56" />
          {/* Voie 1, de bout en bout. */}
          <path d="M14 56 L226 56" />
          {/* Descente de la voie 1 vers la voie NU. Elle est plus raide que
              le raccordement précédent : au tracé d'origine les deux obliques
              ne sont pas alignées, sans quoi elles se liraient comme une
              seule et longue coupure en travers de la voie 1. */}
          <path d="M115 56 L143 86 L226 86" />
          {/* Voie 2 et sa montée vers la NU. */}
          <path d="M14 116 L226 116" />
          <path d="M115 116 L143 86" />
        </g>
      </svg>
      {children}
    </div>
  );
}
