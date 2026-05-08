import { useEffect, useMemo, useState } from 'react';
import { TcoViewport } from './components/tco/TcoViewport';
import { SimControls } from './components/sim/SimControls';
import { LeversPanel } from './components/sim/LeversPanel';
// import { TrainsPanel } from './components/sim/TrainsPanel'; // masqué temporairement
import { BlocsPanel } from './components/sim/BlocsPanel';
import { PhonePlayer } from './components/sim/PhonePlayer';
import { AudioPlayers } from './components/sim/AudioPlayers';
// KeysPanel n'existe plus comme panel autonome : ses sous-composants sont
// désormais rendus à l'intérieur du LeversPanel (serrures sous chaque levier
// + colonne auxiliaire à droite pour boîtes à clés / cadenas / verrous).
// DisturbancesPanel remplacé par un menu contextuel sur clic-droit d'item TCO.
// Le composant reste dans src/components/sim/ au cas où on rouvrirait
// une vue globale "avaries actives".
// import { DisturbancesPanel } from './components/sim/DisturbancesPanel';
import { useGessieStore } from './store/useGessieStore';
import { loadAllTools, loadStationByName, listStationNames } from './lib/loadFixtures';
import { GareSelect } from './design/primitives/GareSelect';
import { ResizeHandle } from './design/primitives/ResizeHandle';
import { colors, spacing, typography } from './design/tokens';
import './App.css';

const DEFAULT_STATION = 'saint_saturnin';
const TCO_HEIGHT_KEY = 'gessieweb.tcoHeight';
const TCO_HEIGHT_MIN = 200;
const TCO_HEIGHT_MAX_RATIO = 0.9; // 90% de la hauteur viewport

function App() {
  const station = useGessieStore((s) => s.station);
  const loadStation = useGessieStore((s) => s.loadStation);
  const initPlayer = useGessieStore((s) => s.initPlayer);

  const stationNames = useMemo(() => listStationNames().sort(), []);
  const [selected, setSelected] = useState<string>(() =>
    stationNames.includes(DEFAULT_STATION) ? DEFAULT_STATION : (stationNames[0] ?? '')
  );

  // Hauteur du TCO en px. Persistée dans localStorage entre sessions.
  // Initialisée à 50% de la hauteur viewport si rien en stockage.
  const [tcoHeight, setTcoHeight] = useState<number>(() => {
    if (typeof window === 'undefined') return 480;
    const saved = window.localStorage.getItem(TCO_HEIGHT_KEY);
    const parsed = saved ? parseInt(saved, 10) : NaN;
    if (!isNaN(parsed) && parsed >= TCO_HEIGHT_MIN) return parsed;
    return Math.round(window.innerHeight * 0.5);
  });

  const persistTcoHeight = () => {
    window.localStorage.setItem(TCO_HEIGHT_KEY, String(tcoHeight));
  };

  const handleTcoResize = (deltaY: number) => {
    setTcoHeight((h) => {
      const max = Math.round(window.innerHeight * TCO_HEIGHT_MAX_RATIO);
      return Math.min(max, Math.max(TCO_HEIGHT_MIN, h + deltaY));
    });
  };

  // Charge la gare puis lance immédiatement la simulation : Léa atterrit
  // directement en mode play sans avoir à cliquer.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    const tools = loadAllTools();
    loadStationByName(selected).then((s) => {
      if (s && !cancelled) {
        loadStation(s, tools);
        initPlayer();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selected, loadStation, initPlayer]);

  return (
    <div
      style={{
        fontFamily: typography.ui.family,
        background: colors.surface.darkest,
        color: colors.text.primary,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.md,
          padding: `${spacing.sm}px ${spacing.md}px`,
          background: colors.surface.dark,
          borderBottom: `1px solid ${colors.border.subtle}`,
          flexShrink: 0,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: typography.size.lg,
            fontWeight: typography.weight.semibold,
            color: colors.text.primary,
            letterSpacing: 0.3,
          }}
        >
          gessieWeb
        </h1>
        <span style={{ color: colors.text.muted, fontSize: typography.size.xs }}>POC TCO</span>
        <GareSelect value={selected} onChange={setSelected} options={stationNames} />
        {station && (
          <span style={{ color: colors.text.muted, fontSize: typography.size.xs, marginLeft: 'auto' }}>
            {station.items.length} items
          </span>
        )}
      </header>
      <TcoViewport key={station?.id ?? 'empty'} height={tcoHeight} />
      <ResizeHandle onResize={handleTcoResize} onResizeEnd={persistTcoHeight} />
      <SimControls />
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        <LeversPanel />
        <BlocsPanel />
      </div>
      <PhonePlayer />
      <AudioPlayers />
    </div>
  );
}

export default App;
