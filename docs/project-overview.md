# Project Overview — Voie Libre

_Generated 2026-05-02 by `bmad-document-project`._

## What it is

**Voie Libre** is a single-page web port of **Gessie**, a French SNCF railway-signaling simulator originally built as a Vue + Electron desktop app. It reproduces the operator's view of a *Tableau de Contrôle Optique* (TCO): the user manipulates levers, signals, blocs, ATRs, and keys to route trains through a station while interlocking rules and disturbances are enforced by the simulation core.

**Status:** POC port. The behavior source of truth is the original `renderer.js` (webpack-extracted from the Electron bundle); ported files cite the original line offsets in their headers.

## Quick reference

| Aspect | Value |
|---|---|
| **Type** | Monolith — single-page web app, no backend |
| **Primary language** | TypeScript (~6.0.2, target ES2023) |
| **UI framework** | React 19.2 (function components, JSX runtime auto) |
| **State** | Zustand 5 (single store, scalar selectors) |
| **Build tool** | Vite 8 (Rolldown bundler under the hood) |
| **Architecture pattern** | Layered: pure sim → store bridge → React UI |
| **Entry point** | `index.html` → `src/main.tsx` → `src/App.tsx` |
| **Default station** | `clelles` (loaded automatically on app start) |
| **Tests** | None installed (deliberate — see project-context) |
| **CI/CD** | None |

## Tech stack at a glance

| Layer | Tech |
|---|---|
| Runtime | Browser SPA, no Node runtime, no SSR |
| UI | React 19 + inline `style={{...}}` (no CSS framework, no CSS modules) |
| State | Zustand 5 (single `useGessieStore`) |
| Build | Vite 8 + `@vitejs/plugin-react` (Oxc) |
| Lint | ESLint 10 flat config + `typescript-eslint`, `react-hooks`, `react-refresh` |
| Type check | `tsc -b` (the merge gate; runs as part of `npm run build`) |
| Reserved deps (unused yet) | `@dnd-kit/core` (editor mode), `react-zoom-pan-pinch` (parked), `jszip` (scenario I/O) |

## Project shape

```
src/
├── main.tsx · App.tsx          React entry + shell
├── sim/                        Pure simulation domain (10 files)
├── store/useGessieStore.ts     Single Zustand store (~625 LOC)
├── components/
│   ├── tco/                    SVG primitives (TcoAiguille, TcoSignal, …)
│   └── sim/                    Operator panels (LeversPanel, TrainsPanel, …)
├── lib/loadFixtures.ts         Vite-glob fixture loader
├── types/gessie.ts             JSON-on-disk types
└── data/
    ├── items/                  14 tool kinds (eager)
    └── stations/               11 stations (lazy)
```

See [`source-tree-analysis.md`](./source-tree-analysis.md) for the full annotated tree, and [`architecture.md`](./architecture.md) for the layering rules and event-loop design.

## What it does — in 30 seconds

1. User opens the app → station selector defaults to **`clelles`**.
2. The TCO is rendered as SVG: the static layout of an SNCF station (rails, signals, switches, zones, controls).
3. User clicks **Lancer simulation** (`SimControls`) → `initPlayer()` builds `PlayerData` from the static `Station` JSON, mode flips from `edit` to `play`, the clock tick starts.
4. User interacts with operator panels (levers, blocs, ATR, keys, disturbances) and starts trains.
5. The simulation enforces interlocking: incompatible lever moves fail silently; signals open/close based on EAP/EPA/FA states; trains progress through zones according to the event queue; disturbances inject anomalies the operator must work around.
6. All state lives in memory; refresh = reset.

## Stations available

`amvville`, `aville_p2`, **`clelles`** (default), `jarze`, `la_presle`, `monestier`, `monestier_v3`, `montfort_sur_meu___serrures`, `passyle_st_jean___maquette`, **`saint_saturnin`** (commutFC reference), `vif`.

## Documentation index

- **[Architecture](./architecture.md)** — layering, sim core, event loop, ActionResult contract, Zustand selector rules
- **[Source tree](./source-tree-analysis.md)** — annotated repo map
- **[Component inventory](./component-inventory.md)** — TCO + sim panel catalog
- **[Development guide](./development-guide.md)** — setup, build, run, lint, station-switching
- **[`_bmad-output/project-context.md`](../_bmad-output/project-context.md)** — 95 enforced rules covering TS rules, framework patterns, anti-patterns, gotchas. **Read this first** if you're an AI agent about to write code.

## What's _not_ here

| Not in this project | Why |
|---|---|
| Backend / API | Pure browser sim, no remote state |
| Database | Static JSON fixtures via Vite glob |
| Tests / runner | Deliberate POC scope; lint+typecheck is the floor |
| CI/CD / Docker | Local-dev only |
| Routing | Single-page, station picker handles "navigation" |
| Auth | No users, no sessions, no persistence |
| i18n | Single-language (French UI strings are inline) |
| CSS framework | Inline styles + a tiny `index.css` reset |
| State persistence | Refresh = reset |

## Reverse-engineering reference

The original Gessie bundle is at `C:\Users\guill\ghidra\gessie_extracted\app_src\dist\electron\renderer.js`. Ported files reference webpack offsets in their headers (`// renderer.js @<line>`). Treat those line numbers as orientation anchors — they may drift if the bundle is re-extracted.
