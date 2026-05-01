// Panel des blocs sémaphores (cantonnement). Affiche les blocs (s'il y en a)
// et fournit les boutons d'action : test, reddition, sémaphore, voie libre,
// annonce. Les actions sont silencieuses en cas de garde refusée (cohérent
// avec Gessie).
//
// Sélecteurs Zustand primitifs (count + accès indexé) pour éviter les boucles
// de re-render.

import { useGessieStore } from '../../store/useGessieStore';

export function BlocsPanel() {
  const blocsCount = useGessieStore((s) => s.player.data?.blocs.length ?? 0);
  if (blocsCount === 0) return null;

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
        maxHeight: 220,
        overflowY: 'auto',
      }}
    >
      <div style={{ fontWeight: 600 }}>Blocs cantonnement ({blocsCount})</div>
      {Array.from({ length: blocsCount }, (_, i) => (
        <BlocRow key={i} index={i} />
      ))}
    </div>
  );
}

function BlocRow({ index }: { index: number }) {
  // Sélecteurs primitifs un par un
  const id = useGessieStore((s) => s.player.data?.blocs[index]?.id ?? '');
  const gareLabel = useGessieStore((s) => s.player.data?.blocs[index]?.gareLabel ?? '');
  const test = useGessieStore((s) => s.player.data?.blocs[index]?.test ?? '');
  const voieLibre = useGessieStore((s) => s.player.data?.blocs[index]?.voieLibre ?? '');
  const reddition = useGessieStore((s) => s.player.data?.blocs[index]?.reddition ?? '');
  const annonce = useGessieStore((s) => s.player.data?.blocs[index]?.annonce ?? '');
  const commutSemaphore = useGessieStore((s) => s.player.data?.blocs[index]?.commutSemaphore ?? '');
  const commutSemaphoreLight = useGessieStore((s) => s.player.data?.blocs[index]?.commutSemaphoreLight ?? '');
  const blocage = useGessieStore((s) => s.player.data?.blocs[index]?.blocage ?? '');
  const semaphoreId = useGessieStore((s) => s.player.data?.blocs[index]?.semaphoreId ?? '');

  const pressTest = useGessieStore((s) => s.pressTestBouton);
  const pressReddition = useGessieStore((s) => s.pressRedditionBouton);
  const switchSem = useGessieStore((s) => s.switchSemaphoreBouton);
  const switchVL = useGessieStore((s) => s.switchVoieLibreBouton);
  const pressAnnonce = useGessieStore((s) => s.pressAnnonceBouton);

  const cellStyle: React.CSSProperties = {
    padding: '1px 4px',
    background: '#0f1923',
    borderRadius: 2,
  };
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
      <strong style={{ minWidth: 80 }}>{gareLabel}</strong>
      <span style={{ color: '#7f8c8d', fontSize: 10 }}>(sem: {semaphoreId || '—'})</span>
      <span style={cellStyle}>test={test}</span>
      <span style={cellStyle}>voieLibre={voieLibre}</span>
      <span style={cellStyle}>reddition={reddition}</span>
      <span style={cellStyle}>annonce={annonce}</span>
      <span style={cellStyle}>
        sem={commutSemaphore}/{commutSemaphoreLight}
      </span>
      <span style={cellStyle}>blocage={blocage}</span>
      <button style={btnStyle} onClick={() => pressTest(id)}>
        Test
      </button>
      <button style={btnStyle} onClick={() => pressReddition(id)}>
        Réddition
      </button>
      <button style={btnStyle} onClick={() => switchSem(id)}>
        Sémaph. {commutSemaphore === 'N' ? '→R' : '→N'}
      </button>
      <button style={btnStyle} onClick={() => switchVL(id)}>
        VL {voieLibre === 'A' ? '→E' : '→A'}
      </button>
      <button style={btnStyle} onClick={() => pressAnnonce(id)}>
        Annonce
      </button>
    </div>
  );
}
