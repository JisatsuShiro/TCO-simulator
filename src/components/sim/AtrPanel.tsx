// Plaques laitonnées des Annulateurs de Transit (ATR).
//
// Reproduction fidèle des composants Vue de Gessie (renderer.js) :
//
//   - non-terrain (T21, T22…) : un seul bouton-cassette "ATr {id}".
//       click gauche  → broken=true + dispatch pressATr (vérif leviers,
//                       pressed=true, on=true, cancelATr +30s)
//       click droit   → replace (broken=false) — réinitialise la cassette
//
//   - terrain (T24…) : DEUX boutons côte à côte.
//       1. cassette "Au ATr {id}"
//          click gauche  → broken=true + dispatch pressAuATr (pressed=true,
//                          autorisation=true)
//          click droit   → replace (broken=false)
//       2. bouton "ATr {id}" avec LED (autorisation)
//          click gauche  → si autorisation, dispatch pressATr (vérif leviers,
//                          autorisation=false, on=true)
//
// L'état `broken` est local au composant (matches Gessie's `data: {broken:false}`)
// et n'est pas persisté dans le store. C'est uniquement un indicateur visuel.

import { useState } from 'react';
import { useGessieStore } from '../../store/useGessieStore';
import { colors, radii, shadows, spacing, typography } from '../../design/tokens';

// ============================================================================
// AtrPlate — plaque laitonnée + bouton(s) selon terrain/non-terrain
// ============================================================================

export function AtrPlate({ index }: { index: number }) {
  const id = useGessieStore((s) => s.player.data?.transitAnnulateurs[index]?.id ?? '');
  const on = useGessieStore((s) => s.player.data?.transitAnnulateurs[index]?.on ?? false);
  const autorisation = useGessieStore(
    (s) => s.player.data?.transitAnnulateurs[index]?.autorisation ?? false,
  );
  const terrain = useGessieStore(
    (s) => s.player.data?.transitAnnulateurs[index]?.terrain ?? false,
  );

  const pressATR = useGessieStore((s) => s.pressATRBouton);
  const giveAuth = useGessieStore((s) => s.giveATRAutorisation);

  return (
    <div
      style={{
        background: 'linear-gradient(180deg, #d8d2bf 0%, #b3a98e 100%)',
        border: '1px solid #5a4d2c',
        borderRadius: radii.sm,
        padding: `${spacing.xs}px ${spacing.sm}px`,
        minWidth: 110,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: spacing.xs,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 1px 2px rgba(0,0,0,0.6)',
      }}
    >
      <Slot />

      {terrain ? (
        <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'stretch' }}>
          <CassetteButton
            label={`Au ATr ${id}`}
            onPress={() => giveAuth(id)}
            on={on}
            title={`Au ATr ${id} — clic : briser pour autoriser ; clic droit : réarmer`}
          />
          <AuatrButton
            id={id}
            on={on}
            autorisation={autorisation}
            onPress={() => autorisation && pressATR(id)}
          />
        </div>
      ) : (
        <CassetteButton
          label={`ATr ${id}`}
          onPress={() => pressATR(id)}
          on={on}
          title={`ATr ${id} — clic : briser pour annuler ; clic droit : réarmer`}
        />
      )}
    </div>
  );
}

// ============================================================================
// CassetteButton — bouton-cassette à briser avec état local `broken`
// ============================================================================

function CassetteButton({
  label,
  onPress,
  on,
  title,
}: {
  label: string;
  onPress: () => void;
  /** ATR allumé (`on=true`) → halo rouge sur le bord pour indiquer l'état actif. */
  on: boolean;
  title?: string;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <button
      type="button"
      title={title}
      aria-label={label}
      onClick={() => {
        setBroken(true);
        onPress();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setBroken(false);
      }}
      style={{
        position: 'relative',
        minWidth: 72,
        padding: `${spacing.xs}px ${spacing.sm}px`,
        background: broken
          ? 'repeating-linear-gradient(135deg, #6b5e42 0 4px, #564a32 4px 8px)'
          : 'linear-gradient(180deg, #c4b893 0%, #a39474 100%)',
        border: `1px solid ${on ? '#a32218' : '#5a4d2c'}`,
        borderRadius: 3,
        color: broken ? '#1a1408' : '#3a2f10',
        fontFamily: typography.mono.family,
        fontSize: 10,
        fontWeight: typography.weight.bold,
        letterSpacing: 0.2,
        cursor: 'pointer',
        boxShadow: on
          ? `${shadows.sm}, 0 0 6px ${colors.signal.rouge}88`
          : broken
            ? 'inset 0 1px 2px rgba(0,0,0,0.5)'
            : 'inset 0 1px 0 rgba(255,255,255,0.3)',
        transform: broken ? 'translateY(1px)' : undefined,
        transition: 'transform 80ms, box-shadow 120ms',
      }}
    >
      {label}
      {broken && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            bottom: 2,
            right: 4,
            fontSize: 8,
            color: '#1a0808',
            opacity: 0.7,
          }}
        >
          ✗
        </span>
      )}
    </button>
  );
}

// ============================================================================
// AuatrButton — bouton terrain avec LED d'autorisation
// ============================================================================
//
// Reproduit `<auatr>` (renderer.js, template byte 650400) :
//   <div class="button">
//     <div class="light" :class="{on: lightIsOn}"/>
//     <img @click="pressButton">    // pressButton: atr.autorisation && pressATr
//     <p>ATr {{id}}</p>
//   </div>
// `lightIsOn` ≡ `atr.autorisation`. Le clic ne fait rien si non autorisé.

function AuatrButton({
  id,
  on,
  autorisation,
  onPress,
}: {
  id: string;
  on: boolean;
  autorisation: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      title={
        autorisation
          ? `ATr ${id} — armé, clic pour annuler le transit`
          : `ATr ${id} — non armé (cassette Au non brisée)`
      }
      aria-label={`ATr ${id}`}
      aria-disabled={!autorisation}
      onClick={onPress}
      style={{
        minWidth: 56,
        padding: `${spacing.xs}px ${spacing.sm}px`,
        background: on
          ? 'linear-gradient(180deg, #c4b893 0%, #a39474 100%)'
          : autorisation
            ? 'linear-gradient(180deg, #c4b893 0%, #a39474 100%)'
            : 'linear-gradient(180deg, #b8ad88 0%, #98896a 100%)',
        border: `1px solid ${on ? '#a32218' : '#5a4d2c'}`,
        borderRadius: 3,
        color: '#3a2f10',
        fontFamily: typography.mono.family,
        fontSize: 10,
        fontWeight: typography.weight.bold,
        letterSpacing: 0.2,
        cursor: autorisation ? 'pointer' : 'not-allowed',
        opacity: autorisation || on ? 1 : 0.75,
        boxShadow: on
          ? `${shadows.sm}, 0 0 6px ${colors.signal.rouge}88`
          : 'inset 0 1px 0 rgba(255,255,255,0.3)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
      }}
    >
      <span
        role="status"
        aria-label={`Autorisation ${autorisation ? 'allumée' : 'éteinte'}`}
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: autorisation ? colors.signal.jaune : '#3a2f10',
          opacity: autorisation ? 1 : 0.4,
          boxShadow: autorisation ? `0 0 4px ${colors.signal.jaune}` : 'none',
          border: `1px solid ${autorisation ? '#7A5A05' : '#3a2f10'}`,
        }}
      />
      <span>ATr {id}</span>
    </button>
  );
}

// ============================================================================
// Slot — pictogramme décoratif "scellé" en haut de plaque
// ============================================================================

function Slot() {
  return (
    <div
      aria-hidden
      style={{
        width: 56,
        height: 14,
        background: '#2a2418',
        border: '1px solid #5a4d2c',
        borderRadius: 2,
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%,-50%)',
          width: 18,
          height: 6,
          background: '#7a6d4b',
          borderRadius: 1,
        }}
      />
    </div>
  );
}

