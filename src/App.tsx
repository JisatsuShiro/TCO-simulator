import { useEffect, useMemo, useState } from 'react';
import { TcoViewport } from './components/tco/TcoViewport';
// SimControls supprimé : horloge + sélecteur de vitesse + badge discordances
// sont désormais intégrés au header du LeversPanel.
import { LeversPanel } from './components/sim/LeversPanel';
// import { TrainsPanel } from './components/sim/TrainsPanel'; // masqué temporairement
import { BlocsPanel } from './components/sim/BlocsPanel';
import { PhonePlayer } from './components/sim/PhonePlayer';
import { AudioPlayers } from './components/sim/AudioPlayers';
import { HomePage } from './components/HomePage';
import { ScenariosPage } from './components/ScenariosPage';
// KeysPanel n'existe plus comme panel autonome : ses sous-composants sont
// désormais rendus à l'intérieur du LeversPanel (serrures sous chaque levier
// + colonne auxiliaire à droite pour boîtes à clés / cadenas / verrous).
// DisturbancesPanel remplacé par un menu contextuel sur clic-droit d'item TCO.
// Le composant reste dans src/components/sim/ au cas où on rouvrirait
// une vue globale "avaries actives".
// import { DisturbancesPanel } from './components/sim/DisturbancesPanel';
import { useGessieStore } from './store/useGessieStore';
import { loadAllTools, loadStationByName, listStationNames } from './lib/loadFixtures';
import type { Scenario, ScenarioTrain } from './types/gessie';
import type { Direction, TrainSize } from './sim/types';

/** Délai en minutes (chaîne Gessie) → ms. `'0'`, vide ou non-parsable → 0. */
function parseDelayMinutesToMs(raw: string | undefined): number {
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n * 60_000;
}
import { GareSelect } from './design/primitives/GareSelect';
import { Logo } from './design/primitives/Logo';
import { ResizeHandle } from './design/primitives/ResizeHandle';
import { colors, spacing, typography } from './design/tokens';
import './App.css';

const DEFAULT_STATION = 'saint_saturnin';
const TCO_HEIGHT_KEY = 'voie-libre.tcoHeight';
const TCO_HEIGHT_KEY_LEGACY = 'Voie Libre.tcoHeight';
const TCO_HEIGHT_MIN = 200;
const TCO_HEIGHT_MAX_RATIO = 0.9; // 90% de la hauteur viewport

/**
 * Migration localStorage : si l'ancienne clé `Voie Libre.tcoHeight` existe et
 * qu'aucune valeur n'a encore été écrite sous la nouvelle clé `voie-libre.*`,
 * on transfère et on supprime l'ancienne. Idempotent : appelable plusieurs
 * fois sans effet de bord.
 */
function readTcoHeightFromStorage(): string | null {
  if (typeof window === 'undefined') return null;
  const current = window.localStorage.getItem(TCO_HEIGHT_KEY);
  if (current !== null) return current;
  const legacy = window.localStorage.getItem(TCO_HEIGHT_KEY_LEGACY);
  if (legacy !== null) {
    window.localStorage.setItem(TCO_HEIGHT_KEY, legacy);
    window.localStorage.removeItem(TCO_HEIGHT_KEY_LEGACY);
    return legacy;
  }
  return null;
}

type View = 'home' | 'scenarios' | 'sim';

/**
 * Parse "HH:MM:SS" (heure simulée d'un scénario Gessie) en epoch ms basé
 * sur la date du jour en UTC. Retourne `undefined` si non-parseable —
 * laisse alors `initPlayer` choisir `Date.now()`.
 */
function parseScenarioTime(hms: string | undefined): number | undefined {
  if (!hms) return undefined;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(hms.trim());
  if (!m) return undefined;
  const h = parseInt(m[1], 10);
  const mn = parseInt(m[2], 10);
  const s = parseInt(m[3] ?? '0', 10);
  if (h > 23 || mn > 59 || s > 59) return undefined;
  // Date du jour en UTC pour rester cohérent avec le format `Clock` (qui
  // affiche en UTC HH:MM:SS).
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, mn, s);
}

function isDirection(v: unknown): v is Direction {
  return v === 'pair' || v === 'impair';
}

function isTrainSize(v: unknown): v is TrainSize {
  return v === 'Petit' || v === 'Moyen' || v === 'Grand';
}

/**
 * Sanitize un train de scénario en arguments pour `startTrain`. Retourne
 * `null` si les champs requis ne sont pas reconnus (silencieux : un train
 * mal formé est juste ignoré).
 */
function scenarioTrainToParams(
  t: ScenarioTrain,
): { direction: Direction; size: TrainSize; speed: number; startingPoint: string } | null {
  if (!isDirection(t.direction)) return null;
  if (!isTrainSize(t.size)) return null;
  if (!t.startingPoint) return null;
  const speed = Number.isFinite(t.speed) ? t.speed : 1;
  return { direction: t.direction, size: t.size, speed, startingPoint: t.startingPoint };
}

function App() {
  const station = useGessieStore((s) => s.station);
  const loadStation = useGessieStore((s) => s.loadStation);
  const initPlayer = useGessieStore((s) => s.initPlayer);
  const startTrain = useGessieStore((s) => s.startTrain);
  const toggleDisturbance = useGessieStore((s) => s.toggleDisturbance);
  const addEvent = useGessieStore((s) => s.addEvent);

  const stationNames = useMemo(() => listStationNames().sort(), []);
  const [selected, setSelected] = useState<string>(() =>
    stationNames.includes(DEFAULT_STATION) ? DEFAULT_STATION : (stationNames[0] ?? '')
  );

  // Vue courante : 'home' = cards de fonctionnalités, 'scenarios' = liste
  // des scénarios pédagogiques, 'sim' = TCO + leviers + sim controls. Logo
  // cliquable → retour à 'home'.
  const [view, setView] = useState<View>('home');

  // Scénario sélectionné (si l'opérateur est entré en sim depuis la liste
  // des scénarios). Stocké pour pouvoir initialiser les trains/avaries
  // ultérieurement et afficher le nom du scénario dans le header.
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(null);

  const handleSelectScenario = (sc: Scenario) => {
    setActiveScenario(sc);
    setSelected(sc.station);
    setView('sim');
  };

  // Hauteur du TCO en px. Persistée dans localStorage entre sessions.
  // Initialisée à 50% de la hauteur viewport si rien en stockage.
  // Migre depuis l'ancienne clé `Voie Libre.tcoHeight` à la première lecture.
  const [tcoHeight, setTcoHeight] = useState<number>(() => {
    if (typeof window === 'undefined') return 480;
    const saved = readTcoHeightFromStorage();
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

  // Charge la gare puis lance la simulation. Ne se déclenche que quand
  // l'utilisateur est entré en vue 'sim' (clic card "Simulation libre"
  // ou clic scénario) — pas de chargement inutile tant qu'on est sur
  // la page d'accueil.
  //
  // Planification temporelle d'un scénario :
  //   - on initialise l'horloge à `scenario.starting_time` (UTC)
  //   - trains/avaries à `startingTime === 0` : déclenchés immédiatement
  //     (visibles à l'arrêt sur le TCO avant que l'opérateur ne presse
  //     play, fidèle au comportement Gessie d'origine)
  //   - trains/avaries à `startingTime > 0` (minutes) : programmés via
  //     `addEvent` à `t0 + minutes*60_000`. Ils déclenchent quand
  //     l'horloge atteint leur heure (le `processCheckEvents` du Clock
  //     les dispatche vers le routeur d'event Player)
  useEffect(() => {
    if (view !== 'sim') return;
    if (!selected) return;
    let cancelled = false;
    const tools = loadAllTools();
    loadStationByName(selected).then((s) => {
      if (!s || cancelled) return;
      loadStation(s, tools);
      const startMs = parseScenarioTime(activeScenario?.starting_time);
      initPlayer(startMs);
      if (!activeScenario) return;

      // T0 effectif : ce que `initPlayer` a mis dans l'horloge (startMs
      // si parsable, sinon `Date.now()`).
      const t0 = startMs ?? Date.now();

      for (const t of activeScenario.trains ?? []) {
        const params = scenarioTrainToParams(t);
        if (!params) continue;
        const delayMs = parseDelayMinutesToMs(t.startingTime);
        if (delayMs === 0) {
          startTrain(params);
        } else {
          // Event `startTrain` : payload `train` (name vide, attribué par
          // l'action au moment du spawn). Le routeur du store gère ce
          // type d'event (cf. dispatchPlayerEvent).
          addEvent({
            uid: '',
            type: 'startTrain',
            time: t0 + delayMs,
            train: {
              name: '',
              direction: params.direction,
              size: params.size,
              speed: params.speed,
              startingPoint: params.startingPoint,
            },
          });
        }
      }

      for (const a of activeScenario.avaries ?? []) {
        if (!a.item || !a.formattedType) continue;
        const delayMs = parseDelayMinutesToMs(a.startingTime);
        if (delayMs === 0) {
          toggleDisturbance({
            affectationId: a.item,
            disturbance: a.formattedType,
          });
        } else {
          addEvent({
            uid: '',
            type: 'toggleDisturbance',
            time: t0 + delayMs,
            affectationId: a.item,
            disturbance: a.formattedType,
          });
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    view,
    selected,
    activeScenario,
    loadStation,
    initPlayer,
    startTrain,
    toggleDisturbance,
    addEvent,
  ]);

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
        {/* Logo + titre cliquables : retour à la page d'accueil. Bouton
            "ghost" sans bordure pour ne pas alourdir le header. */}
        <button
          type="button"
          onClick={() => {
            setActiveScenario(null);
            setView('home');
          }}
          aria-label="Retour à l'accueil"
          title="Accueil"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing.sm,
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: 'inherit',
            fontFamily: 'inherit',
          }}
        >
          <Logo size={32} />
          <h1
            style={{
              margin: 0,
              fontSize: typography.size.lg,
              fontWeight: typography.weight.semibold,
              color: colors.text.primary,
              letterSpacing: 0.3,
            }}
          >
            Voie Libre
          </h1>
        </button>
        <span style={{ color: colors.text.muted, fontSize: typography.size.xs }}>POC TCO</span>
        {view === 'sim' && (
          <GareSelect value={selected} onChange={setSelected} options={stationNames} />
        )}
        {view === 'sim' && activeScenario && (
          <span
            style={{
              fontFamily: typography.mono.family,
              color: colors.accent.primary,
              fontSize: typography.size.xs,
              padding: '2px 8px',
              border: `1px solid ${colors.border.subtle}`,
              borderRadius: 999,
            }}
            title={`Scénario actif · départ ${activeScenario.starting_time ?? '—'}`}
          >
            scénario · {activeScenario.name}
          </span>
        )}
        {view === 'sim' && station && (
          <span style={{ color: colors.text.muted, fontSize: typography.size.xs, marginLeft: 'auto' }}>
            {station.items.length} items
          </span>
        )}
      </header>
      {view === 'home' ? (
        <HomePage
          onEnterSimulation={() => {
            setActiveScenario(null);
            setView('sim');
          }}
          onEnterScenarios={() => setView('scenarios')}
        />
      ) : view === 'scenarios' ? (
        <ScenariosPage onSelectScenario={handleSelectScenario} />
      ) : (
        <>
          <TcoViewport key={station?.id ?? 'empty'} height={tcoHeight} />
          <ResizeHandle onResize={handleTcoResize} onResizeEnd={persistTcoHeight} />
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
        </>
      )}
    </div>
  );
}

export default App;
