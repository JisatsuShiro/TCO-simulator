---
project_name: gessieWeb
generated_by: bmad-document-project (deep scan)
generated_on: 2026-05-02
repository_type: monolith
project_type: web
parts_count: 1
---

# gessieWeb — Documentation Index

This is the primary entry point for AI-assisted development of **gessieWeb**. Start here when you join a session, plan a brownfield PRD, or need to locate a topic.

> **AI agents:** if you're about to write code, read [`../_bmad-output/project-context.md`](../_bmad-output/project-context.md) **first** — it lists 95 enforced rules covering TS, React, Zustand, sim conventions, and gotchas. The docs in this folder describe **structure**; that file describes **policy**.

## Project overview

- **Type:** monolith — single-page web app, no backend
- **Primary language:** TypeScript ~6.0.2 (target ES2023)
- **Architecture:** layered (pure sim → Zustand store → React UI)
- **Stack:** React 19.2 · Zustand 5 · Vite 8 · TypeScript 6
- **Tests / CI:** none installed (deliberate POC scope — `lint` + `build` is the merge gate)
- **Reverse-engineering source of truth:** `C:\Users\guill\ghidra\gessie_extracted\app_src\dist\electron\renderer.js`

## Quick reference

| Need | Look at |
|---|---|
| What is this project? | [Project overview](./project-overview.md) |
| Architecture, layering, sim event loop | [Architecture](./architecture.md) |
| Where does each file live? | [Source tree analysis](./source-tree-analysis.md) |
| What components exist and how to add one? | [Component inventory](./component-inventory.md) |
| How do I run / build / lint? | [Development guide](./development-guide.md) |
| What rules MUST I follow when writing code? | [`../_bmad-output/project-context.md`](../_bmad-output/project-context.md) |

## Generated documentation

- [Project Overview](./project-overview.md)
- [Architecture](./architecture.md)
- [Source Tree Analysis](./source-tree-analysis.md)
- [Component Inventory](./component-inventory.md)
- [Development Guide](./development-guide.md)

## Existing documentation

| Path | Description |
|---|---|
| [`../README.md`](../README.md) | Vite + React template boilerplate. **Not** project documentation — kept as-is. |
| [`../_bmad-output/project-context.md`](../_bmad-output/project-context.md) | **Authoritative rules file** — 95 rules covering TypeScript constraints, React + Zustand patterns, simulation conventions, anti-patterns, and SNCF-specific gotchas. Mandatory reading for code-writing agents. |

## Getting started

### Run the app

```bash
npm install
npm run dev          # Vite dev server, HMR
```

The app boots with station **`clelles`** by default. Use the header `<select>` to switch stations.

### Verify a change

```bash
npm run lint && npm run build
```

This is **the** merge gate — there is no test runner. Then manually exercise the affected feature in `npm run dev`. See the verification checklist in [Development Guide](./development-guide.md#manual-verification-checklist).

### Where to start by goal

| Goal | Entry file |
|---|---|
| Add an operator action | `src/sim/actions.ts` (or sibling) → `src/store/useGessieStore.ts` → `src/components/sim/<Family>Panel.tsx` |
| Add a TCO item kind | `src/components/tco/Tco<Kind>.tsx` → register in `src/components/tco/renderers.tsx` |
| Investigate a station-specific bug | `src/data/stations/<name>/settings.json` (read-only) + the relevant `src/sim/*` action |
| Understand state shape | `src/sim/types.ts` + `src/sim/builder.ts` |
| Tweak event timing | `src/sim/clock.ts` (or the action that emits the event) |

## For brownfield PRDs

When kicking off a brownfield PRD via BMAD, point the workflow at this file (`docs/index.md`) plus `_bmad-output/project-context.md`. Together they cover both the structural map (this folder) and the enforced conventions (the project-context file).

## Repository layout in one glance

```
gessieWeb/
├── src/
│   ├── App.tsx · main.tsx        React entry + shell
│   ├── sim/                      Pure simulation (10 files, ~4150 LOC)
│   ├── store/useGessieStore.ts   Single Zustand store (~625 LOC)
│   ├── components/
│   │   ├── tco/                  SVG primitives (15 files)
│   │   └── sim/                  Operator panels (8 files)
│   ├── lib/loadFixtures.ts       Vite-glob fixture loader
│   ├── types/gessie.ts           JSON-on-disk types
│   └── data/{items,stations}/    Static fixtures (frozen)
├── public/                       Favicon, icon sprite, item icons
├── docs/                         ← you are here
├── _bmad/ · _bmad-output/        BMAD framework + artifacts
└── package.json · vite.config.ts · tsconfig*.json · eslint.config.js
```

See [Source Tree Analysis](./source-tree-analysis.md) for the full annotated map.
