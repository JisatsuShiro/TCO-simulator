import { useEffect, useMemo, useState } from 'react';
import { TcoViewport } from './components/tco/TcoViewport';
import { SimControls } from './components/sim/SimControls';
import { LeversPanel } from './components/sim/LeversPanel';
// import { TrainsPanel } from './components/sim/TrainsPanel'; // masqué temporairement
import { BlocsPanel } from './components/sim/BlocsPanel';
import { AtrPanel } from './components/sim/AtrPanel';
import { KeysPanel } from './components/sim/KeysPanel';
// DisturbancesPanel remplacé par un menu contextuel sur clic-droit d'item TCO.
// Le composant reste dans src/components/sim/ au cas où on rouvrirait
// une vue globale "avaries actives".
// import { DisturbancesPanel } from './components/sim/DisturbancesPanel';
import { useGessieStore } from './store/useGessieStore';
import { loadAllTools, loadStationByName, listStationNames } from './lib/loadFixtures';
import { GareSelect } from './design/primitives/GareSelect';
import { colors, spacing, typography } from './design/tokens';
import './App.css';

const DEFAULT_STATION = 'saint_saturnin';

function App() {
  const station = useGessieStore((s) => s.station);
  const loadStation = useGessieStore((s) => s.loadStation);
  const initPlayer = useGessieStore((s) => s.initPlayer);

  const stationNames = useMemo(() => listStationNames().sort(), []);
  const [selected, setSelected] = useState<string>(() =>
    stationNames.includes(DEFAULT_STATION) ? DEFAULT_STATION : (stationNames[0] ?? '')
  );

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
        minHeight: '100vh',
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
      <TcoViewport key={station?.id ?? 'empty'} height="50vh" />
      <SimControls />
      <LeversPanel />
      <BlocsPanel />
      <AtrPanel />
      <KeysPanel />
    </div>
  );
}

export default App;
