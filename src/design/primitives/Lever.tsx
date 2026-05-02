// Levier de poste d'aiguillage — primitive métallique skeuomorphique.
//
// État binaire : `plus` (manche en haut, idle) / `minus` (manche en bas, actif).
// Le manche pivote autour du pivot central du boîtier.
//
// Animation de refus didactique : si le levier ne peut pas basculer
// (enclenchement bloqué), le manche tente la rotation, bute, oscille,
// revient. C'est l'expérience signature de gessieWeb — voir spec UX
// "Expérience signature : le levier qui bute".
//
// Le composant ne consulte pas Zustand : le parent détecte le refus
// (pattern `setTimeout(0)`) et passe la prop `refused` qui déclenche
// l'animation locale via Web Animations API.

import { useEffect, useRef } from 'react';
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
  onClick: () => void;
}

const BOX_WIDTH = 40;
const BOX_HEIGHT = 76;
const SHAFT_WIDTH = 5;
const SHAFT_HEIGHT = 26;
const KNOB_SIZE = 13;

// Décalage angulaire du "buttage" : ~30 % de la rotation cible (180°).
const REFUSE_ANGLE_DELTA = 54;

export function Lever({ id, num, label, position, refused = false, disabled = false, onClick }: LeverProps) {
  const shaftRef = useRef<HTMLDivElement>(null);

  // Animation de refus déclenchée par la transition false→true de `refused`.
  // Web Animations API native, pas de dépendance externe.
  useEffect(() => {
    if (!refused || !shaftRef.current) return;
    const baseAngle = position === 'plus' ? 0 : 180;
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

  const baseAngle = position === 'plus' ? 0 : 180;
  const ariaLabel = `Levier ${num} ${label}, position ${position === 'plus' ? 'haute' : 'basse'}`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
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
        width: BOX_WIDTH + 18,
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
          overflow: 'hidden',
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
          {/* Tête sphérique du manche, à l'extrémité du shaft */}
          <div
            style={{
              position: 'absolute',
              top: -KNOB_SIZE * 0.6,
              left: '50%',
              transform: 'translateX(-50%)',
              width: KNOB_SIZE,
              height: KNOB_SIZE,
              borderRadius: '50%',
              background: `radial-gradient(circle at 35% 30%, ${colors.metal.knobShine} 0%, ${colors.metal.knob} 55%, ${colors.metal.base} 100%)`,
              boxShadow: shadows.metallicKnob,
            }}
          />
        </div>
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
          maxWidth: BOX_WIDTH + 18,
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
    </button>
  );
}
