---
project_name: 'gessieWeb'
user_name: 'Guill'
date: '2026-05-02'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'quality_rules', 'workflow_rules', 'anti_patterns']
status: 'complete'
rule_count: 95
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack

**Règles TypeScript (non-négociables — `npm run build` échoue sinon)**
- `import type { Foo }` obligatoire pour les types (`verbatimModuleSyntax`)
- Interdit : `enum`, `namespace`, parameter properties (`erasableSyntaxOnly`).
  Alternative canonique :
  ```ts
  const Status = { Idle: 'idle', Running: 'running' } as const;
  type Status = typeof Status[keyof typeof Status];
  ```
- Variables / paramètres inutilisés = erreur de compilation
- `strict: false` → null-checks **non** strictes ; pas de `?? ''` partout
- Imports `.ts`/`.tsx` explicites autorisés (mais peu utilisés dans le code existant)
- JSX runtime auto : pas de `import React from 'react'` (mais `import { useState }` reste requis)

**Versions clés**
React 19.2 · TS ~6.0 (target ES2023) · Vite 8 · Zustand 5 · Node ≥ 24

**Libs runtime**
`zustand` · `@dnd-kit/core` · `react-zoom-pan-pinch` · `jszip`

**Lint**
ESLint 10 flat config dans `eslint.config.js` · `typescript-eslint` recommended · `react-hooks/exhaustive-deps` (warn par défaut, à respecter)

**Zustand 5**
Sélecteurs scalaires uniquement ; pour des slices d'objets/tableaux, utiliser `useShallow` (pas la signature à 2 args de Zustand 4).

**Build gate**
`npm run build` = `tsc -b && vite build`. Le typecheck bloque le build → c'est **la** seule gate avant merge (pas de framework de test installé).

**Tests**
Aucun runner (vitest/jest) installé. Ne pas créer de `*.test.ts` ni proposer d'installer un framework sans demande explicite.

**Stack délibérément ennuyeux**
Pas de Redux Toolkit, TanStack Query, Tailwind, etc. — la stabilité du stack est une décision d'archi. Toute nouvelle dépendance se discute avant ajout.

## Critical Implementation Rules

### Language-Specific Rules

**Imports**
- Chemins relatifs (`../../store/useGessieStore`) — pas d'alias
- Pas d'extension dans les imports (`'./foo'`, pas `'./foo.ts'`) — convention du repo
- `import type { Foo } from '...'` pour tout import purement typage
- **Direction stricte** : `sim/` ne doit jamais importer de `store/` ou `components/`. La couche sim est pure (pas de React, pas de DOM, pas de Zustand)

**Types**
- `type` partout par défaut. `interface` uniquement quand on a besoin de declaration merging (rare ici)
- Avant d'inventer un type, **vérifier** `src/sim/types.ts` (PlayerData, Affectation, SimEvent, Bloc, Lever…) et `src/types/gessie.ts` (Station, Tool, Item)
- Pas de `any` implicite ; un `any` explicite porte un commentaire `// any: <raison>`
- Le contrat `ActionResult` est fermé (`state`, `events?`, `pauseEventUids?`, `resumeEventUids?`, `removeEvents?`). Pour ajouter un champ, mettre à jour les handlers du store **et** la doc

**Fixtures (Vite glob)**
- JSON sous `src/data/{items,stations}/*/settings.json`, chargés via `import.meta.glob`
- Eager pour les outils (petits, partagés), lazy pour les stations (grosses, une à la fois)
- Référence : `src/lib/loadFixtures.ts`

**Gestion d'erreurs (style Gessie)**
- **Échec silencieux** dans la couche sim : si une garde échoue, `return state` sans muter — pas de `throw`, pas de log
- Loaders : retournent `null`/`undefined` si absent (cf. `getLever`, `loadStationByName`)
- L'UI peut détecter un refus en comparant l'état avant/après (cf. `LeversPanel.handleClick`)
- Pas de `throw` dans `src/sim/*` ni dans les actions du store

**Mutations immutables**
- Spread obligatoire, jamais de `.push`/`.splice`/`obj.x = y` sur le state
- Helpers existants : `patchAffectation`, `patchBloc` dans `src/sim/actions.ts` — réutiliser
- Tableaux : `arr.slice()` puis index ; objets indexés : `{ ...map, [id]: { ...cur, ...patch } }`
- Le sélecteur Zustand qui veut un tableau/objet composite doit l'encoder en CSV scalaire (voir Framework Rules)

**Commentaires**
- Français (matche le code existant et la communication avec Guill)
- En-tête de module : 1 paragraphe sur le rôle, + référence Gessie si porté
- Ne pas commenter le quoi (le code le dit) ; commenter le pourquoi non-évident

**Reverse-engineering Gessie**
- Quand on porte une fonction du Vue/Electron original, citer la ligne du webpack extrait :
  ```ts
  // renderer.js @276350 — menu contextuel aiguille
  ```
- Source : `C:\Users\guill\ghidra\gessie_extracted\app_src\dist\electron\renderer.js`

### Framework-Specific Rules (React + Zustand)

**Sélecteurs Zustand — règle d'or**
- Un sélecteur **doit retourner un scalaire** (string, number, boolean, null) ou une référence stable. Sinon → boucle infinie "getSnapshot should be cached".
- Pour lire plusieurs champs : un sélecteur par champ (cf. `AtrPanel.tsx`) — verbeux mais correct.
- Pour un agrégat (liste, objet composite) : **encoder en CSV**, décoder dehors avec `useMemo`. Patron de référence : `useControleVisualState` dans `src/components/tco/TcoControle.tsx`.
  ```ts
  function useFooCsv(): string {
    return useGessieStore((s) => {
      // string déterministe : sort() avant join()
      return lines.sort().join('\n');
    });
  }
  // dans le composant :
  const csv = useFooCsv();
  const data = useMemo(() => decode(csv), [csv]);
  ```
- Jamais `useGessieStore((s) => ({ a: s.a, b: s.b }))` — crée un objet à chaque render
- Accès impératif ponctuel : `useGessieStore.getState().…` (cf. `LeversPanel.handleClick`)

**Hooks**
- `react-hooks/exhaustive-deps` respecté, ne pas désactiver
- `useEffect` avec cleanup (`cancelled` flag) pour async (cf. `App.tsx` chargement station)
- `useMemo` autour des `decode(csv)` et tris stables ; pas de mémoization spéculative
- `useState` initial via callback `() => initial` si l'init n'est pas triviale

**Composants**
- Function components uniquement, pas de class
- Props typées via `interface Props { ... }` local au fichier
- Pas de `React.FC` — typer directement la fonction
- Styles inline (`style={{ ... }}`) ; pas de CSS-in-JS ni de modules CSS (le projet n'a que `App.css` + `index.css` globaux)
- `key` stable et descriptive sur les listes (`${kind}:${id}:${disturbance}`, pas l'index)

**Architecture en couches**
```
src/sim/        — pur (simulation, types, helpers)
   ↓ jamais l'inverse
src/store/      — adaptateur Zustand (un seul store : useGessieStore)
   ↓ jamais l'inverse
src/components/ — UI React (sim/ panels + tco/ graphique)
src/lib/        — helpers (Vite glob, parsers fixtures)
```
- L'UI n'appelle pas directement les actions de `src/sim/*` — elle passe par les wrappers du store
- Le store transforme `ActionResult` en mutations Zustand + opérations sur la file Clock

**Dispatch table (Vue $emit → React)**
- Events scénarisés / routés depuis les helpers sim : pattern `dispatchPlayerEvent` dans `useGessieStore.ts` — `Record<eventType, handler>` plutôt qu'un `switch` géant
- Nouveau type d'event = ajouter une entrée dans la table + son handler

**Composants TCO (`src/components/tco/`)**
- Préfixe `Tco*` ; un fichier par type d'item (Aiguille, Signal, Controle, Zone, Joint, Traverse…)
- État visuel composite → CSV + `useMemo` decode

**Panneaux (`src/components/sim/`)**
- Suffixe `*Panel.tsx` ; une famille d'interactions par panneau
- Pattern : sélecteurs en haut, handlers, JSX en bas

### Testing Rules

**Aucun runner installé** — pas de vitest, jest, playwright, RTL, etc.

**Smoke check unique avant merge**
```
npm run lint && npm run build
```
- `tsc -b` (typecheck) bloque le build → gate de correctness
- `eslint .` bloque sur exhaustive-deps, unused-vars, react-refresh

**Vérification manuelle**
- Pour les changements UI : `npm run dev`, charger une station via le sélecteur (défaut `clelles`), tester le golden path + cas limites (refus de levier, disturbance active, etc.)
- Stations utiles :
  - `clelles` (défaut, polyvalente)
  - `saint_saturnin` (cas C211 — référence pour les contrôles avec commutFC)

**Si l'agent veut écrire un test**
- **Demander à Guill avant** d'introduire un framework
- Si autorisé : préférer **vitest** (intégration Vite naturelle) sur jest
- Cible prioritaire : la couche `src/sim/*` (pure, pas de mocks React nécessaires)

**Ne pas créer**
- Fichiers `*.test.ts`, `*.spec.ts`, `__tests__/`, `__mocks__/` sans demande explicite
- Setup CI / pre-commit hook pour les tests

### Code Quality & Style Rules

**Conventions de nommage**
- **Fichiers React** : PascalCase + `.tsx` (`TcoControle.tsx`, `LeversPanel.tsx`)
- **Modules sim/lib** : camelCase + `.ts` (`actions.ts`, `loadFixtures.ts`, `useGessieStore.ts`)
- **Préfixes domaine** :
  - `Tco*` → composants graphiques TCO
  - `*Panel` → panneau d'interaction sim
  - `use*` → hooks React (`useControleVisualState`, `useClockTick`)
- **Types** : PascalCase (`PlayerData`, `ActionResult`, `Direction`)
- **Constantes** : SCREAMING_SNAKE_CASE pour les vraies constantes (`DEFAULT_STATION`), camelCase pour les `const` locales

**Organisation des fichiers**
- Un module = une responsabilité ; pas de fichier > ~600 lignes (split en plusieurs si ça grossit)
- Types partagés : `src/sim/types.ts`, `src/types/gessie.ts` ; types locaux à un composant restent dans le `.tsx`
- Helpers internes au-dessus du `export` principal, séparés par `// ===== Section =====` (cf. `actions.ts`, `DisturbancesPanel.tsx`)

**ESLint flat config**
- Erreurs bloquantes : unused-vars, exhaustive-deps (warn → à respecter quand même), react-refresh
- Pas de `// eslint-disable-*` sauf justification commentée

**Style général**
- Quotes simples (`'foo'`) — convention typescript-eslint recommended
- Trailing comma conservée (cf. arrays multi-lignes du code)
- Indentation : 2 espaces
- Arrow functions par défaut ; `function` déclarée pour les helpers exportés et les composants React
- Point-virgule de fin **conservé** (le code existant les utilise)

**Documentation**
- Chaque fichier sim a un commentaire d'en-tête : rôle + référence Gessie si porté
- Fonctions non-évidentes : 1-2 lignes avant la signature (pourquoi, pas quoi)
- Patterns critiques (CSV selector, échec silencieux) → renvoyer à un fichier-exemple

**Anti-patterns**
- `console.log` laissés en place — à nettoyer avant commit (lint ne les bloque pas)
- Magic strings dans le sim métier (codes signaux, types disturbances) → utiliser les constantes du module quand elles existent
- Fonctions > 80 lignes : envisager un split (sauf si la fidélité Gessie l'impose)

### Development Workflow Rules

**État du dépôt**
- Git local, branche unique `master`, commit initial unique
- Pas (encore) de remote, pas de CI, pas de PR workflow
- Pas de pre-commit hook ni de Husky

**Commits**
- Sujet impératif court (50 chars max), corps optionnel pour le pourquoi
- Préfixes : `fix`, `feat`, `refactor`, `port` (portage Gessie), `chore`, `docs`
- Une fonctionnalité = un commit ; éviter les "WIP" empilés
- Pas de Co-Authored-By, pas de signature automatique

**Branches**
- Convention si nécessaire : `kebab-case-descriptif` (ex. `disturbances-ui`)
- `master` reste l'intégration ; pas de feature flag ni de canary

**Règles AI agent**
- **Ne jamais** `git commit` sans demande explicite de Guill
- **Ne jamais** créer/modifier `.github/`, CI configs, hooks Git sans accord
- Toujours récapituler ce qui a changé avant de proposer un commit
- Avant un `git push` (s'il y a un remote un jour) : demander l'accord

**Build / dev**
- `npm run dev` → vite dev server (HMR)
- `npm run build` → typecheck + bundle ; **doit passer** avant tout commit non-WIP
- `npm run lint` → ESLint ; à passer avant commit

**Fichiers à ne pas commiter**
- `dist/`, `node_modules/`, `.vite/`, caches divers
- `_bmad-output/` : à conserver versionné (contexte BMAD utile pour les agents)

### Critical Don't-Miss Rules (gotchas spécifiques gessieWeb)

**Sémantique des codes SNCF — ne pas inventer**
- Signaux : `F` (fermé/rouge), `O` (ouvert), `I` (inactif), `A` (avertissement actif)
- Aiguilles : `G`/`D` (gauche/droite), `g`/`d` (discordance — minuscule = défaut de contrôle)
- TJD/TJS : double aiguillage avec `agH`/`agB` (haut/bas) au lieu d'une seule position
- `positionFC` (commutateur Fermeture Carré) : **boolean** (`false` = repos, `true` = verrouillé), **pas** une string `'F'`
- Levers : `'plus'` (repos) / `'minus'` (actif)

**Échec silencieux — pas de "throw" salvateur**
- Une garde refusée → `return state` sans muter, sans log, sans exception
- L'UI doit comparer avant/après pour détecter un refus (cf. `LeversPanel.handleClick`)
- Ne pas "améliorer" en jetant une erreur — Gessie ne le fait pas, l'UX l'attend silencieux

**CSV selector — déterminisme obligatoire**
- Toujours `sort()` avant `join()` dans un sélecteur CSV — sinon la string change entre renders → re-render infini
- Format documenté en commentaire (séparateurs, ordre des champs) — cf. `useControleVisualState`
- Décodage **hors** sélecteur, dans `useMemo([csv])`

**`ActionResult` est un contrat fermé**
- 5 champs : `state`, `events?`, `pauseEventUids?`, `resumeEventUids?`, `removeEvents?`
- `removeEvents` est un **predicate** `(event: SimEvent) => boolean`, **pas** une liste d'UIDs
- Ajouter un champ = mettre à jour le store ET la doc

**SimEvent UIDs**
- Quand on crée un event dans une action, on peut laisser `uid: ''` — le store appelle `ensureUid` et assigne
- Ne jamais hard-coder un uid

**IDs d'affectations — préfixe implicite**
- Une zone peut être référencée par `"1"` ou `"z 1"` selon les annexes Gessie
- Utiliser `getZoneAffect` qui teste les deux ; ne pas accéder directement à `affectations["1"]`

**Disturbances — strings, casse exacte**
- Clés en SCREAMING_SNAKE_CASE constants (`RATE_OUVERTURE`, `NON_LIBERATION_EAP`, `ABSENCE_CONTROLE_GAUCHE`, etc.)
- Les labels FR (`DISTURBANCE_LABELS`) sont uniquement pour l'affichage — ne pas les utiliser comme clés
- Cibles : `affectationId` ou `blocId` (mutuellement exclusifs dans le payload)

**Données fixtures — eager vs lazy**
- Outils (`src/data/items/*/settings.json`) → eager glob (petits, partagés)
- Stations (`src/data/stations/*/settings.json`) → lazy (grosses, une à la fois)
- Ne pas importer une station en `import` direct — passer par `loadStationByName`

**Patch helpers — silent no-op**
- `patchAffectation(state, id, patch)` retourne `state` inchangé si `id` absent — pas d'erreur
- `patchBloc(state, id, patch)` idem
- Conséquence : un patch sur un mauvais ID ne casse rien mais ne fait rien — vérifier l'ID amont si nécessaire

**Reverse-engineering Gessie**
- Les références `// renderer.js @<line>` pointent vers le webpack extrait à un instant T
- Si le bundle est ré-extrait, les lignes peuvent dériver — utiliser le numéro comme ancre approximative, vérifier que la fonction matche toujours
- Source : `C:\Users\guill\ghidra\gessie_extracted\app_src\dist\electron\renderer.js`

**Boucle `getSnapshot should be cached`**
- Symptôme : warning console + perf catastrophique
- Cause : sélecteur Zustand qui retourne un nouvel objet/array à chaque appel
- Fix : encoder en CSV, ou splitter en plusieurs sélecteurs scalaires

**Ne pas faire**
- Ajouter `strict: true` à tsconfig sans audit complet — ferait surgir des centaines d'erreurs null-check
- Introduire Redux Toolkit, TanStack Query, Tailwind, Zod, etc. sans demande explicite
- Renommer/déplacer `useGessieStore` (casse tous les imports)
- Modifier les fixtures JSON (`src/data/`) — c'est de la donnée scénario, pas du code
- Toucher à `gessie_drawingAiguille.js` à la racine (helper de dev autonome)

---

## Usage Guidelines

**Pour les agents IA :**
- Lire ce fichier avant d'implémenter du code dans gessieWeb
- Suivre **toutes** les règles telles que documentées
- En cas de doute, choisir l'option la plus restrictive
- Mettre à jour ce fichier si un nouveau pattern émerge

**Pour Guill :**
- Garder le fichier lean et focalisé sur les besoins des agents
- Mettre à jour quand le stack ou les patterns évoluent
- Réviser périodiquement pour retirer les règles devenues évidentes (le code lui-même finit par les exprimer)
- Quand un agent fait une erreur récurrente : ajouter une règle ici, ne pas répéter en chat

Last Updated: 2026-05-02
