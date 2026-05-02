// Panel des clés : affiche `holdedKey` (clé en main), la liste des locks,
// groups (boîtes à clés), centralLocks (verrous centraux), et les keyholes
// attachés aux leviers. Click sur un keyhole pour take/put.
//
// Visuel : un keyhole avec présence est cliquable en "take", un keyhole vide
// est cliquable en "put" (si on tient une clé compatible). Les actions
// échouent silencieusement (cohérent avec Gessie).
//
// Sélecteurs primitifs pour éviter les boucles infinies de re-render :
// on lit les listes d'IDs via une string CSV puis split (pattern compatible
// avec les sélecteurs scalaires Zustand).

import { useState } from 'react';
import { useGessieStore } from '../../store/useGessieStore';
import { Panel } from '../../design/primitives/Panel';
import { KeyHole } from '../../design/primitives/KeyHole';
import type { KeyHoleState } from '../../design/primitives/KeyHole';
import { KeyTag } from '../../design/primitives/KeyTag';
import { colors, spacing, typography } from '../../design/tokens';

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

// ===== Helpers : sélecteurs scalaires (string CSV) =====

function useLockIds(): string[] {
  // Cast en CSV pour rester scalaire au sens Zustand.
  const csv = useGessieStore((s) =>
    s.player.data ? Object.keys(s.player.data.locks).sort().join('\n') : '',
  );
  return csv === '' ? [] : csv.split('\n');
}

function useGroupIds(): string[] {
  const csv = useGessieStore((s) =>
    s.player.data ? Object.keys(s.player.data.groups).sort().join('\n') : '',
  );
  return csv === '' ? [] : csv.split('\n');
}

function useCentralLockUids(): string[] {
  const csv = useGessieStore((s) =>
    s.player.data ? Object.keys(s.player.data.centralLocks).sort().join('\n') : '',
  );
  return csv === '' ? [] : csv.split('\n');
}

function useLeverIdsWithKeyholes(): string[] {
  const csv = useGessieStore((s) => {
    const data = s.player.data;
    if (!data) return '';
    return Object.values(data.levers)
      .filter((l) => l.keyholes && Object.keys(l.keyholes).length > 0)
      .map((l) => l.id)
      .sort()
      .join('\n');
  });
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

// ===== Composant principal =====

export function KeysPanel() {
  const holdedKey = useGessieStore((s) => s.player.data?.holdedKey);
  const lockIds = useLockIds();
  const groupIds = useGroupIds();
  const centralLockUids = useCentralLockUids();
  const leverIds = useLeverIdsWithKeyholes();

  const total =
    lockIds.length + groupIds.length + centralLockUids.length + leverIds.length;
  if (total === 0) return null;

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: typography.size.xs,
    color: colors.text.muted,
    fontWeight: typography.weight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  };

  const sectionRowStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.sm,
  };

  const groupContainerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.xs}px ${spacing.sm}px`,
    background: colors.surface.darkest,
    border: `1px solid ${colors.border.subtle}`,
    borderRadius: 4,
  };

  return (
    <Panel
      title="Clés"
      meta={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: spacing.xs }}>
          <span>en main :</span>
          {holdedKey ? <KeyTag label={holdedKey} held /> : <span>—</span>}
        </span>
      }
      scroll
      maxHeight={240}
    >
      {leverIds.length > 0 && (
        <div>
          <div style={sectionTitleStyle}>Leviers</div>
          <div style={sectionRowStyle}>
            {leverIds.map((id) => (
              <LeverKeyholeBox key={id} leverId={id} groupContainerStyle={groupContainerStyle} />
            ))}
          </div>
        </div>
      )}

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
          <div style={sectionTitleStyle}>Cadenas ({lockIds.length})</div>
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
    </Panel>
  );
}

// ===== Sous-composants =====

function LeverKeyholeBox({
  leverId,
  groupContainerStyle,
}: {
  leverId: string;
  groupContainerStyle: React.CSSProperties;
}) {
  const keysCsv = useGessieStore((s) => {
    const lev = s.player.data?.levers[leverId];
    if (!lev?.keyholes) return '';
    return Object.keys(lev.keyholes).sort().join('\n');
  });
  const keys = keysCsv === '' ? [] : keysCsv.split('\n');
  if (keys.length === 0) return null;
  return (
    <div style={groupContainerStyle}>
      <strong style={{ fontSize: typography.size.xs, color: colors.text.secondary }}>L{leverId}</strong>
      {keys.map((k) => (
        <LeverKeyhole key={k} leverId={leverId} keyId={k} />
      ))}
    </div>
  );
}

function LeverKeyhole({ leverId, keyId }: { leverId: string; keyId: string }) {
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
      title={`${keyId} (${position})`}
    />
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
