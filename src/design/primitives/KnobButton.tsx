// Commutateur FC (Fermeture Carré) — bouton rond métallique.
//
// Indicateur central rectangulaire qui pivote de 45° quand le commutateur
// est actif. Pas d'animation de refus : la sim Gessie n'a pas
// d'enclenchement sur les FC (toggleCommutFC n'a aucune garde au-delà de
// "le signal possède-t-il un FC"), donc il n'y a jamais de cas pratique
// à animer. La prop `refused` reste exposée pour cohérence d'API mais
// déclenche seulement un flash discret de la bordure si jamais utilisée.

import { colors, motion, shadows, typography } from '../tokens';

interface KnobButtonProps {
  id: string;
  active: boolean;
  label: string;
  refused?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

const KNOB_SIZE = 26;
const HIT_TARGET = 32;

export function KnobButton({ id, active, label, refused = false, disabled = false, onClick }: KnobButtonProps) {
  const ariaLabel = `Commutateur FC ${label}${active ? ', actif' : ''}`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-checked={active}
      role="switch"
      title={label}
      data-knob-id={id}
      style={{
        background: 'transparent',
        border: 'none',
        padding: (HIT_TARGET - KNOB_SIZE) / 2, // zone cliquable étendue à 32px
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        opacity: disabled ? 0.5 : 1,
        fontFamily: typography.ui.family,
      }}
    >
      <div
        style={{
          width: KNOB_SIZE,
          height: KNOB_SIZE,
          background: `radial-gradient(circle at 32% 28%, #5A6470 0%, ${colors.metal.base} 50%, ${colors.metal.shadow} 100%)`,
          borderRadius: '50%',
          border: `1px solid ${refused ? colors.accent.danger : colors.metal.shadow}`,
          boxShadow: shadows.metallicOuter,
          position: 'relative',
          transition: `border-color ${motion.duration.fast}ms ${motion.easing.easeOut}`,
        }}
      >
        {/* Indicateur central — tourne de 45° quand actif */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: 3,
            height: 10,
            marginLeft: -1.5,
            marginTop: -7,
            background: colors.metal.knob,
            borderRadius: 2,
            transformOrigin: '50% 70%',
            transform: active ? 'rotate(45deg)' : 'rotate(0deg)',
            transition: `transform ${motion.duration.fast + 80}ms ${motion.easing.easeOut}`,
          }}
        />
      </div>
      <span
        style={{
          fontFamily: typography.mono.family,
          fontSize: 11.5,
          color: colors.text.primary,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          letterSpacing: '-0.02em',
          fontWeight: typography.weight.semibold,
        }}
      >
        {label}
      </span>
    </button>
  );
}
