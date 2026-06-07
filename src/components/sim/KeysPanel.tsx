// Composants liés aux serrures et clés. Anciennement un Panel autonome,
// désormais une bibliothèque de building blocks rendus DANS le LeversPanel :
//
//   - `LeverKeyholeStrip(leverId)` : la rangée de serrures d'un levier
//     donné (placée sous le levier dans la grille du LeversPanel).
//   - `AuxiliaryKeysColumn()` : la colonne de droite — boîtes à clés,
//     cadenas, verrous centraux — affichée à côté de la rangée de leviers.
//
// Visuel : un keyhole avec présence est cliquable en "take", un keyhole
// vide est cliquable en "put" (si on tient une clé compatible). Les
// actions échouent silencieusement (cohérent avec Gessie). Détection de
// refus : on lit la présence avant et après via `setTimeout(0)`, et si
// inchangée on déclenche l'animation didactique de la serrure.
//
// Sélecteurs primitifs (CSV split) pour éviter les boucles "getSnapshot
// should be cached".

import { useState } from 'react';
import { useGessieStore } from '../../store/useGessieStore';
import { KeyHole } from '../../design/primitives/KeyHole';
import type { KeyHoleState } from '../../design/primitives/KeyHole';
import { KeyTag } from '../../design/primitives/KeyTag';
import { colors, radii, spacing, typography } from '../../design/tokens';

/**
 * Helper d'animation refus : exécute `action`, puis vérifie via
 * `readPresence()` si la présence a changé. Si non, déclenche le refus
 * pendant 600 ms (durée d'animation).
 */
function useRefusalDetection(): { refused: boolean; trigger: (run: () => void, readPresence: () => boolean, before: boolean) => void } {
  const [refused, setRefused] = useState(false);
  const trigger = (run: () => void, readPresence: () => boolean, before: boolean) => {
    run();
    setTimeout(() => {
      const after = readPresence();
      if (after === before) {
        setRefused(true);
        setTimeout(() => setRefused(false), 600);
      }
    }, 0);
  };
  return { refused, trigger };
}

// ===== Sélecteurs scalaires (CSV) =====

function useGroupIds(): string[] {
  const csv = useGessieStore((s) =>
    s.player.data ? Object.keys(s.player.data.groups).sort().join('\n') : '',
  );
  return csv === '' ? [] : csv.split('\n');
}

function useLockIds(): string[] {
  const csv = useGessieStore((s) =>
    s.player.data ? Object.keys(s.player.data.locks).sort().join('\n') : '',
  );
  return csv === '' ? [] : csv.split('\n');
}

function useCentralLockUids(): string[] {
  const csv = useGessieStore((s) =>
    s.player.data ? Object.keys(s.player.data.centralLocks).sort().join('\n') : '',
  );
  return csv === '' ? [] : csv.split('\n');
}

/**
 * Mappe `presence` boolean + `holdedKey` vers les 3 états du KeyHole.
 *   - presence true                → 'closed-with-key' (cliquable: take)
 *   - presence false + clé en main → 'open-no-key' (cliquable: put)
 *   - presence false + rien en main → 'closed-no-key' (non cliquable)
 */
function deriveState(presence: boolean, holdedKey: string | undefined): KeyHoleState {
  if (presence) return 'closed-with-key';
  if (holdedKey) return 'open-no-key';
  return 'closed-no-key';
}

// ===== Public : LeverKeyholeStrip =====

/**
 * Rangée des serrures attachées à un levier. Si le levier n'a aucune
 * serrure, retourne null.
 *
 * Variantes :
 *   - par défaut : grandes serrures avec label, à rendre à côté du levier.
 *   - `embedded` : petites serrures sans label, prévues pour être posées
 *     dans le bas du boîtier du Lever (cf. prop `keyholeSlot` du Lever).
 */
export function LeverKeyholeStrip({
  leverId,
  embedded = false,
}: {
  leverId: string;
  embedded?: boolean;
}) {
  const keysCsv = useGessieStore((s) => {
    const lev = s.player.data?.levers[leverId];
    if (!lev?.keyholes) return '';
    return Object.keys(lev.keyholes).sort().join('\n');
  });
  const keys = keysCsv === '' ? [] : keysCsv.split('\n');
  if (keys.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        gap: embedded ? 2 : spacing.xxs,
        justifyContent: 'center',
        marginTop: embedded ? 0 : spacing.xxs,
      }}
    >
      {keys.map((k) => (
        <LeverKeyhole key={k} leverId={leverId} keyId={k} embedded={embedded} />
      ))}
    </div>
  );
}

function LeverKeyhole({
  leverId,
  keyId,
  embedded = false,
}: {
  leverId: string;
  keyId: string;
  embedded?: boolean;
}) {
  const presence = useGessieStore(
    (s) => s.player.data?.levers[leverId]?.keyholes?.[keyId]?.presence ?? false,
  );
  const position = useGessieStore(
    (s) => s.player.data?.levers[leverId]?.keyholes?.[keyId]?.position ?? '',
  );
  const holdedKey = useGessieStore((s) => s.player.data?.holdedKey);
  const takeKey = useGessieStore((s) => s.takeKey);
  const putKey = useGessieStore((s) => s.putKey);
  const { refused, trigger } = useRefusalDetection();

  const handleClick = () => {
    const before = Boolean(presence);
    trigger(
      () => {
        if (presence) takeKey({ leverId, keyId });
        else if (holdedKey) putKey({ leverId, keyId });
      },
      () => Boolean(useGessieStore.getState().player.data?.levers[leverId]?.keyholes?.[keyId]?.presence),
      before,
    );
  };

  return (
    <KeyHole
      state={deriveState(Boolean(presence), holdedKey)}
      label={keyId}
      onClick={handleClick}
      refused={refused}
      variant={embedded ? 'embedded' : 'small'}
      title={`${keyId} (${position})`}
    />
  );
}

// ===== Public : AuxiliaryKeysColumn =====

/**
 * Colonne droite du LeversPanel : badge "clé en main" + boîtes à clés
 * (groups) + cadenas (locks) + verrous centraux (centralLocks).
 *
 * Variante repliable inspirée du redesign Variant C : repliée par défaut
 * (~44 px, pile d'icônes serrure + badge "clé en main" si applicable),
 * dépliée via chevron (~180 px, sections complètes). Permet à la bande
 * leviers d'occuper toute la largeur quand l'opérateur n'a pas besoin
 * des clés. Retourne null si la station n'a aucun de ces éléments.
 */
export function AuxiliaryKeysColumn() {
  const [open, setOpen] = useState(false);
  const holdedKey = useGessieStore((s) => s.player.data?.holdedKey);
  const groupIds = useGroupIds();
  const lockIds = useLockIds();
  const centralLockUids = useCentralLockUids();

  const total = groupIds.length + lockIds.length + centralLockUids.length;
  if (total === 0) return null;

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: typography.size.xs,
    color: colors.text.muted,
    fontWeight: typography.weight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xxs,
  };

  const sectionRowStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.xs,
  };

  const groupContainerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.xs}px ${spacing.sm}px`,
    background: colors.surface.darkest,
    border: `1px solid ${colors.border.subtle}`,
    borderRadius: radii.sm,
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: open ? spacing.md : spacing.xs,
        padding: open ? spacing.sm : `${spacing.sm}px 6px`,
        background: colors.surface.medium,
        border: `1px solid ${colors.border.subtle}`,
        borderRadius: radii.md,
        minWidth: open ? 180 : 44,
        width: open ? undefined : 44,
        alignSelf: 'stretch',
        overflow: 'hidden',
        transition: 'min-width 200ms ease, width 200ms ease, padding 200ms ease',
        flexShrink: 0,
      }}
    >
      {/* En-tête : libellé "en main" + chevron toggle (dépluié), ou juste
          le chevron centré (replié). */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.xs,
          justifyContent: open ? 'space-between' : 'center',
          fontSize: typography.size.xs,
          color: colors.text.secondary,
        }}
      >
        {open && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: spacing.xs,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            }}
          >
            en main
            {holdedKey ? (
              <KeyTag label={holdedKey} held />
            ) : (
              <span style={{ color: colors.text.muted }}>—</span>
            )}
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Replier les clés' : 'Déplier clés et cadenas'}
          aria-expanded={open}
          title={open ? 'Replier' : 'Déplier clés & cadenas'}
          style={{
            width: 22,
            height: 22,
            borderRadius: radii.sm,
            cursor: 'pointer',
            padding: 0,
            border: `1px solid ${colors.border.default}`,
            background: colors.surface.darkest,
            color: colors.text.secondary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
            <path
              d={open ? 'M4.5 2 L8.5 6 L4.5 10' : 'M7.5 2 L3.5 6 L7.5 10'}
              stroke="currentColor"
              strokeWidth="1.4"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {open ? (
        <>
          {groupIds.length > 0 && (
            <div>
              <div style={sectionTitleStyle}>Boîtes à clés</div>
              <div style={sectionRowStyle}>
                {groupIds.map((id) => (
                  <GroupBox key={id} groupId={id} groupContainerStyle={groupContainerStyle} />
                ))}
              </div>
            </div>
          )}

          {lockIds.length > 0 && (
            <div>
              <div style={sectionTitleStyle}>Cadenas</div>
              <div style={sectionRowStyle}>
                {lockIds.map((id) => (
                  <LockBox key={id} keyId={id} />
                ))}
              </div>
            </div>
          )}

          {centralLockUids.length > 0 && (
            <div>
              <div style={sectionTitleStyle}>Verrous centraux</div>
              <div style={sectionRowStyle}>
                {centralLockUids.map((uid) => (
                  <CentralLockBox key={uid} uid={uid} />
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <CollapsedKeysStack
          groupCount={groupIds.length}
          lockCount={lockIds.length}
          centralCount={centralLockUids.length}
          holdedKey={holdedKey}
        />
      )}
    </div>
  );
}

/**
 * Vue compacte du rail replié : un petit badge "clé en main" en haut si
 * une clé est en main, puis une icône-serrure par famille présente
 * (boîtes à clés / cadenas / verrous centraux). Simple repère visuel —
 * c'est le chevron au-dessus qui permet de déplier.
 */
function CollapsedKeysStack({
  groupCount,
  lockCount,
  centralCount,
  holdedKey,
}: {
  groupCount: number;
  lockCount: number;
  centralCount: number;
  holdedKey: string | undefined;
}) {
  const icons: { key: string; show: boolean }[] = [
    { key: 'groups', show: groupCount > 0 },
    { key: 'locks', show: lockCount > 0 },
    { key: 'central', show: centralCount > 0 },
  ];
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: spacing.xs,
        marginTop: 2,
      }}
    >
      {holdedKey && (
        <div
          title={`Clé en main : ${holdedKey}`}
          aria-label={`Clé en main : ${holdedKey}`}
          style={{
            width: 30,
            height: 18,
            borderRadius: radii.sm,
            background: colors.accent.warning,
            color: colors.surface.darkest,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            fontFamily: typography.mono.family,
            fontWeight: typography.weight.bold,
            letterSpacing: 0.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            padding: '0 3px',
          }}
        >
          {holdedKey}
        </div>
      )}
      {icons
        .filter((i) => i.show)
        .map((i) => (
          <div
            key={i.key}
            style={{
              width: 28,
              height: 28,
              borderRadius: radii.sm,
              border: `1px solid ${colors.border.subtle}`,
              background: colors.surface.darkest,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: colors.text.muted,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
              <circle
                cx="7"
                cy="5"
                r="3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
              />
              <rect
                x="6.1"
                y="7.2"
                width="1.8"
                height="4.5"
                rx="0.6"
                fill="currentColor"
              />
            </svg>
          </div>
        ))}
    </div>
  );
}

function GroupBox({
  groupId,
  groupContainerStyle,
}: {
  groupId: string;
  groupContainerStyle: React.CSSProperties;
}) {
  const label = useGessieStore((s) => s.player.data?.groups[groupId]?.label ?? groupId);
  const keysCsv = useGessieStore((s) => {
    const grp = s.player.data?.groups[groupId];
    if (!grp) return '';
    return Object.keys(grp.keyholes).sort().join('\n');
  });
  const keys = keysCsv === '' ? [] : keysCsv.split('\n');
  return (
    <div style={groupContainerStyle}>
      <strong style={{ fontSize: typography.size.xs, color: colors.text.secondary }}>{label}</strong>
      {keys.map((k) => (
        <GroupKeyhole key={k} groupId={groupId} keyId={k} />
      ))}
    </div>
  );
}

function GroupKeyhole({ groupId, keyId }: { groupId: string; keyId: string }) {
  const presence = useGessieStore(
    (s) => s.player.data?.groups[groupId]?.keyholes[keyId]?.presence ?? false,
  );
  const holdedKey = useGessieStore((s) => s.player.data?.holdedKey);
  const takeKey = useGessieStore((s) => s.takeKey);
  const putKey = useGessieStore((s) => s.putKey);
  const { refused, trigger } = useRefusalDetection();

  const handleClick = () => {
    const before = Boolean(presence);
    trigger(
      () => {
        if (presence) takeKey({ groupId, keyId });
        else if (holdedKey) putKey({ groupId, keyId });
      },
      () => Boolean(useGessieStore.getState().player.data?.groups[groupId]?.keyholes[keyId]?.presence),
      before,
    );
  };

  return (
    <KeyHole
      state={deriveState(Boolean(presence), holdedKey)}
      label={keyId}
      onClick={handleClick}
      refused={refused}
    />
  );
}

function LockBox({ keyId }: { keyId: string }) {
  const presence = useGessieStore((s) => s.player.data?.locks[keyId]?.presence ?? false);
  const position = useGessieStore((s) => s.player.data?.locks[keyId]?.position);
  const holdedKey = useGessieStore((s) => s.player.data?.holdedKey);
  const takeKey = useGessieStore((s) => s.takeKey);
  const putKey = useGessieStore((s) => s.putKey);
  const toggleLock = useGessieStore((s) => s.toggleLock);
  const { refused, trigger } = useRefusalDetection();
  const { refused: rotationRefused, trigger: triggerRotation } =
    useRefusalDetection();

  const handleClick = () => {
    const before = Boolean(presence);
    trigger(
      () => {
        if (presence) takeKey({ lock: true, keyId });
        else if (holdedKey) putKey({ lock: true, keyId });
      },
      () => Boolean(useGessieStore.getState().player.data?.locks[keyId]?.presence),
      before,
    );
  };

  // Position 'plus' ≡ N (Normal), 'minus' ≡ R (Renversé). Affichage : la
  // lettre courante. Click → toggleLock (bascule N↔R). Refus silencieux si
  // R→N tenté sans clé présente — on lit la position avant/après pour
  // déclencher l'animation refus.
  const positionLabel = position === 'plus' ? 'N' : position === 'minus' ? 'R' : '?';
  const handleRotate = () => {
    // Encodage "position est plus ?" en bool pour réutiliser useRefusalDetection.
    // before/after identiques ⇒ pas de bascule ⇒ refus.
    const before = position === 'plus';
    triggerRotation(
      () => toggleLock(keyId),
      () => useGessieStore.getState().player.data?.locks[keyId]?.position === 'plus',
      before,
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <KeyHole
        state={deriveState(Boolean(presence), holdedKey)}
        label={keyId}
        onClick={handleClick}
        refused={refused}
        variant="large"
      />
      <button
        type="button"
        onClick={handleRotate}
        aria-label={`Rotation cadenas ${keyId}, position ${positionLabel === 'N' ? 'Normale' : 'Renversée'}`}
        title={`Tourner ${keyId} (${positionLabel} → ${positionLabel === 'N' ? 'R' : 'N'})`}
        style={{
          background: position === 'minus' ? colors.signal.jaune : colors.surface.medium,
          color: position === 'minus' ? colors.surface.darkest : colors.text.primary,
          border: `1px solid ${rotationRefused ? colors.signal.rouge : colors.border.default}`,
          borderRadius: radii.sm,
          padding: '2px 8px',
          minWidth: 30,
          cursor: 'pointer',
          fontFamily: typography.mono.family,
          fontSize: typography.size.xs,
          fontWeight: typography.weight.bold,
          letterSpacing: '0.05em',
          transition: 'background 120ms, border-color 120ms',
          boxShadow: rotationRefused
            ? `0 0 0 2px ${colors.signal.rouge}55`
            : undefined,
        }}
      >
        {positionLabel}
      </button>
    </div>
  );
}

function CentralLockBox({ uid }: { uid: string }) {
  const keyId = useGessieStore((s) => s.player.data?.centralLocks[uid]?.keyId ?? '');
  const presence = useGessieStore((s) => {
    const cl = s.player.data?.centralLocks[uid];
    if (!cl) return false;
    return typeof cl.presence === 'string' ? cl.presence : (cl.presence as boolean);
  });
  const holdedKey = useGessieStore((s) => s.player.data?.holdedKey);
  const takeCentralKey = useGessieStore((s) => s.takeCentralKey);
  const putCentralKey = useGessieStore((s) => s.putCentralKey);
  const { refused, trigger } = useRefusalDetection();

  const has = presence !== false;
  const handleClick = () => {
    trigger(
      () => {
        if (has) takeCentralKey(uid);
        else if (holdedKey) putCentralKey(uid);
      },
      () => {
        const cl = useGessieStore.getState().player.data?.centralLocks[uid];
        if (!cl) return false;
        return cl.presence !== false;
      },
      has,
    );
  };

  return (
    <KeyHole
      state={deriveState(has, holdedKey)}
      label={keyId}
      onClick={handleClick}
      refused={refused}
      variant="large"
      title={`central:${uid}`}
    />
  );
}
