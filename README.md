# gessieWeb

Port web de **Gessie**, simulateur de poste de signalisation SNCF (PRS — Poste tout Relais à transit Souple) initialement développé en Vue + Electron. Reproduit la vue opérateur d'un *Tableau de Contrôle Optique* (TCO) : leviers, signaux, blocs de cantonnement, ATR, serrures, avaries… avec les enclenchements et les avaries injectables, pour la formation des aiguilleurs.

**Statut** : POC fonctionnel. Le comportement de référence est l'exécutable Gessie d'origine ; les fichiers portés citent les offsets de ligne du bundle webpack extrait dans leurs en-têtes.

## Captures de fonctionnalités

- **TCO interactif** rendu en SVG natif (pas de Canvas, pas de lib graphique).
- **Panels opérateur** : leviers (avec FC intégrés), serrures, blocs de cantonnement, ATR, contrôles de simulation (clock + sélecteur de vitesse + mode édition/sim).
- **Menus contextuels au clic-droit** sur le TCO :
  - sur aiguille / contrôle / zone → menu d'avaries (raté d'ouverture, absence de contrôle, forçage d'occupation, non-libération ZAP/EAP/EPA…).
  - sur voie ou rail → menu de lancement de train (sens, taille, vitesse, point de départ inféré géométriquement).
- **Animations didactiques** : refus silencieux d'une bascule (incompatibilité, EAP actif, zone occupée…) déclenche une animation locale sur le levier ou la serrure pour rendre l'enclenchement visible.

## Stack

| Couche | Techno |
|---|---|
| UI | React 19 + JSX, **inline `style={{...}}` uniquement** (pas de CSS framework, pas de CSS modules) |
| State | Zustand 5 (store unique, sélecteurs scalaires) |
| Build | Vite 8 (Rolldown sous le capot) |
| Type-check | TypeScript strict (≥ 6.0), `tsc -b` bloque le build |
| Lint | ESLint 10 flat config + `typescript-eslint` + `react-hooks` + `react-refresh` |
| Polices | `@fontsource` (Inter + IBM Plex Mono auto-hostés, subset `latin`) |
| Animations | Web Animations API native (pas de framer-motion) |
| Tests | aucun installé — `npm run lint && npm run build` est la norme de qualité |

Pas de backend, pas de base de données, pas de routing, pas d'auth. Refresh = reset.

## Démarrer

```bash
npm install
npm run dev      # serveur Vite avec HMR sur http://localhost:5173
npm run build    # tsc -b puis vite build (merge gate)
npm run lint
npm run preview  # sert le build prod localement
```

Prérequis : Node.js ≥ 24.

## Stations disponibles

11 stations chargées en lazy via Vite glob depuis `src/data/stations/` :

`amvville`, `aville_p2`, `clelles`, `jarze`, `la_presle`, `monestier`, `monestier_v3`, `montfort_sur_meu___serrures`, `passyle_st_jean___maquette`, **`saint_saturnin`** (défaut, référence pour les commutateurs FC), `vif`.

## Architecture en bref

```
src/
├── main.tsx · App.tsx          Entrée React + shell
├── sim/                        Domaine pur de simulation (sans React)
├── store/useGessieStore.ts     Store Zustand unique (~625 LOC)
├── components/
│   ├── tco/                    Primitives SVG du TCO
│   └── sim/                    Panels opérateur
├── design/
│   ├── tokens.ts               Couleurs, typo, espacements, motion
│   └── primitives/             Panel, Button, Pill, Lever, KeyHole…
├── lib/loadFixtures.ts         Glob loader des fixtures
├── types/gessie.ts             Types des JSON sur disque
└── data/
    ├── items/                  14 outils (eager)
    └── stations/               11 stations (lazy)
```

Trois couches strictes :

1. **`sim/`** — fonctions pures, agnostiques de React/Zustand. La source de vérité des règles d'enclenchement, du mouvement des trains, des avaries.
2. **`store/`** — Zustand bridge. Reçoit les événements (clic levier, tick d'horloge), invoque les actions de `sim/`, met à jour l'état.
3. **`components/`** — React. Sélecteurs Zustand scalaires uniquement (pour éviter les ré-renders « getSnapshot should be cached »). Inline styles via les tokens du design system.

Voir [`docs/architecture.md`](./docs/architecture.md) pour le détail des conventions, le contrat `ActionResult`, et les règles de sélection Zustand.

## Documentation

- [`docs/architecture.md`](./docs/architecture.md) — couches, boucle d'événement, conventions
- [`docs/source-tree-analysis.md`](./docs/source-tree-analysis.md) — arbre annoté
- [`docs/component-inventory.md`](./docs/component-inventory.md) — catalogue TCO + panels
- [`docs/development-guide.md`](./docs/development-guide.md) — setup, build, station switching
- [`_bmad-output/planning-artifacts/`](./_bmad-output/planning-artifacts/) — PRD, spécification UX

## Référence Gessie d'origine

Les fichiers portés référencent les offsets webpack du bundle extrait via Ghidra : `// renderer.js @<line>`. Ces numéros servent d'ancres de corrélation — ils peuvent dériver si le bundle est ré-extrait.

Quand le port diverge volontairement de Gessie (par exemple le retour visuel immédiat des `NON_LIBERATION_*` ou le re-évaluation post-`RATE_OUVERTURE`), c'est documenté en commentaire dans le code avec la mention « Divergence Gessie volontaire ».
