// Levier de poste d'aiguillage — primitive métallique skeuomorphique.
//
// État binaire : `plus` (manche en haut, idle) / `minus` (manche basculé à
// droite à 90°, actif). Le manche pivote autour du pivot central du boîtier.
// Convention "tip to the side" — bascule horizontale plutôt que verticale,
// proche du geste réel d'un opérateur PRS qui tire le manche vers lui.
//
// Animation de refus didactique : si le levier ne peut pas basculer
// (enclenchement bloqué), le manche tente la rotation, bute, oscille,
// revient. C'est l'expérience signature de Voie Libre — voir spec UX
// "Expérience signature : le levier qui bute".
//
// Le composant ne consulte pas Zustand : le parent détecte le refus
// (pattern `setTimeout(0)`) et passe la prop `refused` qui déclenche
// l'animation locale via Web Animations API.

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { colors, motion, shadows, typography } from '../tokens';

interface LeverProps {
  /** Identifiant unique pour aria et key React. */
  id: string;
  /** Préfixe affiché sous le boîtier (typiquement le numéro = `lever.id`). */
  num: string;
  /** Étiquette principale (typiquement les affectations jointes). */
  label: string;
  /** Position courante du levier. */
  position: 'plus' | 'minus';
  /** True le temps d'une animation de refus. Le parent doit reset à false ensuite. */
  refused?: boolean;
  /** Désactive le levier (mode Édition par exemple). */
  disabled?: boolean;
  /**
   * Slot rendu dans le bas du boîtier — destiné aux serrures (`KeyHole`
   * variant `embedded`) intégrées à la plaque du levier, à la manière d'un
   * vrai poste PRS. La zone est en dessous du pivot, donc jamais traversée
   * par le manche.
   */
  keyholeSlot?: ReactNode;
  /**
   * Couleurs à appliquer sur la tête sphérique du manche (dispositifs
   * d'attention). Si vide / undefined, on garde le rendu métallique. Si une
   * seule couleur, la tête prend cette couleur uniformément. Si plusieurs,
   * on les empile en bandes horizontales (linear-gradient à hard-stops).
   * Reproduit visuellement les manchons colorés que l'opérateur place sur
   * un levier au PRS pour signaler son attention (DA / DSA / DR).
   */
  knobColors?: string[];
  onClick: () => void;
}

const BOX_WIDTH = 32;
const BOX_HEIGHT = 76;
const SHAFT_WIDTH = 5;
const SHAFT_HEIGHT = 26;
const KNOB_SIZE = 13;

// Plus = 0° (manche vertical haut), minus = 90° (manche basculé à droite).
const PLUS_ANGLE = 0;
const MINUS_ANGLE = 90;
// Décalage angulaire du "buttage" : ~30 % de la rotation cible (90°).
const REFUSE_ANGLE_DELTA = 27;

/**
 * Construit le `background` CSS de la tête du manche selon les dispositifs
 * actifs. Vide → gradient métallique. 1 couleur → solid. N couleurs →
 * bandes horizontales (linear-gradient bottom-up à hard-stops, masquées par
 * la border-radius circulaire). Une "lueur" radiale légère est superposée
 * via box-shadow `inset` (cf. site d'utilisation) pour préserver le 3D.
 */
function knobBackground(knobColors: string[] | undefined): string {
  if (!knobColors || knobColors.length === 0) {
    return `radial-gradient(circle at 35% 30%, ${colors.metal.knobShine} 0%, ${colors.metal.knob} 55%, ${colors.metal.base} 100%)`;
  }
  if (knobColors.length === 1) return knobColors[0];
  const step = 100 / knobColors.length;
  // Bottom-up : `linear-gradient(0deg)` met la première couleur en bas.
  // On préfère placer la première couleur en haut → 180deg (top-down).
  const stops = knobColors
    .map((c, i) => `${c} ${(i * step).toFixed(2)}%, ${c} ${((i + 1) * step).toFixed(2)}%`)
    .join(', ');
  return `linear-gradient(180deg, ${stops})`;
}

export function Lever({ id, num, label, position, refused = false, disabled = false, keyholeSlot, knobColors, onClick }: LeverProps) {
  const shaftRef = useRef<HTMLDivElement>(null);

  // Animation de refus déclenchée par la transition false→true de `refused`.
  // Web Animations API native, pas de dépendance externe.
  useEffect(() => {
    if (!refused || !shaftRef.current) return;
    const baseAngle = position === 'plus' ? PLUS_ANGLE : MINUS_ANGLE;
    const refuseAngle = baseAngle + REFUSE_ANGLE_DELTA;
    const anim = shaftRef.current.animate(
      [
        { transform: `rotate(${baseAngle}deg)`, offset: 0 },
        { transform: `rotate(${refuseAngle}deg)`, offset: 0.21 },
        { transform: `rotate(${refuseAngle}deg)`, offset: 0.30 },
        { transform: `rotate(${refuseAngle - 6}deg)`, offset: 0.36 },
        { transform: `rotate(${refuseAngle}deg)`, offset: 0.42 },
        { transform: `rotate(${refuseAngle - 4}deg)`, offset: 0.48 },
        { transform: `rotate(${baseAngle}deg)`, offset: 1 },
      ],
      {
        duration: motion.duration.slow,
        easing: motion.easing.bumpStop,
      },
    );
    return () => anim.cancel();
  }, [refused, position]);

  const baseAngle = position === 'plus' ? PLUS_ANGLE : MINUS_ANGLE;
  const ariaLabel = `Levier ${num} ${label}, position ${position === 'plus' ? 'haute' : 'basculée'}`;

  // On utilise `<div role="button">` plutôt qu'un vrai `<button>` parce que
  // le slot serrures (`keyholeSlot`) rend lui-même des `<button>` (KeyHole),
  // et un `<button>` imbriqué dans un `<button>` est du HTML invalide. Le
  // div mime un bouton via role + tabIndex + clavier (Espace/Entrée).
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onClick}
      onKeyDown={handleKeyDown}
      aria-disabled={disabled || undefined}
      aria-label={ariaLabel}
      aria-pressed={position === 'minus'}
      title={label}
      style={{
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 5,
        opacity: disabled ? 0.5 : 1,
        fontFamily: typography.ui.family,
        // Largeur fixe pour que tous les leviers aient la même empreinte
        // horizontale, indépendamment de la longueur du label. Garantit un
        // gap visuel constant entre boîtiers métalliques quand on les met
        // côte à côte.
        width: BOX_WIDTH + 6,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: BOX_WIDTH,
          height: BOX_HEIGHT,
          background: `linear-gradient(180deg, ${colors.metal.highlight} 0%, ${colors.metal.base} 45%, ${colors.metal.deep} 80%, ${colors.metal.shadow} 100%)`,
          borderRadius: 5,
          border: `1px solid ${colors.metal.shadow}`,
          boxShadow: shadows.metallicOuter,
          position: 'relative',
          // Pas de `overflow: hidden` : avec minus à 90° (manche horizontal),
          // la tête sphérique dépasse légèrement la bordure droite — on laisse
          // le débordement visible pour ne pas la rogner.
        }}
      >
        {/* Pivot central */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 6,
            height: 6,
            marginLeft: -3,
            marginTop: -3,
            background: colors.metal.shadow,
            borderRadius: '50%',
            boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.6)',
          }}
        />

        {/* Manche pivotant — base "up" (rotate(0deg)), bottom du shaft = pivot */}
        <div
          ref={shaftRef}
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '50%',
            marginLeft: -(SHAFT_WIDTH / 2),
            width: SHAFT_WIDTH,
            height: SHAFT_HEIGHT,
            background: `linear-gradient(180deg, ${colors.metal.knobShine} 0%, ${colors.metal.knob} 50%, ${colors.metal.base} 100%)`,
            borderRadius: SHAFT_WIDTH / 2,
            transformOrigin: 'bottom center',
            transform: `rotate(${baseAngle}deg)`,
            transition: `transform ${motion.duration.normal}ms ${motion.easing.easeInOut}`,
            zIndex: 2,
          }}
        >
          {/* Tête sphérique du manche, à l'extrémité du shaft. Quand des
              dispositifs d'attention sont actifs, la tête prend leur couleur
              (DA rouge / DR jaune / DSA bleu) ; on superpose un highlight
              radial via `box-shadow inset` pour préserver le rendu sphérique. */}
          <div
            style={{
              position: 'absolute',
              top: -KNOB_SIZE * 0.6,
              left: '50%',
              transform: 'translateX(-50%)',
              width: KNOB_SIZE,
              height: KNOB_SIZE,
              borderRadius: '50%',
              background: knobBackground(knobColors),
              boxShadow:
                knobColors && knobColors.length > 0
                  ? `${shadows.metallicKnob}, inset 1.5px 1.5px 2px rgba(255,255,255,0.45), inset -1px -1px 2px rgba(0,0,0,0.35)`
                  : shadows.metallicKnob,
            }}
          />
        </div>

        {/* Slot serrures intégrées : positionné dans la moitié basse de la
            plaque, sous le pivot — jamais traversé par le manche (plus = haut,
            minus = droite). Le parent y rend une `LeverKeyholeStrip`.
            On stoppe la propagation des clics : les serrures sont des
            `<button>` imbriqués dans le `<button>` du levier, donc un clic
            sur une serrure remonterait sinon jusqu'à `onClick` du levier
            et déclencherait `toggleLever` en plus de `takeKey`/`putKey`. */}
        {keyholeSlot && (
          <div
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 4,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 2,
              zIndex: 1,
            }}
          >
            {keyholeSlot}
          </div>
        )}
      </div>

      {/* Étiquette deux lignes : numéro de levier puis affectations contrôlées.
          minHeight fixe pour que tous les leviers aient la même empreinte
          verticale même quand le texte des affectations tient sur moins de
          lignes (sans cela les leviers à label court et les leviers à label
          long ont des hauteurs différentes, cassant l'alignement entre rangées). */}
      <span
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1,
          fontFamily: typography.mono.family,
          textAlign: 'center',
          letterSpacing: '-0.02em',
          maxWidth: BOX_WIDTH + 6,
          minHeight: 56,
        }}
      >
        <span
          style={{
            color: colors.text.secondary,
            fontSize: 12,
            fontWeight: typography.weight.semibold,
            lineHeight: '14px',
          }}
        >
          {num}
        </span>
        <span
          style={{
            color: colors.text.primary,
            fontSize: 11,
            fontWeight: typography.weight.medium,
            lineHeight: '13px',
            wordBreak: 'break-word',
          }}
        >
          {label}
        </span>
      </span>

      {/* `id` exposé via data-attribute pour les hooks de test ou d'inspection. */}
      <span hidden data-lever-id={id} />
    </div>
  );
}
