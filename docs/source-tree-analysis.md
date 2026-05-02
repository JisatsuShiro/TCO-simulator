# Source Tree Analysis — gessieWeb

_Generated 2026-05-02 by `bmad-document-project` (deep scan)._

This is an annotated map of the repository, focused on what an AI agent (or new human contributor) needs to know to navigate the code without wasting clicks. Rules and conventions live in `_bmad-output/project-context.md` — this file describes **structure**, not **policy**.

## Repository root

```
gessieWeb/
├── index.html                 # Vite HTML entry — mounts /src/main.tsx into #root
├── vite.config.ts             # Vite config (only @vitejs/plugin-react)
├── tsconfig.json              # Solution file → references tsconfig.app.json + tsconfig.node.json
├── tsconfig.app.json          # App TS config (strict-ish: noUnusedLocals/Parameters,
│                              # erasableSyntaxOnly, verbatimModuleSyntax)
├── tsconfig.node.json         # Vite/Node tooling TS config
├── eslint.config.js           # ESLint flat config (typescript-eslint + react-hooks + react-refresh)
├── package.json               # React 19, Zustand 5, Vite 8, dnd-kit, react-zoom-pan-pinch, jszip
├── package-lock.json
├── README.md                  # Vite template boilerplate (NOT real project docs — see _bmad-output/)
├── .gitignore
│
├── src/                       # Application source — see "src/" section below
├── public/                    # Static assets served at /
├── dist/                      # Vite build output (gitignored)
├── node_modules/              # (gitignored)
│
├── _bmad/                     # BMAD framework install (config + scripts + custom overrides)
├── _bmad-output/              # BMAD-generated artifacts (versioned, see project-context.md)
├── docs/                      # ← this file lives here
│
├── gessie_drawingAiguille.js  # Standalone dev helper (autonomous, do NOT touch — per project-context)
└── .claude/                   # Claude Code skills + settings (BMAD agents installed locally)
```

### Top-level entry points

| Concern | Path | Notes |
|---|---|---|
| HTML entry | `index.html` | Loads `/src/main.tsx` via `<script type="module">` |
| React entry | `src/main.tsx` | `createRoot(...).render(<StrictMode><App/></StrictMode>)` |
| App shell | `src/App.tsx` | Station selector, mounts `TcoViewport` + all sim panels |
| Build | `npm run build` | `tsc -b && vite build` — typecheck is the merge gate |

### Notable absences

- No `tests/`, no `__tests__/`, no `*.test.ts` — **no test runner installed by design**. See project-context rules; do not add a runner without explicit approval.
- No `.github/`, no `Dockerfile`, no `docker-compose.yml`, no CI config — **no deployment pipeline**.
- No `pages/`, no `app/`, no router — single-page React app, no routing layer.
- No `api/`, no backend — fixtures are static JSON loaded via `import.meta.glob`.
- No CSS framework, no CSS modules — `App.css` (1 rule) + `index.css` (~110 lines of legacy globals); UI uses inline `style={{...}}`.

## `src/` — application source

```
src/
├── main.tsx                   # React entry (StrictMode + createRoot)
├── App.tsx                    # App shell: station picker + viewport + panels grid
├── App.css                    # Single body { margin: 0 } reset
├── index.css                  # Legacy template globals (ignored by inline-styled UI)
│
├── assets/                    # SVG/PNG used in components (hero.png, react.svg, vite.svg)
│
├── types/
│   └── gessie.ts              # Static fixture types: Station, StationItem, Tool, Variation, ToolOption
│                              # (the JSON shape on disk — distinct from sim runtime types)
│
├── lib/
│   └── loadFixtures.ts        # Vite glob loaders: tools (eager) + stations (lazy)
│                              # Public API: loadAllTools(), listStationNames(), loadStationByName()
│
├── sim/                       # ★ Pure simulation layer — see "sim/" detail below ★
│   ├── types.ts               # Runtime types: PlayerData, Affectation, Lever, Bloc, SimEvent, etc.
│   ├── builder.ts             # Station JSON → PlayerData (the largest sim file at 1126 LOC)
│   ├── clock.ts               # Event-priority queue + logical clock (no game loop)
│   ├── player.ts              # PlayerState slice (mode + data holder)
│   ├── actions.ts             # Lever/signal/EPA actions (toggleLever, setEPAOff, closeWithFA, …)
│   ├── train.ts               # Train lifecycle (startTrain, moveTrainIn/Out, releasePedale, …)
│   ├── cantonnement.ts        # Block-section actions (test, reddition, sémaphore, voie libre, …)
│   ├── atr.ts                 # ATR (annulateur de transit) actions
│   ├── keys.ts                # Lever keys + central locks (annexe Ibis)
│   └── useClockTick.ts        # React hook: setInterval(1000) → store.tick() while mode=play
│
├── store/
│   └── useGessieStore.ts      # ★ The single Zustand store. Bridges Clock + Player slices
│                              # and exposes UI-callable actions (toggleLever, startTrain, …) ★
│
├── components/
│   ├── tco/                   # ★ TCO graphical primitives (SVG renderers) ★
│   │   ├── TcoViewport.tsx    # SVG container with optional pan/zoom (currently disabled)
│   │   ├── TcoCanvas.tsx      # Calculates viewBox from items, dispatches per-item Renderer
│   │   ├── renderers.tsx      # toolId → Renderer dispatch table (also default placeholder)
│   │   ├── ItemTooltip.tsx    # Hover tooltip showing raw item JSON
│   │   ├── TcoAiguille.tsx    # Switch (procedural, fidelity to Gessie)
│   │   ├── TcoTraverse.tsx    # tjd/tjs/to (procedural)
│   │   ├── TcoJoint.tsx       # Joint isolant (procedural)
│   │   ├── TcoControle.tsx    # Carré control box (largest @ 463 LOC, complex visual state)
│   │   ├── TcoSignal.tsx      # Signal indicator (semaphore/disque)
│   │   ├── TcoZone.tsx        # Track section (zone) coloring
│   │   ├── TcoRail.tsx        # Rail line segment
│   │   ├── TcoVoie.tsx        # Voie (track)
│   │   ├── TcoTrace.tsx       # Free traceLine
│   │   ├── TcoLabel.tsx       # Text label
│   │   ├── TcoSvgIcon.tsx     # Fallback SVG icon renderer (taquet, arrow, …)
│   │   └── TcoGenericPlaceholder.tsx  # Last-resort stub for unknown toolId
│   │
│   └── sim/                   # Operator-action panels (button/state UI)
│       ├── SimControls.tsx    # Mode toggle (edit/play), speed selector, clock readout
│       ├── LeversPanel.tsx    # Lever buttons (+/−), red flash on silent refusal
│       ├── TrainsPanel.tsx    # Train list + start-train form
│       ├── BlocsPanel.tsx     # Cantonnement (block) section controls
│       ├── AtrPanel.tsx       # ATR (annulateur de transit) controls
│       ├── KeysPanel.tsx      # Key cabinets + central locks (largest sim panel @ 305 LOC)
│       ├── CommutFCPanel.tsx  # Fermeture Carré commutator
│       └── DisturbancesPanel.tsx  # Avaries menu (RATE_*, NON_LIBERATION_*, …)
│
└── data/                      # Fixtures (immutable scenario data — do NOT modify)
    ├── items/                 # Tool definitions (one folder per kind) — eager-loaded
    │   ├── aiguille-0.0.0/settings.json
    │   ├── arrow-0.0.0/settings.json
    │   ├── controle-0.0.0/settings.json
    │   ├── joint-0.0.0/settings.json
    │   ├── label-0.0.0/settings.json
    │   ├── rail-0.0.0/settings.json
    │   ├── signal-0.0.0/settings.json
    │   ├── taquet-0.0.0/settings.json
    │   ├── tjd-0.0.0/settings.json
    │   ├── tjs-0.0.0/settings.json
    │   ├── to-0.0.0/settings.json
    │   ├── trace-0.0.0/settings.json
    │   ├── voie-0.0.0/settings.json
    │   └── zone-0.0.0/settings.json
    │
    └── stations/              # Station scenarios — lazy-loaded (one folder per station)
        ├── clelles/           # ← default station
        ├── saint_saturnin/    # ← reference for C211 / commutFC tests
        ├── amvville/
        ├── aville_p2/
        ├── jarze/
        ├── la_presle/
        ├── monestier/
        ├── monestier_v3/
        ├── montfort_sur_meu___serrures/
        ├── passyle_st_jean___maquette/
        └── vif/
```

## `src/sim/` — pure simulation layer

The sim layer is a **strictly inbound dependency**: it owns the railway-signaling logic and exposes pure functions. It must NOT import from `store/` or `components/` — see `_bmad-output/project-context.md` "Architecture en couches".

| File | LOC | Role |
|---|---|---|
| `types.ts` | 355 | Runtime types: `PlayerData`, `Affectation`, `Lever`, `Bloc`, `SimEvent`, `Incompatibility`, etc. ID conventions (`Ag<n>` for switches, `z <name>` for zones, `gare-<n>` for cantonnement) live in the file header. |
| `builder.ts` | 1126 | `stationToPlayerData(station, tools) → PlayerData`. Parses incompatibility strings (`"1+, 2-, (3+ ou 4-)"`), builds levers, affectations, blocs, key groups, central locks. Reverse-engineered from `renderer.js @128000-@143000`. |
| `clock.ts` | 174 | Event queue + logical clock. `clockReducers` (pure), `processCheckEvents`, `processTick`. The clock has no game loop — it's purely event-driven, sorted by time ascending. |
| `player.ts` | 25 | `PlayerState` slice: `{ mode: 'edit' \| 'play', data: PlayerData \| null }`. State holder, no actions. |
| `actions.ts` | 990 | Lever, signal, EPA, FA, commutFC actions. Each returns `ActionResult` (state, events?, pauseEventUids?, resumeEventUids?, removeEvents?). Silent failure on guard refusal. |
| `train.ts` | 810 | Train lifecycle: `startTrain`, `moveTrainIn`, `moveTrainOut`, `releasePedale`, `toggleDisturbance`. |
| `cantonnement.ts` | 226 | Block-section operator actions (BAL): test, reddition, sémaphore commutator, voie libre, annonce. |
| `atr.ts` | 173 | Annulateur de transit: press/release, autorisation. |
| `keys.ts` | 258 | Key cabinets, lever keyholes, central locks (annexe Ibis). |
| `useClockTick.ts` | 18 | React hook (the only `.ts` in sim that touches React) — pose `setInterval(1000) → store.tick()` while mode=play. |

## `src/store/useGessieStore.ts` — the bridge

Single Zustand 5 store, ~625 LOC. Owns:

- **Static data:** `station`, `tools`, `hoveredUid` (UI debug)
- **Sim state:** `clock: ClockState`, `player: PlayerState` (the slices defined in `sim/clock.ts` and `sim/player.ts`)
- **Lifecycle actions:** `loadStation`, `initPlayer`, `exitPlayer`, `setSpeed`, `addEvent`, `checkEvents`, `tick`
- **Operator actions:** `toggleLever`, `cancelEPA`, `closeWithFA`, `toggleCommutFC`, `startTrain`, `toggleDisturbance`, plus cantonnement/ATR/keys actions
- **Internal `dispatchPlayerEvent` router:** event-type → handler dispatch table (per project-context, _the_ canonical pattern instead of giant `switch`)

## `src/components/` — UI layers

Two siblings, two roles:

- **`tco/`** — pure SVG rendering of the Tableau de Contrôle Optique. Each item kind (`aiguille`, `signal`, `controle`, `zone`, …) has a dedicated `Tco<Kind>.tsx` component, dispatched by `renderers.tsx`. Visual state is read from the store via **CSV-encoded scalar selectors + `useMemo` decode** (see project-context "Sélecteurs Zustand").
- **`sim/`** — operator-action panels. One panel per family of interactions (`LeversPanel`, `TrainsPanel`, `BlocsPanel`, `AtrPanel`, `KeysPanel`, `CommutFCPanel`, `DisturbancesPanel`, `SimControls`).

## `public/`

```
public/
├── favicon.svg
├── icons.svg                  # SVG icon sprite (referenced by TcoSvgIcon)
└── items/                     # Pre-rendered item icons (PNG/SVG fallbacks for Gessie tools)
```

## Critical folders summary

| Folder | Role | Fragility |
|---|---|---|
| `src/sim/` | Pure simulation domain | **High** — port of Gessie behavior; changes alter game logic. Reference: `renderer.js` line ranges in headers. |
| `src/store/useGessieStore.ts` | Bridge between sim + UI | **High** — selector contract + dispatch table; wrong selector shape causes infinite renders. |
| `src/components/tco/` | Visual primitives | **Medium** — SVG geometry must match Gessie reference; visual state via CSV scalar selectors. |
| `src/components/sim/` | Operator UI | **Low/Medium** — adding a panel mostly means adding a sibling file + mounting in `App.tsx`. |
| `src/data/items/` | Tool definitions | **Frozen** — eager-loaded JSON, do not modify. |
| `src/data/stations/` | Scenario data | **Frozen** — lazy-loaded, do not modify (and don't `import` directly — use `loadStationByName`). |
| `src/lib/loadFixtures.ts` | Vite glob entry point | **Low** — small, only modify if changing fixture layout. |

## Where to start by task

| Goal | Start here |
|---|---|
| Add a new operator action | `src/sim/actions.ts` (or sibling) → wire in `src/store/useGessieStore.ts` → add panel UI in `src/components/sim/` |
| Add a new TCO item kind | `src/types/gessie.ts` (Tool definition shape) → `src/components/tco/Tco<Kind>.tsx` → register in `src/components/tco/renderers.tsx` |
| Tweak event timing / queue | `src/sim/clock.ts` (or the action that emits the event in `src/sim/`) |
| Investigate a station-specific bug | `src/data/stations/<name>/settings.json` (read-only) + the relevant action in `src/sim/` |
| Understand state shape | `src/sim/types.ts` (`PlayerData`, `Affectation`, `Lever`) + `src/sim/builder.ts` (how it gets populated) |
| Visual regression | `src/components/tco/<Tco*>.tsx` + the corresponding `renderer.js` reference offset in the file header |
