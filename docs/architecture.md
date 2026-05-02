# Architecture — gessieWeb

_Generated 2026-05-02 by `bmad-document-project` (deep scan, web project type)._

## Executive summary

**gessieWeb** is a single-page web port of the **Gessie** train-signaling simulator (originally a Vue + Electron desktop app). It reproduces the operator's view of a French SNCF *Tableau de Contrôle Optique* (TCO): the operator manipulates levers, signals, blocs, ATRs and keys to route trains through a station while the simulation enforces interlocking rules and disturbances ("avaries").

This is a **POC port**, not a green-field rewrite. The source of truth for behavior is a webpack-extracted `renderer.js` from the original Electron bundle; ported files reference the original line offsets in headers (`// renderer.js @<line>`).

## Architecture pattern

**Layered, store-mediated React + Zustand SPA** with a strict dependency direction:

```
       ┌─────────────────────────────────┐
       │  src/components/   (React UI)   │
       │  ├── tco/   SVG primitives      │
       │  └── sim/   Operator panels     │
       └────────────┬────────────────────┘
                    │ reads via selectors,
                    │ writes via store actions
       ┌────────────▼────────────────────┐
       │  src/store/useGessieStore.ts    │
       │  (Zustand: single store)        │
       │  • bridges Clock + Player       │
       │  • dispatchPlayerEvent table    │
       └────────────┬────────────────────┘
                    │ pure-function calls
       ┌────────────▼────────────────────┐
       │  src/sim/          (pure)       │
       │  • types  • clock  • builder    │
       │  • player • actions • train     │
       │  • cantonnement • atr • keys    │
       └─────────────────────────────────┘
                    ▲
                    │ static fixtures, eager+lazy globs
       ┌────────────┴────────────────────┐
       │  src/data/    src/lib/          │
       │  (JSON)       (loadFixtures)    │
       └─────────────────────────────────┘
```

**Invariants:**

- `src/sim/*` never imports from `store/` or `components/` (no React, no DOM, no Zustand).
- `src/store/*` never imports from `components/`.
- `src/components/*` never calls `src/sim/*` directly — always via store wrappers.
- `dispatchPlayerEvent` in the store is a `Record<eventType, handler>` table, not a `switch`.

This isolates the simulation core: it is pure-functional (modulo a uid counter in `clock.ts`), trivially testable in principle (no test runner is installed today), and can be re-hosted under a different UI shell without changes.

## Technology stack

| Category | Technology | Version | Notes / justification |
|---|---|---|---|
| Language | TypeScript | ~6.0.2 | `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals/Parameters`. **No `enum`/`namespace`/parameter-properties** — use `const` objects + literal union types instead. `strict: false`. |
| Target | ES2023 | — | `lib: ["ES2023", "DOM"]`, `moduleResolution: "bundler"`. |
| UI framework | React | ^19.2.5 | Function components only, JSX runtime auto (no `import React`). React 19 features available; no React Compiler enabled. |
| State | Zustand | ^5.0.12 | Single store. Selectors must return scalars or stable references — composite reads encoded as CSV strings + `useMemo` decode. |
| Build | Vite | ^8.0.10 | `npm run build` = `tsc -b && vite build`. **Typecheck is the merge gate.** |
| Bundler runtime | Rolldown (via Vite 8) | — | Default bundler in Vite 8. |
| React glue | `@vitejs/plugin-react` | ^6.0.1 | Uses Oxc by default per Vite 8. |
| DnD (planned) | `@dnd-kit/core` | ^6.3.1 | Listed but not used in current code (POC stage). |
| Pan/zoom (parked) | `react-zoom-pan-pinch` | ^4.0.3 | Imported into `TcoViewport` but currently disabled (kept as dependency for future re-enable). |
| Archive utility | `jszip` | ^3.10.1 | For future scenario import/export — not used in current code. |
| Lint | ESLint | ^10.2.1 | Flat config (`eslint.config.js`). `typescript-eslint:recommended`, `react-hooks:recommended-flat`, `react-refresh:vite`. |
| Runtime | Node | ≥ 24 | Implied by `@types/node@^24` and Vite 8 requirements. |
| Testing | _none installed_ | — | **No vitest/jest/playwright/RTL.** `npm run lint && npm run build` is the only correctness gate. |
| CI/CD | _none_ | — | No `.github/`, no Jenkinsfile, no Docker. Local dev only. |

**The stack is deliberately boring.** Per `project-context.md`: "Pas de Redux Toolkit, TanStack Query, Tailwind, etc. — la stabilité du stack est une décision d'archi. Toute nouvelle dépendance se discute avant ajout."

## Data architecture

There is **no database** and **no backend**. All persistent data lives as static JSON in `src/data/` and is loaded at runtime via `import.meta.glob`.

### Two fixture shapes

| Kind | Path | Loading | Purpose |
|---|---|---|---|
| **Tool** | `src/data/items/<kind>-<version>/settings.json` | **Eager** (`{ eager: true }`) | Defines a kind of TCO element (aiguille, signal, controle, zone, …). Small, shared across renders. Loaded once at startup via `loadAllTools()`. |
| **Station** | `src/data/stations/<name>/settings.json` | **Lazy** (function returns `Promise<Station>`) | A complete scenario: items placed on the TCO, enclenchements, parcours, cantonnement, key cabinets (annexes I-VI). Large; one is loaded at a time via `loadStationByName(name)`. |

Loader contract: `src/lib/loadFixtures.ts` (35 LOC) — three exports:

```ts
loadAllTools(): Tool[]                       // eager
listStationNames(): string[]                 // eager (folder names)
loadStationByName(name): Promise<Station|null>  // lazy
```

### Static types vs runtime types

- **`src/types/gessie.ts`** — the JSON shape on disk: `Station`, `StationItem`, `Tool`, `Variation`, `ToolOption`. Mirrors what's in `settings.json` files.
- **`src/sim/types.ts`** — the runtime shape after `stationToPlayerData(station, tools)`: `PlayerData`, `Affectation`, `Lever`, `Bloc`, `KeyGroup`, `CentralLock`, `TransitAnnulator`, `SimEvent`. Dynamic state, mutated through actions.

### The `PlayerData` runtime shape

`PlayerData` (built once per `initPlayer()` call) holds:

| Field | Shape | Indexed by |
|---|---|---|
| `levers` | `Record<string, Lever>` | lever id (e.g. `"1"`, `"2"`, `"FC"`) |
| `affectations` | `Record<string, Affectation>` | semantic id (`Ag<n>` for aiguille, `<name>` for signal/controle, `z <name>` for zone, `gare-<n>` for cantonnement) |
| `blocs` | `Bloc[]` | array (id field on each) |
| `groups` | `Record<string, KeyGroup>` | group id (key cabinets) |
| `locks` | `Record<string, KeyHole>` | lock id |
| `centralLocks` | `Record<string, CentralLock>` | uid |
| `transitAnnulateurs` | `TransitAnnulator[]` | array |
| `scenarioTargets` | `Record<itemId, Record<trainName, disturbance>>` | nested map |
| `holdedKey`, `phoneIsRinging`, `discordances_count` | scalars |

**ID conventions are load-bearing.** Annex JSON references items by these strings — never change the ID generation in `builder.ts`. See `src/sim/types.ts` header for the full convention table. Note also that zones may be referenced as `"1"` _or_ `"z 1"` depending on the annex source; use `getZoneAffect` to test both, never index `affectations` directly with an unverified id.

## Event-driven simulation core

**There is no game loop.** The simulation is a priority queue of `SimEvent` items, sorted by `time` ascending, drained by a 1-second logical tick.

### Components

```
src/sim/clock.ts            Pure: ClockState, clockReducers, processCheckEvents, processTick
src/sim/useClockTick.ts     React: setInterval(1000) → store.tick() while mode=play
src/store/useGessieStore.ts Glue: tick() / addEvent() / checkEvents() / dispatchPlayerEvent
```

### `SimEvent` shape (excerpt)

```ts
interface SimEvent {
  uid: string;            // assigned by ensureUid() if empty at addEvent time
  time: number | undefined;       // ms epoch; undefined when paused
  type: string;           // dispatched to a handler in dispatchPlayerEvent
  remainingTime?: number; // when paused: ms left until time
  // payload (per type):
  train?: Train; target?: string; affectationId?: string; blocId?: string;
  signalId?: string; disturbance?: string; zoneId?: string;
  direction?: 'pair' | 'impair'; controlId?: string; delay?: number;
  [key: string]: unknown;
}
```

### Tick lifecycle

```
useClockTick   ──setInterval(1000)──▶  store.tick()
                                            │
                                            ▼
                              processTick(clockState)
                                  if speed === 0: no-op
                                  newTime = current + 1000 * speed
                                  return processCheckEvents(state, newTime)
                                            │
                                            ▼
                              While events[0].time ≤ newTime:
                                  shift event, push into toDispatch
                                            │
                                            ▼
                              For each toDispatch event:
                                  dispatchPlayerEvent(playerData, clock, event)
                                            │
                                            ▼
                              Apply DispatchResult:
                                  • set new player data
                                  • addEvent(...) for newEvents
                                  • PAUSE_EVENT / RESUME_EVENT for ids
                                  • REMOVE_EVENT for predicate matches
```

Speed 0 = pause; 1 = realtime; 2/5/10 = accelerated. UI surfaces speeds via `SimControls`.

### `ActionResult` contract

A closed contract returned by every sim action:

```ts
interface ActionResult {
  state: PlayerData;
  events?: SimEvent[];                       // events to add to the queue
  pauseEventUids?: string[];                 // events to move to paused list
  resumeEventUids?: string[];                // events to wake from paused list
  removeEvents?: (event: SimEvent) => boolean; // PREDICATE, not a list of UIDs
}
```

**Important nuances:**
- `removeEvents` is a **predicate function**, not an array of UIDs. Filter by event semantics, not identity.
- Adding a field to `ActionResult` requires updating both the store routing _and_ this doc.
- `uid: ''` in a newly-emitted event is fine — the store calls `ensureUid()` and assigns one. Never hardcode UIDs.

### Silent-failure semantics

If a guard refuses an action (incompatibility, EAP/EPA active, zone occupied, key absent…), the action returns `state` unchanged with no events, no log, no exception. The UI detects refusal by comparing `before/after` (see `LeversPanel.handleClick` for the canonical pattern: read state, dispatch, then a 0ms `setTimeout` that diffs).

This is not a code smell — it's faithful to Gessie's UX expectation. **Do not "improve" by throwing.**

## State management — Zustand 5 patterns

Single store: `useGessieStore`. ~625 LOC. All UI subscribes to it.

### Selector rules

- Selectors **must return scalars** (`string`, `number`, `boolean`, `null`) or **stable references**. A new object/array per render triggers React's "getSnapshot should be cached" warning and an infinite render loop.
- For multiple fields, write multiple scalar selectors (verbose but correct — see `AtrPanel.tsx`).
- For composite state (lists, joined flags), encode as **CSV string** in the selector, then `useMemo(() => decode(csv), [csv])` outside. Canonical example: `useControleVisualState` in `src/components/tco/TcoControle.tsx`.
- For imperative one-shot reads, use `useGessieStore.getState().…` (see `LeversPanel.handleClick`).
- The 2-arg Zustand v4 selector signature is gone; use `useShallow` from `zustand/react/shallow` for slice reads.

### CSV encoding rules

```ts
function useFooCsv(): string {
  return useGessieStore((s) => {
    // sort BEFORE join to keep the string stable across renders
    return lines.sort().join('\n');
  });
}
const csv = useFooCsv();
const data = useMemo(() => decode(csv), [csv]);
```

The `sort()` is non-negotiable — without it, the string order drifts and selectors invalidate every render.

## API design

**Not applicable.** No HTTP/REST/GraphQL/RPC. The sim runs entirely in the browser; the only "API" is:

- **Vite glob**: `import.meta.glob('../data/items/*/settings.json', { eager: true })` and the lazy stations equivalent
- **Store actions**: methods on `useGessieStore` (typed via the `GessieState` interface)
- **Browser primitives**: `setInterval`, `Date.now`, no fetch/XHR

## Component architecture

Two siblings, two contracts.

### `src/components/tco/` — SVG renderers

Pure visualization. Each item kind has a dedicated component, dispatched by `renderers.tsx`:

```ts
const renderers: Record<string, ComponentType<PrimitiveProps>> = {
  aiguille: TcoAiguille, tjd: TcoTraverse, tjs: TcoTraverse, to: TcoTraverse,
  taquet: TcoTaquet, joint: TcoJoint, arrow: TcoArrow,
  rail: TcoRail, voie: TcoVoie, controle: TcoControle, zone: TcoZone,
  trace: TcoTrace, label: TcoLabel, signal: TcoSignal,
};
function getRenderer(toolId): ComponentType<PrimitiveProps> {
  return renderers[toolId] ?? TcoGenericPlaceholder;
}
```

**Adding a new TCO item kind:** add the `Tco<Kind>.tsx` file, register in `renderers.tsx`, ensure the corresponding fixture exists under `src/data/items/<kind>-<version>/settings.json`.

`TcoCanvas.tsx` computes a viewBox from item positions and dispatches per-item via `getRenderer`. `TcoViewport.tsx` is the outer container (pan/zoom currently disabled but library kept).

### `src/components/sim/` — Operator panels

One panel per family of interactions. The convention:

1. Selectors at the top (scalar selectors or CSV+useMemo).
2. Handlers call store actions (`useGessieStore((s) => s.toggleLever)`).
3. JSX at the bottom, inline-styled.
4. For panels that need to detect silent refusal, use the `LeversPanel.handleClick` pattern: capture `positionBefore`, dispatch, `setTimeout(0)` to diff.

| Panel | Action surface |
|---|---|
| `SimControls` | Mode toggle, speed selector, clock readout. Mounts `useClockTick()`. |
| `LeversPanel` | Toggle levers (silent failure → red flash). |
| `TrainsPanel` | Spawn trains (direction, size, speed, starting point). |
| `BlocsPanel` | Cantonnement (BAL block sections): test, reddition, sémaphore, voie libre, annonce. |
| `AtrPanel` | ATR press/release/cancel/autorisation. |
| `KeysPanel` | Lever keys + central locks. |
| `CommutFCPanel` | Fermeture Carré commutator (lockout). |
| `DisturbancesPanel` | Inject avaries onto affectations or blocs. |

## Source tree

See `./source-tree-analysis.md` for the annotated directory tree.

## Development workflow

See `./development-guide.md` for setup, build, run, and station selection.

**Quick reference:**
- `npm install` — install deps
- `npm run dev` — Vite dev server (HMR)
- `npm run build` — `tsc -b && vite build` — **the merge gate**
- `npm run lint` — ESLint
- `npm run preview` — preview production build

**No tests.** The combination of strict typecheck (`noUnusedLocals/Parameters`, `verbatimModuleSyntax`) + ESLint is the correctness floor. Manual smoke testing happens in `npm run dev` against the default `clelles` station and `saint_saturnin` for `commutFC` cases.

## Deployment architecture

**There is none today.** The project produces a static SPA via `vite build` (output in `dist/`). There is no:
- CI/CD pipeline (no `.github/workflows/`, no Jenkinsfile)
- Docker image
- Hosting target wired up
- Environment-variable handling (no `.env` files referenced)

Deploying is left as future work — when needed, any static hosting (Netlify/Vercel/GH Pages/S3+CloudFront) will work for the `dist/` output as-is.

## Testing strategy

**Aucun runner installé.** Per `project-context.md` rules:

- Do not create `*.test.ts`, `__tests__/`, or `__mocks__/` files without explicit user approval.
- The merge gate is `npm run lint && npm run build`.
- Manual verification path: `npm run dev` → open default station (`clelles`) → exercise the golden path of the changed feature → exercise refusal cases (silent failure should be observable via UI feedback).
- If a runner is approved later: prefer **vitest** (Vite-native) over Jest. The pure `src/sim/*` layer is the natural first target — no React mocking needed.

## Reverse-engineering reference

The behavior source of truth is `C:\Users\guill\ghidra\gessie_extracted\app_src\dist\electron\renderer.js` (Vue/Electron Gessie webpack-extracted bundle). Ported sim files cite line offsets:

```ts
// renderer.js @276350 — menu contextuel aiguille
```

These line numbers are anchors approximate to a specific extraction snapshot. If the bundle is re-extracted, the offsets may drift — use them as orientation, then verify the code still matches.

## Known structural debts (visible from code)

- **Pan/zoom is parked.** `react-zoom-pan-pinch` is installed and imported in `TcoViewport.tsx` but currently disabled. The library is kept on purpose for future re-enable.
- **`@dnd-kit/core` is unused.** Listed in deps for a planned editor mode that doesn't exist yet.
- **`jszip` is unused.** Reserved for scenario import/export.
- **No router.** The app is single-page with a station picker; if multi-route navigation is ever added, a router becomes necessary.
- **No persistence.** Refresh = reset. Acceptable for a POC; will need to be addressed if used for actual training sessions.

## Where to look first when debugging

| Symptom | Suspect file |
|---|---|
| `getSnapshot should be cached` warning + perf collapse | A selector that returns a fresh object/array each call. Find it, encode as CSV. |
| Lever refuses silently with no UI feedback | Action's guard logic in `src/sim/actions.ts`. Don't add a `throw`; trace the predicate. |
| Train doesn't move when expected | `src/sim/train.ts` (`moveTrainIn`) + the event currently in `clock.events`/`pausedEvents`. |
| Wrong visual state on a controle/aiguille | The CSV-encoded selector in the corresponding `Tco<Kind>.tsx` (see `TcoControle.useControleVisualState`). |
| Disturbance doesn't apply | Disturbance key spelling (SCREAMING_SNAKE_CASE; `DISTURBANCE_LABELS` is for display only) + target shape (`affectationId` XOR `blocId`). |
| Build fails with unused-vars | `tsconfig.app.json` has `noUnusedLocals/Parameters: true` — remove the unused symbol; do not silence. |
