// Panel des ATR (annulateurs de transit). Affiche la liste avec leur état
// (on/pressed/autorisation/terrain) et boutons press/release/autoriser.
//
// Sélecteurs primitifs uniquement (count + accès indexé par champ) pour
// éviter les boucles de re-render Zustand.

import { useGessieStore } from '../../store/useGessieStore';

export function AtrPanel() {
  const count = useGessieStore((s) => s.player.data?.transitAnnulateurs.length ?? 0);
  if (count === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
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
      <div style={{ fontWeight: 600 }}>Annulateurs de transit ({count})</div>
      {Array.from({ length: count }, (_, i) => (
        <AtrRow key={i} index={i} />
      ))}
    </div>
  );
}

function AtrRow({ index }: { index: number }) {
  const id = useGessieStore((s) => s.player.data?.transitAnnulateurs[index]?.id ?? '');
  const on = useGessieStore((s) => s.player.data?.transitAnnulateurs[index]?.on ?? false);
  const pressed = useGessieStore((s) => s.player.data?.transitAnnulateurs[index]?.pressed ?? false);
  const autorisation = useGessieStore((s) => s.player.data?.transitAnnulateurs[index]?.autorisation ?? false);
  const terrain = useGessieStore((s) => s.player.data?.transitAnnulateurs[index]?.terrain ?? false);

  const pressATR = useGessieStore((s) => s.pressATRBouton);
  const releaseATR = useGessieStore((s) => s.releaseATRBouton);
  const giveAuth = useGessieStore((s) => s.giveATRAutorisation);
  const removeAuth = useGessieStore((s) => s.removeATRAutorisation);

  const tag = (label: string, val: boolean): React.CSSProperties => ({
    padding: '1px 6px',
    fontSize: 11,
    background: val ? '#27ae60' : '#34495e',
    color: '#fff',
    borderRadius: 2,
  });

  const btnStyle: React.CSSProperties = {
    padding: '2px 8px',
    fontSize: 11,
    fontFamily: 'inherit',
    borderRadius: 3,
    border: '1px solid #2980b9',
    background: '#2980b9',
    color: 'white',
    cursor: 'pointer',
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      <strong style={{ minWidth: 60 }}>{id}</strong>
      <span style={tag('on', on)}>on</span>
      <span style={tag('pressed', pressed)}>pressed</span>
      <span style={tag('auth', autorisation)}>auth</span>
      <span style={tag('terrain', terrain)}>terrain</span>
      <button style={btnStyle} onClick={() => pressATR(id)}>
        Press
      </button>
      <button style={btnStyle} onClick={() => releaseATR(id)}>
        Release
      </button>
      <button style={btnStyle} onClick={() => giveAuth(id)}>
        Autoriser
      </button>
      <button style={btnStyle} onClick={() => removeAuth(id)}>
        Retirer
      </button>
    </div>
  );
}
