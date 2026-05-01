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

import { useGessieStore } from '../../store/useGessieStore';

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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        background: '#1c2a36',
        borderTop: '1px solid #34495e',
        color: '#ecf0f1',
        fontSize: 12,
        fontFamily: 'system-ui',
        maxHeight: 240,
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 600 }}>Clés</span>
        <span
          style={{
            padding: '2px 8px',
            background: holdedKey ? '#e67e22' : '#34495e',
            color: '#fff',
            borderRadius: 3,
            fontFamily: 'monospace',
          }}
        >
          en main : {holdedKey ?? '—'}
        </span>
      </div>

      {leverIds.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: '#95a5a6' }}>Leviers</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {leverIds.map((id) => (
              <LeverKeyholeBox key={id} leverId={id} />
            ))}
          </div>
        </div>
      )}

      {groupIds.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: '#95a5a6' }}>Boîtes à clés</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {groupIds.map((id) => (
              <GroupBox key={id} groupId={id} />
            ))}
          </div>
        </div>
      )}

      {lockIds.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: '#95a5a6' }}>
            Cadenas ({lockIds.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {lockIds.map((id) => (
              <LockBox key={id} keyId={id} />
            ))}
          </div>
        </div>
      )}

      {centralLockUids.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: '#95a5a6' }}>Verrous centraux</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {centralLockUids.map((uid) => (
              <CentralLockBox key={uid} uid={uid} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Sous-composants =====

function keyholeButton(
  label: string,
  presence: string | false,
  onClick: () => void,
  title?: string,
): React.ReactNode {
  const has = !!presence;
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        padding: '2px 8px',
        fontSize: 11,
        fontFamily: 'monospace',
        borderRadius: 3,
        border: `1px solid ${has ? '#27ae60' : '#7f8c8d'}`,
        background: has ? '#1e8449' : '#2c3e50',
        color: '#ecf0f1',
        cursor: 'pointer',
      }}
    >
      {label} {has ? '●' : '○'}
    </button>
  );
}

function LeverKeyholeBox({ leverId }: { leverId: string }) {
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
        alignItems: 'center',
        gap: 4,
        padding: '2px 6px',
        background: '#0f1923',
        borderRadius: 3,
      }}
    >
      <strong style={{ fontSize: 10 }}>L{leverId}</strong>
      {keys.map((k) => (
        <LeverKeyholeButton key={k} leverId={leverId} keyId={k} />
      ))}
    </div>
  );
}

function LeverKeyholeButton({ leverId, keyId }: { leverId: string; keyId: string }) {
  const presence = useGessieStore(
    (s) => s.player.data?.levers[leverId]?.keyholes?.[keyId]?.presence ?? false,
  );
  const position = useGessieStore(
    (s) => s.player.data?.levers[leverId]?.keyholes?.[keyId]?.position ?? '',
  );
  const holdedKey = useGessieStore((s) => s.player.data?.holdedKey);
  const takeKey = useGessieStore((s) => s.takeKey);
  const putKey = useGessieStore((s) => s.putKey);

  const handleClick = () => {
    if (presence) takeKey({ leverId, keyId });
    else if (holdedKey) putKey({ leverId, keyId });
  };

  return keyholeButton(
    keyId,
    presence,
    handleClick,
    `${keyId} (${position})`,
  ) as React.ReactElement;
}

function GroupBox({ groupId }: { groupId: string }) {
  const label = useGessieStore((s) => s.player.data?.groups[groupId]?.label ?? groupId);
  const keysCsv = useGessieStore((s) => {
    const grp = s.player.data?.groups[groupId];
    if (!grp) return '';
    return Object.keys(grp.keyholes).sort().join('\n');
  });
  const keys = keysCsv === '' ? [] : keysCsv.split('\n');
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 6px',
        background: '#0f1923',
        borderRadius: 3,
      }}
    >
      <strong style={{ fontSize: 10 }}>{label}</strong>
      {keys.map((k) => (
        <GroupKeyholeButton key={k} groupId={groupId} keyId={k} />
      ))}
    </div>
  );
}

function GroupKeyholeButton({ groupId, keyId }: { groupId: string; keyId: string }) {
  const presence = useGessieStore(
    (s) => s.player.data?.groups[groupId]?.keyholes[keyId]?.presence ?? false,
  );
  const holdedKey = useGessieStore((s) => s.player.data?.holdedKey);
  const takeKey = useGessieStore((s) => s.takeKey);
  const putKey = useGessieStore((s) => s.putKey);

  const handleClick = () => {
    if (presence) takeKey({ groupId, keyId });
    else if (holdedKey) putKey({ groupId, keyId });
  };

  return keyholeButton(keyId, presence, handleClick) as React.ReactElement;
}

function LockBox({ keyId }: { keyId: string }) {
  const presence = useGessieStore((s) => s.player.data?.locks[keyId]?.presence ?? false);
  const holdedKey = useGessieStore((s) => s.player.data?.holdedKey);
  const takeKey = useGessieStore((s) => s.takeKey);
  const putKey = useGessieStore((s) => s.putKey);

  const handleClick = () => {
    if (presence) takeKey({ lock: true, keyId });
    else if (holdedKey) putKey({ lock: true, keyId });
  };

  return keyholeButton(keyId, presence, handleClick) as React.ReactElement;
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

  const has = presence !== false;
  const handleClick = () => {
    if (has) takeCentralKey(uid);
    else if (holdedKey) putCentralKey(uid);
  };

  return keyholeButton(
    keyId,
    has ? keyId : false,
    handleClick,
    `central:${uid}`,
  ) as React.ReactElement;
}
