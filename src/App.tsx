import { useEffect, useMemo, useState } from 'react';
import { TcoViewport } from './components/tco/TcoViewport';
import { SimControls } from './components/sim/SimControls';
import { LeversPanel } from './components/sim/LeversPanel';
import { TrainsPanel } from './components/sim/TrainsPanel';
import { BlocsPanel } from './components/sim/BlocsPanel';
import { AtrPanel } from './components/sim/AtrPanel';
import { KeysPanel } from './components/sim/KeysPanel';
import { CommutFCPanel } from './components/sim/CommutFCPanel';
import { DisturbancesPanel } from './components/sim/DisturbancesPanel';
import { useGessieStore } from './store/useGessieStore';
import { loadAllTools, loadStationByName, listStationNames } from './lib/loadFixtures';
import './App.css';

const DEFAULT_STATION = 'clelles';

function App() {
  const station = useGessieStore((s) => s.station);
  const loadStation = useGessieStore((s) => s.loadStation);

  const stationNames = useMemo(() => listStationNames().sort(), []);
  const [selected, setSelected] = useState<string>(() =>
    stationNames.includes(DEFAULT_STATION) ? DEFAULT_STATION : (stationNames[0] ?? '')
  );

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    const tools = loadAllTools();
    loadStationByName(selected).then((s) => {
      if (s && !cancelled) loadStation(s, tools);
    });
    return () => {
      cancelled = true;
    };
  }, [selected, loadStation]);

  return (
    <div style={{ fontFamily: 'system-ui' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 16px 12px', marginBottom: 0 }}>
        <h1 style={{ margin: 0, fontSize: 18 }}>gessieWeb — POC TCO</h1>
        <label style={{ fontSize: 13, color: '#444', display: 'flex', alignItems: 'center', gap: 6 }}>
          Gare :
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            style={{
              padding: '4px 8px',
              fontSize: 13,
              fontFamily: 'inherit',
              borderRadius: 4,
              border: '1px solid #ccc',
              background: '#fff',
            }}
          >
            {stationNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <span style={{ color: '#666', fontSize: 13 }}>
          {station && `${station.items.length} items`}
          {' '}— survole un item pour voir son JSON
        </span>
      </header>
      <TcoViewport key={station?.id ?? 'empty'} height="50vh" />
      <SimControls />
      <TrainsPanel />
      <LeversPanel />
      <CommutFCPanel />
      <BlocsPanel />
      <AtrPanel />
      <KeysPanel />
      <DisturbancesPanel />
    </div>
  );
}

export default App;
