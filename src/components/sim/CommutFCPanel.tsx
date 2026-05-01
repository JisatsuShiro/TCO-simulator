// Panel des commutateurs de Fermeture Carré (FC).
//
// Reproduit Gessie tco-commut-fc (renderer.js @303800) : un bouton par
// signal qui possède un commutateur FC (i.e. `positionFC !== undefined`).
// Clic → bascule positionFC. Verrouillé = cadre rouge.
//
// Sélecteurs primitifs pour éviter les boucles Zustand.

import { useGessieStore } from '../../store/useGessieStore';

function useFcSignalIds(): string[] {
  const csv = useGessieStore((s) => {
    if (!s.player.data) return '';
    return Object.entries(s.player.data.affectations)
      .filter(([, a]) => a.positionFC !== undefined)
      .map(([id]) => id)
      .sort()
      .join('\n');
  });
  return csv === '' ? [] : csv.split('\n');
}

export function CommutFCPanel() {
  const ids = useFcSignalIds();
  if (ids.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 12,
        background: '#1c2a36',
        borderTop: '1px solid #34495e',
        color: '#ecf0f1',
        fontSize: 12,
        fontFamily: 'system-ui',
        maxHeight: 200,
        overflowY: 'auto',
      }}
    >
      <div style={{ fontWeight: 600 }}>
        Commutateurs FC ({ids.length})
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {ids.map((id) => (
          <CommutFCButton key={id} signalId={id} />
        ))}
      </div>
    </div>
  );
}

function CommutFCButton({ signalId }: { signalId: string }) {
  const locked = useGessieStore(
    (s) => Boolean(s.player.data?.affectations[signalId]?.positionFC),
  );
  const toggle = useGessieStore((s) => s.toggleCommutFC);

  return (
    <button
      onClick={() => toggle(signalId)}
      title={`Commutateur FC ${signalId}`}
      style={{
        padding: '4px 10px',
        fontSize: 11,
        fontFamily: 'monospace',
        borderRadius: 3,
        border: `1px solid ${locked ? '#e74c3c' : '#7f8c8d'}`,
        background: locked ? '#7f1d1d' : '#34495e',
        color: '#ecf0f1',
        cursor: 'pointer',
        minWidth: 80,
      }}
    >
      <span style={{ fontWeight: 600 }}>{signalId}</span>
      <span style={{ marginLeft: 6, opacity: 0.85 }}>{locked ? 'F' : 'O'}</span>
    </button>
  );
}
