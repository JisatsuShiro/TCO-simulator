// Barre de contrôle minimale pour la sim : lancer/arrêter, vitesse, horloge.
// Étape 1 du portage — pas encore d'événements métier câblés, mais ça permet
// de vérifier que Clock et Player sont correctement initialisés.

import { useGessieStore } from '../../store/useGessieStore';
import { useClockTick } from '../../sim/useClockTick';

const SPEEDS = [0, 1, 2, 5, 10];

function formatTime(ms: number): string {
  if (!ms) return '--:--:--';
  const d = new Date(ms);
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mm = d.getUTCMinutes().toString().padStart(2, '0');
  const ss = d.getUTCSeconds().toString().padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function SimControls() {
  // Pose le setInterval tant qu'on est en mode play.
  useClockTick();

  const mode = useGessieStore((s) => s.player.mode);
  const speed = useGessieStore((s) => s.clock.speed);
  const currentTime = useGessieStore((s) => s.clock.currentTime);
  const eventsCount = useGessieStore((s) => s.clock.events.length);
  const affectationsCount = useGessieStore((s) =>
    s.player.data ? Object.keys(s.player.data.affectations).length : 0
  );
  const leversCount = useGessieStore((s) =>
    s.player.data ? Object.keys(s.player.data.levers).length : 0
  );

  const initPlayer = useGessieStore((s) => s.initPlayer);
  const exitPlayer = useGessieStore((s) => s.exitPlayer);
  const setSpeed = useGessieStore((s) => s.setSpeed);

  const wrapperStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 16px',
    background: '#2c3e50',
    color: '#ecf0f1',
    fontSize: 13,
    fontFamily: 'system-ui',
    borderTop: '1px solid #34495e',
  };

  const btnStyle: React.CSSProperties = {
    padding: '4px 10px',
    fontSize: 12,
    fontFamily: 'inherit',
    borderRadius: 3,
    border: '1px solid #7f8c8d',
    background: '#34495e',
    color: '#ecf0f1',
    cursor: 'pointer',
  };

  if (mode === 'edit') {
    return (
      <div style={wrapperStyle}>
        <button style={btnStyle} onClick={() => initPlayer()}>
          Lancer simulation
        </button>
        <span style={{ color: '#95a5a6' }}>Mode édition (sim arrêtée)</span>
      </div>
    );
  }

  return (
    <div style={wrapperStyle}>
      <button style={btnStyle} onClick={exitPlayer}>
        Arrêter
      </button>
      <span>Mode play</span>
      <span style={{ marginLeft: 16, fontFamily: 'monospace', fontSize: 14 }}>
        ⏱ {formatTime(currentTime)}
      </span>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        Vitesse :
        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          style={{
            padding: '2px 6px',
            fontSize: 12,
            fontFamily: 'inherit',
            background: '#34495e',
            color: '#ecf0f1',
            border: '1px solid #7f8c8d',
            borderRadius: 3,
          }}
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s === 0 ? 'pause' : `×${s}`}
            </option>
          ))}
        </select>
      </label>
      <span style={{ color: '#95a5a6', marginLeft: 12 }}>
        {affectationsCount} affectations · {leversCount} leviers · {eventsCount} events
      </span>
    </div>
  );
}
