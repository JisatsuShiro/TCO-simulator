// Cadenas / serrure — primitive SVG.
//
// Trois états (cf. spec UX "Stratégie de composants") :
//   - closed-with-key : anse fermée + clé visible dans le trou
//                       → cliquable pour prendre la clé
//   - open-no-key     : anse soulevée + trou vide
//                       → cliquable pour insérer la clé en main
//   - closed-no-key   : anse fermée + trou vide
//                       → non cliquable (pas de clé compatible en main)
//
// Deux variants de taille : `small` (24×28) pour les listes denses,
// `large` (40×48) pour les locks principaux. Le label est rendu en
// dessous (numéro de clé en mono).
//
// Pas d'animation Phase 1 (changement d'état instantané). Phase 2 prévoit
// l'anse qui se soulève à l'ouverture et la clé qui s'insère.

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { colors, motion, radii, typography } from '../tokens';

export type KeyHoleState = 'closed-with-key' | 'open-no-key' | 'closed-no-key';
export type KeyHoleVariant = 'small' | 'large' | 'embedded';

interface Props {
  state: KeyHoleState;
  label: string;
  onClick?: () => void;
  variant?: KeyHoleVariant;
  /** True le temps d'une animation de refus. Le parent doit reset à false. */
  refused?: boolean;
  /** Texte natif tooltip (info debug). */
  title?: string;
}

// `embedded` : variante minuscule pour serrures intégrées à une plaque
// métallique (ex: sous un levier). Pas d'anse, pas de label dessous —
// juste le corps + trou. Le parent gère le tooltip via `title`.
const dims: Record<KeyHoleVariant, { w: number; h: number; bodyH: number; arcR: number; holeR: number }> = {
  small: { w: 24, h: 28, bodyH: 16, arcR: 7, holeR: 2.4 },
  large: { w: 40, h: 48, bodyH: 28, arcR: 12, holeR: 4 },
  embedded: { w: 14, h: 16, bodyH: 16, arcR: 0, holeR: 2.2 },
};

export function KeyHole({ state, label, onClick, variant = 'small', refused = false, title }: Props) {
  const [hover, setHover] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const d = dims[variant];

  // Animation de refus : secousse horizontale rapide pour signaler que la
  // clé ne peut pas être prise / posée (mauvaise clé en main, serrure
  // verrouillée par enclenchement, etc.). Métaphore physique cohérente avec
  // une serrure réelle qu'on essaie de forcer.
  useEffect(() => {
    if (!refused || !svgRef.current) return;
    const anim = svgRef.current.animate(
      [
        { transform: 'translateX(0)', offset: 0 },
        { transform: 'translateX(-3px)', offset: 0.15 },
        { transform: 'translateX(3px)', offset: 0.30 },
        { transform: 'translateX(-2px)', offset: 0.45 },
        { transform: 'translateX(2px)', offset: 0.60 },
        { transform: 'translateX(-1px)', offset: 0.75 },
        { transform: 'translateX(0)', offset: 1 },
      ],
      {
        duration: motion.duration.slow,
        easing: motion.easing.easeOut,
      },
    );
    return () => anim.cancel();
  }, [refused]);

  const interactive = state !== 'closed-no-key' && onClick != null;
  const armOpen = state === 'open-no-key';
  const hasKey = state === 'closed-with-key';

  // Couleurs corps : éclairé quand actif (clé enfoncée) ou hover, sinon discret.
  const bodyFill = hasKey
    ? colors.metal.highlight
    : interactive && hover
      ? colors.metal.base
      : colors.metal.shadow;
  const bodyStroke = hasKey
    ? '#E1E5EC'
    : interactive
      ? colors.border.strong
      : colors.border.subtle;

  // Anse : couleur métallique constante mais translation y vers le haut quand ouvert.
  const armStroke = colors.metal.knob;
  const armOffsetY = armOpen ? -3 : 0;

  // Trou : noir profond toujours, sauf si clé visible (laiton brillant).
  const holeFill = hasKey ? '#D9B36A' : '#0A0E13';

  const wrapperStyle: CSSProperties = {
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: 0,
    background: 'transparent',
    border: 'none',
    cursor: interactive ? 'pointer' : 'not-allowed',
    opacity: interactive ? 1 : 0.5,
  };

  // Géométrie : centre x, anse arc demi-cercle au-dessus du corps rectangulaire.
  const cx = d.w / 2;
  const bodyY = d.h - d.bodyH;
  const arcCx = cx;
  const arcCy = bodyY;

  // Anse : path arc semi-circulaire (rayon arcR) avec pieds qui rejoignent le corps.
  // Quand fermé : pieds tombent jusqu'à bodyY+2. Ouvert : on translate juste le tout
  // via armOffsetY et on garde la géométrie identique (le décalage vers le haut suggère
  // l'ouverture sans complexifier le path).
  const arcPath = `M ${arcCx - d.arcR} ${arcCy + 2}
    L ${arcCx - d.arcR} ${arcCy}
    A ${d.arcR} ${d.arcR} 0 0 1 ${arcCx + d.arcR} ${arcCy}
    L ${arcCx + d.arcR} ${arcCy + 2}`;

  const isEmbedded = variant === 'embedded';

  return (
    <button
      type="button"
      title={title ?? `${label} (${state})`}
      aria-label={`Serrure ${label}, ${stateAria(state)}`}
      onClick={interactive ? onClick : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      disabled={!interactive}
      style={wrapperStyle}
    >
      <svg
        ref={svgRef}
        width={d.w}
        height={d.h}
        viewBox={`0 0 ${d.w} ${d.h}`}
        style={{
          display: 'block',
          filter: interactive && hover ? 'brightness(1.15)' : undefined,
          transition: 'filter 120ms ease',
        }}
      >
        {/* Corps du cadenas / serrure */}
        <rect
          x={1}
          y={bodyY}
          width={d.w - 2}
          height={d.bodyH - 1}
          rx={isEmbedded ? d.holeR : radii.sm}
          fill={bodyFill}
          stroke={bodyStroke}
          strokeWidth={1}
        />
        {/* Trou de serrure : disque + fente verticale */}
        <circle cx={cx} cy={bodyY + d.bodyH * 0.45} r={d.holeR} fill={holeFill} />
        <rect
          x={cx - d.holeR * 0.4}
          y={bodyY + d.bodyH * 0.45}
          width={d.holeR * 0.8}
          height={d.holeR * 1.6}
          fill={holeFill}
        />
        {/* Anse en U inversé : seulement pour les variantes "cadenas autonome".
            La variante `embedded` représente une serrure intégrée à une plaque
            (ex: sous un levier) — pas d'anse. */}
        {!isEmbedded && (
          <path
            d={arcPath}
            fill="none"
            stroke={armStroke}
            strokeWidth={variant === 'large' ? 3 : 2}
            strokeLinecap="round"
            transform={armOffsetY ? `translate(0 ${armOffsetY})` : undefined}
          />
        )}
      </svg>
      {!isEmbedded && (
        <span
          style={{
            fontFamily: typography.mono.family,
            fontSize: typography.size.xs,
            color: hasKey ? colors.text.primary : colors.text.secondary,
            fontWeight: typography.weight.medium,
            letterSpacing: 0.3,
          }}
        >
          {label}
        </span>
      )}
    </button>
  );
}

function stateAria(state: KeyHoleState): string {
  switch (state) {
    case 'closed-with-key':
      return 'clé enfoncée';
    case 'open-no-key':
      return 'prêt à recevoir une clé';
    case 'closed-no-key':
      return 'verrouillée, pas de clé compatible';
  }
}
