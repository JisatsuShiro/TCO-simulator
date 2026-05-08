# Development Guide — Voie Libre

_Generated 2026-05-02 by `bmad-document-project`._

## Prerequisites

| Tool | Version | Source |
|---|---|---|
| Node.js | **≥ 24** | Implied by `@types/node@^24` and Vite 8 requirements |
| npm | matching Node 24 | bundled |
| Git | any recent | for VCS |

OS: project develops on **Windows 11** (paths use bash on Windows; PowerShell also fine). No platform-specific code.

## Initial setup

```bash
git clone <repo>
cd Voie Libre
npm install
```

No `.env`, no auth, no external services to configure. The app loads station fixtures from `src/data/stations/` at runtime via Vite glob.

## Running

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR. Opens on `http://localhost:5173` (Vite default). |
| `npm run build` | `tsc -b && vite build`. **The merge gate.** Typecheck blocks the bundle. |
| `npm run lint` | `eslint .`. Enforces hooks/exhaustive-deps, unused-vars, react-refresh. |
| `npm run preview` | Serve the production build locally for smoke checks. |

### Default scenario

The app boots with station **`clelles`**. Other stations are picked from the `<select>` in the header (driven by `listStationNames()` in `src/lib/loadFixtures.ts`).

For verifying `commutFC` (Fermeture Carré) behavior, switch to **`saint_saturnin`** which has the relevant `C211` setup.

## The merge gate (when there's no test runner)

There is no `vitest`/`jest`/`playwright`/RTL installed by design. **Do not add one without explicit approval.** The correctness floor is:

```bash
npm run lint && npm run build
```

What blocks:

- `tsc -b` — typecheck. The strict knobs in `tsconfig.app.json`:
  - `noUnusedLocals: true` — unused locals fail the build
  - `noUnusedParameters: true` — unused params fail the build
  - `verbatimModuleSyntax: true` — must use `import type { Foo }` for type-only imports
  - `erasableSyntaxOnly: true` — bans `enum`, `namespace`, parameter properties
  - `noFallthroughCasesInSwitch: true`
- `eslint .` — flat config in `eslint.config.js`:
  - `typescript-eslint:recommended`
  - `react-hooks:recommended-flat` — including `exhaustive-deps` (warn, but **respect it**)
  - `react-refresh:vite`

If a runner is approved later, prefer **vitest** (Vite-native). Cover `src/sim/*` first — pure functions, no React mocking required.

## Manual verification checklist

For UI changes:

1. `npm run dev`
2. Open default `clelles` (or whichever station is relevant to the change).
3. **Edit mode** — verify static rendering of TCO items.
4. **Play mode** — click "Lancer simulation":
   - Levers togglable, refusals show red flash.
   - Speed selector cycles 0/1/2/5/10.
   - Clock advances when speed > 0.
5. Change station via the `<select>` — verify clean remount (the `key={station?.id}` on `TcoViewport` forces this).
6. **Disturbances** — open `DisturbancesPanel`, inject one, verify visual change in TCO + clear it from the "Actives" list.
7. Watch the browser console — no warnings, especially **no `getSnapshot should be cached`** loops.

## Project conventions (the non-obvious ones)

These are the rules that bite hardest. Full list in [`_bmad-output/project-context.md`](../_bmad-output/project-context.md).

### Selectors must return scalars

```ts
// ❌ Causes infinite "getSnapshot should be cached" loop
const { a, b } = useGessieStore((s) => ({ a: s.a, b: s.b }));

// ✅ Multiple scalar selectors
const a = useGessieStore((s) => s.a);
const b = useGessieStore((s) => s.b);

// ✅ Composite via CSV + useMemo
const csv = useGessieStore((s) => [s.a, s.b].sort().join('|'));
const data = useMemo(() => decode(csv), [csv]);
```

### Silent failure in `src/sim/*`

If a guard refuses, `return state` unchanged. **No `throw`, no log.**

```ts
export function toggleLever(state: PlayerData, id: string): ActionResult {
  const lever = state.levers[id];
  if (!lever) return { state };                          // silent
  if (incompatible(lever, state)) return { state };      // silent
  // ...mutate...
}
```

UI detects refusal by diffing state before/after.

### Imports

- Relative paths only — no `@/` aliases.
- No file extensions in imports — `'./foo'`, not `'./foo.ts'`.
- `import type { Foo } from '...'` for type-only imports (required by `verbatimModuleSyntax`).
- **`src/sim/*` never imports from `src/store/*` or `src/components/*`.** Sim is pure.

### Mutations are immutable

```ts
// ❌
state.levers[id].position = 'minus';
arr.push(item);

// ✅
return { ...state, levers: { ...state.levers, [id]: { ...lever, position: 'minus' } } };
return arr.concat(item);   // or [...arr, item]
```

Helpers exist for the common cases: `patchAffectation`, `patchBloc` in `src/sim/actions.ts` — reuse them. Note both are silent no-ops on missing IDs.

### Comments in French

The code, the rules, and Guill's communication are in French. Comments follow that. Module headers reference `// renderer.js @<line>` for ported behavior.

## Adding a feature — checklist

1. **Locate the layer.**
   - Game/signaling logic? → `src/sim/`
   - Bridging? → `src/store/useGessieStore.ts`
   - Visual? → `src/components/tco/`
   - Operator action? → `src/components/sim/<Family>Panel.tsx`
2. **Respect the dependency direction.** sim never imports up.
3. **Pure-function actions** return `ActionResult` (`state`, `events?`, `pauseEventUids?`, `resumeEventUids?`, `removeEvents?`).
4. **New event type?** Add a handler in the `dispatchPlayerEvent` dispatch table — don't grow a switch.
5. **New selector reading composite state?** Encode CSV → `useMemo` decode. Sort before join.
6. **Run the gate:** `npm run lint && npm run build`.
7. **Smoke test in `npm run dev`:** golden path + at least one refusal case.
8. **Don't commit unless asked.** Per project rules, AI agents never `git commit` without explicit instruction.

## Where to read up before changing each layer

| Touching | Read first |
|---|---|
| `src/sim/types.ts` | The whole file — type changes propagate everywhere. |
| `src/sim/builder.ts` | The header (it explains ID-generation conventions) + the section you're editing. |
| `src/sim/clock.ts` | Yes — short, defines the event lifecycle. |
| `src/sim/actions.ts` (or sibling) | The `ActionResult` discussion in `architecture.md` + the existing actions in the file. |
| `src/store/useGessieStore.ts` | The `dispatchPlayerEvent` router + the action wrappers. |
| `src/components/tco/<Tco*>.tsx` | The corresponding `// renderer.js @<line>` reference, if porting fidelity matters. |
| `src/components/sim/<*Panel>.tsx` | `LeversPanel` (silent-refusal pattern) + `TcoControle` (CSV selector pattern) as canonical examples. |

## Build artifacts & gitignored paths

```
dist/             # vite build output — gitignored
node_modules/     # gitignored
*.local           # gitignored
_bmad/config.user.toml         # personal BMAD config — gitignored
_bmad/custom/config.user.toml  # personal BMAD overrides — gitignored
```

`_bmad-output/` IS versioned (intentionally — it's the BMAD-generated context that agents need).

## Deployment

**Not configured.** `npm run build` produces a static `dist/` that any static host can serve. There is no CI, no Docker, no hosting target wired up. When deployment becomes necessary, evaluate Netlify/Vercel/GH Pages/S3+CloudFront against scenario-data sensitivity.
