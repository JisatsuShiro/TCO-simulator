# Component Inventory — Voie Libre

_Generated 2026-05-02 by `bmad-document-project` (deep scan)._

Catalog of all React components, grouped by role. Total: **24 components** across `src/components/tco/` (15) and `src/components/sim/` (8) plus the App shell.

---

## App shell

| Component | File | LOC | Role |
|---|---|---|---|
| `App` | `src/App.tsx` | 81 | Top-level shell. Hosts the station selector (`<select>`), mounts `TcoViewport` + all sim panels in a vertical stack. Handles initial station load via `useEffect` with cleanup flag. |

App layout (top to bottom):

```
<App>
  <header>     ← title, gare picker, item count hint
  <TcoViewport key={station?.id}>
    <TcoCanvas/>     ← SVG viewBox + per-item dispatch
    <ItemTooltip/>   ← hover JSON
  </TcoViewport>
  <SimControls/>     ← mode toggle, speed, clock readout
  <TrainsPanel/>
  <LeversPanel/>
  <CommutFCPanel/>
  <BlocsPanel/>
  <AtrPanel/>
  <KeysPanel/>
  <DisturbancesPanel/>
</App>
```

The `key={station?.id ?? 'empty'}` on `TcoViewport` forces a full remount on station change.

---

## TCO graphical primitives — `src/components/tco/`

Visualization layer. SVG-only, no DOM elements except inside the SVG. Each item kind has a dedicated renderer; `renderers.tsx` maps `toolId` → component.

### Container components

| Component | File | LOC | Notes |
|---|---|---|---|
| `TcoViewport` | `TcoViewport.tsx` | 32 | Outer `<div>` that fixes the height (default 80vh) and clips overflow. Hosts `TcoCanvas` + `ItemTooltip`. Pan/zoom (via `react-zoom-pan-pinch`) is currently disabled — library kept for future re-enable. |
| `TcoCanvas` | `TcoCanvas.tsx` | 91 | Calculates viewBox from `station.items` (asymmetric padding accounts for rails/voies extending right/down from `xPos/yPos`). Iterates `station.items` and dispatches each through `getRenderer(item.toolId)`. Wires `onMouseEnter/Leave` → `setHoveredUid`. |
| `ItemTooltip` | `ItemTooltip.tsx` | 61 | Positioned tooltip showing the raw `StationItem` JSON for the hovered uid. Debug-only utility. |
| `renderers.tsx` | — | 50 | Dispatch table `Record<toolId, ComponentType<PrimitiveProps>>`. Falls back to `TcoGenericPlaceholder` for unknown kinds. |

### Per-kind renderers

All take `PrimitiveProps = { item: StationItem; tool: Tool }`.

| Component | File | LOC | Item kind | Notes |
|---|---|---|---|---|
| `TcoAiguille` | `TcoAiguille.tsx` | 270 | `aiguille` (switch) | Procedural SVG, fidelity-ported. Shows position G/D + discordance (lowercase = `g`/`d`). |
| `TcoTraverse` | `TcoTraverse.tsx` | 254 | `tjd`, `tjs`, `to` | Traversées-jonctions (double switches). Position via `agH`/`agB` (high/low) instead of single G/D. |
| `TcoControle` | `TcoControle.tsx` | 463 | `controle` (carré) | **Largest TCO component.** Composite visual state (FA, EAP, EPA, proxi, double_zap_eap_epa) encoded as 9-flag CSV string for selector stability. Rounded box above/below the rail. |
| `TcoSignal` | `TcoSignal.tsx` | 71 | `signal` | Semaphore/disque indicators. F/O state from affectation. |
| `TcoZone` | `TcoZone.tsx` | 106 | `zone` | Track-section coloring (occupied / locked / annulated). |
| `TcoRail` | `TcoRail.tsx` | 115 | `rail` | Rail line segment with optional dashing. |
| `TcoVoie` | `TcoVoie.tsx` | 99 | `voie` | Voie (track segment) — extends ~200px from `xPos/yPos`. |
| `TcoTrace` | `TcoTrace.tsx` | 55 | `trace` | Free-form line (`x1/y1`→`x2/y2`). |
| `TcoJoint` | `TcoJoint.tsx` | 49 | `joint` | Joint isolant (insulated rail joint marker). Procedural. |
| `TcoLabel` | `TcoLabel.tsx` | 59 | `label` | Text label. |
| `TcoSvgIcon` | `TcoSvgIcon.tsx` | 60 | `taquet`, `arrow` (via `renderers.tsx` wrappers) | Fallback bitmap-icon renderer used by kinds without a dedicated component yet. |
| `TcoGenericPlaceholder` | `TcoGenericPlaceholder.tsx` | 32 | _unknown toolId_ | Last-resort stub — renders a small marker so missing renderers are visible during dev. |

### Visual state via CSV selectors

The canonical pattern is in `TcoControle.tsx`:

```ts
function useControleVisualState(affId: string | null): string {
  return useGessieStore((s) => {
    // ...read 9 flags from s.player.data.affectations[affId]...
    return [fa, hasEap, eap, zap, hasEpa, epa, proxi, proxiPressed, double].join('|');
  });
}
// in component:
const csv = useControleVisualState(affId);
const v = useMemo(() => decodeVisualState(csv), [csv]);
```

This keeps the selector returning a scalar string, avoiding the "getSnapshot should be cached" infinite-loop trap with Zustand 5.

---

## Operator panels — `src/components/sim/`

Action layer. Each panel covers a family of operator interactions, mounts in `App.tsx` below the viewport.

| Component | File | LOC | Action surface |
|---|---|---|---|
| `SimControls` | `SimControls.tsx` | 108 | **Edit mode:** "Lancer simulation" button. **Play mode:** Stop, speed selector (pause/×1/×2/×5/×10), clock readout, counters (affectations / leviers / events). Mounts `useClockTick()`. |
| `LeversPanel` | `LeversPanel.tsx` | 104 | Toggle levers. Visual `+` (plus, idle) / `−` (minus, active). **Silent-refusal feedback** via `setTimeout(0)` diff → red flash for 600ms. Sorts levers numerically then alpha. |
| `TrainsPanel` | `TrainsPanel.tsx` | 185 | Spawn a train (direction `pair`/`impair`, size Petit/Moyen/Grand, speed, starting point). Lists active trains. |
| `BlocsPanel` | `BlocsPanel.tsx` | 110 | Cantonnement (BAL block sections): test, reddition, sémaphore commutator, voie libre, annonce. |
| `AtrPanel` | `AtrPanel.tsx` | 96 | ATR (annulateur de transit): press/release, give/remove autorisation, cancel ATr. |
| `KeysPanel` | `KeysPanel.tsx` | 305 | **Largest sim panel.** Lever keyholes, key groups, central locks (annexe Ibis). Take/put key on lock/group/lever. |
| `CommutFCPanel` | `CommutFCPanel.tsx` | 81 | Fermeture Carré commutator toggle (locks signal closed). |
| `DisturbancesPanel` | `DisturbancesPanel.tsx` | 279 | Inject avaries onto an affectation (RATE_OUVERTURE, NON_LIBERATION_*, ABSENCE_CONTROLE_*, …) or bloc (REDDITION_IMPOSSIBLE, ANNONCE_IMPOSSIBLE, …). Lists active disturbances; click to clear. |

### Panel structure (canonical pattern)

```tsx
import { useGessieStore } from '../../store/useGessieStore';

export function FooPanel() {
  // 1. Selectors at the top — scalar, or CSV+useMemo for composites
  const data = useGessieStore((s) => s.player.data);
  const action = useGessieStore((s) => s.someAction);

  if (!data) return null;  // edit mode → no-op

  // 2. Handlers
  const onClick = (id: string) => action(id);

  // 3. JSX with inline styles
  return <div style={{...}}>...</div>;
}
```

### Silent-refusal pattern (canonical: `LeversPanel.handleClick`)

```ts
const handleClick = (id: string, positionBefore: 'plus' | 'minus') => {
  toggleLever(id);
  setTimeout(() => {
    const after = useGessieStore.getState().player.data?.levers[id]?.position;
    if (after === positionBefore) {
      // refusal — flash red
      setRefused(id);
      setTimeout(() => setRefused(null), 600);
    }
  }, 0);
};
```

The 0ms delay lets Zustand commit before we read.

---

## Naming conventions

| Prefix / suffix | Convention | Example |
|---|---|---|
| `Tco*` | TCO graphical primitive (component file) | `TcoAiguille.tsx` |
| `*Panel` | Operator-action panel (one family) | `LeversPanel.tsx` |
| `use*` (in components) | Component-local hook | `useControleVisualState` |
| Files | PascalCase + `.tsx` for React; camelCase + `.ts` for sim/lib/store | `LeversPanel.tsx` vs `loadFixtures.ts` |

## Adding components

| Want to add… | Steps |
|---|---|
| A new TCO item kind | 1) Define the JSON shape under `src/data/items/<kind>-X.X.X/settings.json` (frozen if part of original Gessie). 2) Create `src/components/tco/Tco<Kind>.tsx`. 3) Register in `src/components/tco/renderers.tsx`. |
| A new operator-action panel | 1) Add an action in `src/sim/<domain>.ts` that returns `ActionResult`. 2) Wire it through `src/store/useGessieStore.ts` (and the `dispatchPlayerEvent` table if event-driven). 3) Create `src/components/sim/<Family>Panel.tsx`. 4) Mount it in `src/App.tsx`. |
| A read-only display widget | Create the file under `src/components/sim/` (or a new sibling folder if it's clearly a different concern). Keep it function-component, inline-styled, scalar-selector based. |

## Components that are NOT here

- **Class components** — banned by convention.
- **`React.FC`** — banned; type the function directly.
- **CSS Modules / styled-components / Tailwind** — none. All UI uses inline `style={{...}}`.
- **Form libraries** — none. Native `<input>`/`<select>` is enough at this scale.
- **Routing** — none. The station picker is the only "navigation".
