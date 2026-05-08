// Cells per-channel pour le pupitre intégré.
//
// Chaque cell est un push-button rond (FA / Subst / FC) ou une plaque
// laitonnée (EPA keybox), pensée pour s'aligner verticalement avec un levier
// dans la grille du LeversPanel. Reproduit le design "Pupitre intégré" :
// boutons-poussoirs au-dessus du levier, clé/cadenas en dessous.
//
// Conventions visuelles :
//   - FA    : sceau rouge      (annule la fermeture automatique au passage)
//   - Subst : sceau bleu       (bypass occupation zone protection)
//   - FC    : sceau neutre     (commutateur fermeture carré)
//   - EPA   : keybox laitonnée (annulateur de parcours, plombé/brisé +
//             compteur d'usage)
//
// Les FA/Subst/FC se sourcent directement dans le store par signalId. EPA
// garde son état local (broken + compteur) car c'est du purement UX, pas
// du sim state — fidèle au composant Vue Gessie qui stocke ça en `data()`.

import { useRef, useState } from 'react';
import { useGessieStore } from '../../store/useGessieStore';
import { colors, motion, shadows, typography } from '../../design/tokens';

const PB_SIZE = 26;

// ============================================================================
// PushButton — primitive partagée pour FA, Subst, FC.
// ============================================================================

function PushButton({
  variant,
  lit,
  onClick,
  caption,
  ariaLabel,
  title,
}: {
  /** Couleur active du sceau quand `lit`. neutral = gris métal (FC repos). */
  variant: 'red' | 'blue' | 'neutral';
  /** Sceau brisé / pressé (état actif visuel). */
  lit: boolean;
  onClick: () => void;
  /**
   * Caption mono sous le bouton — explique la fonction. Optionnelle :
   * dans le layout par rails, l'identification se fait au niveau de la
   * colonne de labels du groupe, donc le bouton n'a pas besoin de sa
   * propre caption. Si omise/vide, on n'allonge pas le bouton verticalement.
   */
  caption?: string;
  ariaLabel: string;
  title: string;
}) {
  const palette = PUSH_BUTTON_PALETTE[variant];
  const captionColor = lit ? palette.litCaption : colors.text.muted;
  const showCaption = caption !== undefined && caption !== '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: showCaption ? 2 : 0 }}>
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        aria-pressed={lit}
        title={title}
        style={{
          width: PB_SIZE,
          height: PB_SIZE,
          borderRadius: '50%',
          background: lit ? palette.litBg : palette.idleBg,
          border: `1px solid ${lit ? palette.litBorder : '#3a444d'}`,
          boxShadow: lit
            ? `${shadows.metallicOuter}, 0 0 8px ${palette.litGlow}`
            : 'inset 0 -2px 0 rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.5)',
          cursor: 'pointer',
          padding: 0,
          transition: `box-shadow ${motion.duration.fast}ms ${motion.easing.easeOut}, background ${motion.duration.fast}ms ${motion.easing.easeOut}`,
        }}
      />
      {showCaption && (
        <span
          style={{
            fontFamily: typography.mono.family,
            fontSize: 9,
            color: captionColor,
            textAlign: 'center',
            lineHeight: 1.1,
            maxWidth: 60,
            letterSpacing: 0.2,
          }}
        >
          {caption}
        </span>
      )}
    </div>
  );
}

const PUSH_BUTTON_PALETTE = {
  red: {
    idleBg: 'radial-gradient(circle at 35% 30%, #4a545d 0%, #2a3138 60%, #1a2026 100%)',
    litBg: `radial-gradient(circle at 35% 30%, #FF6B6B 0%, ${colors.accent.danger} 60%, #7A1414 100%)`,
    litBorder: '#7A1414',
    litGlow: 'rgba(220, 38, 38, 0.55)',
    litCaption: colors.signal.rouge,
  },
  blue: {
    idleBg: 'radial-gradient(circle at 35% 30%, #4a545d 0%, #2a3138 60%, #1a2026 100%)',
    litBg: `radial-gradient(circle at 35% 30%, #7CB3FF 0%, ${colors.accent.primary} 60%, #2A4F8C 100%)`,
    litBorder: '#2A4F8C',
    litGlow: 'rgba(91, 155, 255, 0.55)',
    litCaption: colors.accent.primary,
  },
  neutral: {
    idleBg: 'radial-gradient(circle at 35% 30%, #4a545d 0%, #2a3138 60%, #1a2026 100%)',
    litBg: `radial-gradient(circle at 35% 30%, ${colors.metal.knobShine} 0%, ${colors.metal.knob} 60%, ${colors.metal.deep} 100%)`,
    litBorder: colors.metal.deep,
    litGlow: 'rgba(180, 188, 201, 0.45)',
    litCaption: colors.text.primary,
  },
} as const;

// ============================================================================
// FA — annulateur de Fermeture Automatique (per signal)
// ============================================================================

export function FaPushButton({
  signalId,
  compact = false,
}: {
  signalId: string;
  /** Quand `true`, masque la caption (utilisé par le layout en rails où le label vit dans la colonne du groupe). */
  compact?: boolean;
}) {
  const enabled = useGessieStore(
    (s) => Boolean(s.player.data?.affectations[signalId]?.annulateurFA?.enabled),
  );
  const toggleFA = useGessieStore((s) => s.toggleFA);

  return (
    <PushButton
      variant="red"
      lit={enabled}
      onClick={() => toggleFA(signalId)}
      caption={compact ? undefined : 'Annul FA'}
      ariaLabel={`Annulateur FA ${signalId}, ${enabled ? 'sceau brisé' : 'sceau plombé'}`}
      title={`FA ${signalId}${enabled ? ' (désactivée)' : ''}`}
    />
  );
}

// ============================================================================
// Substitution — bouton fugitif (armé quand zone surveillée occupée)
// ============================================================================

export function AnnulSubstitutionPushButton({
  signalId,
  compact = false,
}: {
  signalId: string;
  compact?: boolean;
}) {
  const armed = useGessieStore((s) => {
    const aff = s.player.data?.affectations[signalId];
    const zoneId = aff?.annulSubstitution?.zone;
    if (!zoneId) return false;
    return Boolean(s.player.data?.affectations[zoneId]?.circulation);
  });
  const press = useGessieStore((s) => s.annulSubstitution);

  return (
    <PushButton
      variant="blue"
      lit={armed}
      onClick={() => press(signalId)}
      caption={compact ? undefined : 'Subst'}
      ariaLabel={`Annulation de substitution ${signalId}, ${armed ? 'armée' : 'inactive'}`}
      title={`Substitution ${signalId}${armed ? ' (armée)' : ''}`}
    />
  );
}

// ============================================================================
// FC — commutateur de Fermeture Carré (per signal)
// ============================================================================

export function FcPushButton({
  signalId,
  compact = false,
}: {
  signalId: string;
  compact?: boolean;
}) {
  const active = useGessieStore(
    (s) => Boolean(s.player.data?.affectations[signalId]?.positionFC),
  );
  const toggleCommutFC = useGessieStore((s) => s.toggleCommutFC);

  // FC verrouillé = signal forcé fermé → variante rouge pour signaler le
  // verrou actif à l'opérateur (cohérent avec la sémantique "danger" rouge
  // déjà utilisée par l'annulateur FA).
  return (
    <PushButton
      variant="red"
      lit={active}
      onClick={() => toggleCommutFC(signalId)}
      caption={compact ? undefined : `FC ${signalId}`}
      ariaLabel={`Commutateur FC ${signalId}, ${active ? 'verrouillé' : 'libre'}`}
      title={`FC ${signalId}${active ? ' (verrouillé)' : ''}`}
    />
  );
}

// ============================================================================
// AE — keybox laitonné de l'Annulateur Électrique du levier
// ============================================================================
//
// Reproduction Vue `<annul-elec>` du bundle Gessie (renderer.js) : un sceau
// que l'aiguilleur brise pour ignorer les gardes de `toggleLever` (zones,
// EAP/EPA, continuité). État persistant : `lever.annulateurElec.enabled`.
//
// Design aligné sur `EpaKeybox` pour homogénéité visuelle dans le pupitre :
// même plaquette laitonnée 44×26 avec slot scellé, transition rouge quand
// activé. Différence avec EPA : pas de compteur (le modèle Gessie n'en
// stocke pas pour AE), label "AE L<leverId>" sous la plaquette.
//
// Click = toggle de `enabled` via l'action `toggleAnnulElec` (cf.
// `sim/actions.ts`). Pas de notion de "replomber" séparée — un second clic
// remet `enabled=false`.

export function AeKeybox({
  leverId,
  onToggle,
}: {
  leverId: string;
  onToggle: (leverId: string) => void;
}) {
  const enabled = useGessieStore(
    (s) => Boolean(s.player.data?.levers[leverId]?.annulateurElec?.enabled),
  );
  const ariaLabel = `Annulateur électrique levier ${leverId}, ${
    enabled ? 'sceau brisé (override actif)' : 'sceau plombé'
  }`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <button
        type="button"
        onClick={() => onToggle(leverId)}
        aria-label={ariaLabel}
        aria-pressed={enabled}
        title={`AE ${leverId}${enabled ? ' (override actif)' : ''}`}
        style={{
          width: KEYBOX_W,
          height: KEYBOX_H,
          borderRadius: 3,
          background: enabled
            ? `linear-gradient(180deg, ${colors.accent.danger} 0%, #7A1414 100%)`
            : 'linear-gradient(180deg, #d8d2bf 0%, #b3a98e 100%)',
          border: `1px solid ${enabled ? '#7A1414' : '#5a4d2c'}`,
          boxShadow: enabled
            ? `${shadows.sm}, 0 0 6px rgba(220,38,38,0.5)`
            : 'inset 0 1px 0 rgba(255,255,255,0.4), 0 1px 2px rgba(0,0,0,0.5)',
          cursor: 'pointer',
          padding: 0,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: `box-shadow ${motion.duration.fast}ms ${motion.easing.easeOut}, background ${motion.duration.fast}ms ${motion.easing.easeOut}`,
        }}
      >
        {/* Slot façon plombe (rectangulaire encastré) */}
        <span
          style={{
            display: 'block',
            width: 16,
            height: 11,
            border: `1px solid ${enabled ? '#5A0E0E' : '#5a4d2c'}`,
            borderRadius: 2,
            background: enabled ? '#3A0808' : '#2a2418',
          }}
        />
      </button>
      <span
        style={{
          fontFamily: typography.mono.family,
          fontSize: 9,
          color: enabled ? colors.signal.rouge : colors.text.muted,
          letterSpacing: 0.2,
          lineHeight: 1.2,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <span>AE</span>
        <span style={{ fontSize: 8, opacity: 0.85 }}>L{leverId}</span>
      </span>
    </div>
  );
}

// ============================================================================
// EPA — keybox laitonnée avec compteur d'usage (per signal)
// ============================================================================
//
// Reproduction Vue `<annul-epa>` (renderer.js) :
//   data: { compteur: Math.ceil(100 * Math.random()), broken: false }
//   pressButton: !broken && (broken=true, compteur+=1) ; !canceled && dispatch("cancelEPA")
//   replace: broken=false
//
// État `broken` doublé d'un useRef pour gate l'incrément en cas de clics
// rapides (cf. note dans EpaPanel.tsx).

const KEYBOX_W = 44;
const KEYBOX_H = 26;

export function EpaKeybox({
  signalId,
  leverIds = [],
}: {
  signalId: string;
  /** IDs des leviers qui pilotent ce signal — affichés sous le keybox pour
      que l'opérateur sache à quel(s) levier(s) l'EPA s'applique. Plusieurs
      leviers possibles quand le signal est partagé entre directions. */
  leverIds?: string[];
}) {
  const canceled = useGessieStore(
    (s) => Boolean(s.player.data?.affectations[signalId]?.epa?.canceled),
  );
  const epaActive = useGessieStore(
    (s) => Boolean(s.player.data?.affectations[signalId]?.epa?.epa),
  );
  const cancelEPA = useGessieStore((s) => s.cancelEPA);

  const brokenRef = useRef(false);
  const [broken, setBroken] = useState(false);
  const [compteur, setCompteur] = useState(() => Math.ceil(100 * Math.random()));

  // Toggle unique : un clic active (brise le sceau + cancelEPA si pas déjà
  // annulé), un second clic désactive (replombe le sceau côté UX). Le côté
  // sim de cancelEPA n'est pas réversible — c'est purement visuel pour le
  // sceau, fidèle au comportement Gessie où la méthode `replace` ne fait
  // que remettre `broken=false`.
  const handlePress = () => {
    if (brokenRef.current) {
      brokenRef.current = false;
      setBroken(false);
      return;
    }
    brokenRef.current = true;
    setBroken(true);
    setCompteur((c) => c + 1);
    if (!canceled) cancelEPA(signalId);
  };

  const ariaLabel = `Annulateur EPA ${signalId}, ${broken ? 'sceau brisé' : 'sceau plombé'}, compteur ${compteur}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <button
        type="button"
        onClick={handlePress}
        aria-label={ariaLabel}
        aria-pressed={broken}
        title={`EPA ${signalId} #${compteur}${broken ? ' · brisé' : ''}${epaActive ? ' · actif' : ''}${canceled ? ' · annul.' : ''}`}
        style={{
          width: KEYBOX_W,
          height: KEYBOX_H,
          borderRadius: 3,
          background: broken
            ? `linear-gradient(180deg, ${colors.accent.danger} 0%, #7A1414 100%)`
            : 'linear-gradient(180deg, #d8d2bf 0%, #b3a98e 100%)',
          border: `1px solid ${broken ? '#7A1414' : '#5a4d2c'}`,
          boxShadow: broken
            ? `${shadows.sm}, 0 0 6px rgba(220,38,38,0.5)`
            : 'inset 0 1px 0 rgba(255,255,255,0.4), 0 1px 2px rgba(0,0,0,0.5)',
          cursor: 'pointer',
          padding: 0,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Slot façon plombe (rectangulaire encastré) */}
        <span
          style={{
            display: 'block',
            width: 16,
            height: 11,
            border: `1px solid ${broken ? '#5A0E0E' : '#5a4d2c'}`,
            borderRadius: 2,
            background: broken ? '#3A0808' : '#2a2418',
          }}
        />
        {/* Compteur en bas-droite */}
        <span
          style={{
            position: 'absolute',
            right: 2,
            bottom: 1,
            fontFamily: typography.mono.family,
            fontSize: 8,
            fontWeight: typography.weight.bold,
            color: broken ? '#FFE5E5' : '#3a2f10',
            lineHeight: 1,
          }}
        >
          {compteur}
        </span>
      </button>
      <span
        style={{
          fontFamily: typography.mono.family,
          fontSize: 9,
          color: broken ? colors.signal.rouge : colors.text.muted,
          letterSpacing: 0.2,
          lineHeight: 1.2,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <span>EPA {signalId}</span>
        {leverIds.length > 0 && (
          <span style={{ fontSize: 8, opacity: 0.85 }}>
            L{leverIds.join(' ')}
          </span>
        )}
      </span>
    </div>
  );
}

