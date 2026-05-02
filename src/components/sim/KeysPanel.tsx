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
 * Retourne null si aucun de ces éléments n'existe dans la station — la
 * colonne disparaît proprement, le LeversPanel reprend toute sa largeur.
 */
export function AuxiliaryKeysColumn() {
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
        gap: spacing.md,
        padding: spacing.sm,
        background: colors.surface.medium,
        border: `1px solid ${colors.border.subtle}`,
        borderRadius: radii.md,
        minWidth: 180,
        alignSelf: 'stretch',
      }}
    >
      {/* Badge "clé en main" en tête de colonne. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.xs,
          fontSize: typography.size.xs,
          color: colors.text.secondary,
        }}
      >
        <span style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>en main</span>
        {holdedKey ? <KeyTag label={holdedKey} held /> : <span style={{ color: colors.text.muted }}>—</span>}
      </div>

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
  const holdedKey = useGessieStore((s) => s.player.data?.holdedKey);
  const takeKey = useGessieStore((s) => s.takeKey);
  const putKey = useGessieStore((s) => s.putKey);
  const { refused, trigger } = useRefusalDetection();

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

  return (
    <KeyHole
      state={deriveState(Boolean(presence), holdedKey)}
      label={keyId}
      onClick={handleClick}
      refused={refused}
      variant="large"
    />
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
