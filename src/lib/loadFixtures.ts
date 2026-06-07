import type { Scenario, Station, Tool } from '../types/gessie';

// Tools : eager (chargés au démarrage, petits, utilisés pour chaque render).
const itemModules = import.meta.glob('../data/items/*/settings.json', {
  eager: true,
  import: 'default',
}) as Record<string, Tool>;

// Stations : lazy (chargées à la demande, peuvent être grosses, on n'en affiche
// qu'une à la fois). import.meta.glob sans eager renvoie une map de fonctions
// async qui retournent le module.
const stationLoaders = import.meta.glob('../data/stations/*/settings.json', {
  import: 'default',
}) as Record<string, () => Promise<Station>>;

// Scénarios : servis depuis `public/scenario/`. Au runtime on fetch d'abord
// l'index (`/scenario/index.json`, liste d'IDs), puis chaque JSON à la
// demande. Cache mémoire pour éviter les refetchs entre navigations.
const SCENARIO_BASE = '/scenario';
let scenarioIndexCache: Promise<string[]> | null = null;
const scenarioCache = new Map<string, Promise<Scenario>>();

async function fetchScenarioIndex(): Promise<string[]> {
  if (!scenarioIndexCache) {
    scenarioIndexCache = fetch(`${SCENARIO_BASE}/index.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`Index scénarios HTTP ${r.status}`);
        return r.json() as Promise<string[]>;
      })
      .catch((err) => {
        scenarioIndexCache = null;
        throw err;
      });
  }
  return scenarioIndexCache;
}

function fetchScenario(id: string): Promise<Scenario> {
  const cached = scenarioCache.get(id);
  if (cached) return cached;
  const p = fetch(`${SCENARIO_BASE}/${encodeURIComponent(id)}.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`Scénario ${id} HTTP ${r.status}`);
      return r.json() as Promise<Scenario>;
    })
    .catch((err) => {
      scenarioCache.delete(id);
      throw err;
    });
  scenarioCache.set(id, p);
  return p;
}

export function loadAllTools(): Tool[] {
  return Object.values(itemModules);
}

export function listStationNames(): string[] {
  return Object.keys(stationLoaders)
    .map((p) => {
      const m = p.match(/\/stations\/([^/]+)\//);
      return m ? m[1] : null;
    })
    .filter((n): n is string => n !== null);
}

export async function loadStationByName(name: string): Promise<Station | null> {
  const entry = Object.entries(stationLoaders).find(([path]) =>
    path.includes(`/stations/${name}/`)
  );
  if (!entry) return null;
  return await entry[1]();
}

/**
 * Liste tous les scénarios disponibles, triés alphabétiquement par nom.
 * Fetch parallèle de tous les fichiers JSON à partir de l'index ; chaque
 * scénario porte la `station` qu'il vise dans son corps. Erreurs unitaires
 * (un fichier 404) ignorées silencieusement pour ne pas casser la liste.
 */
export async function listScenarios(): Promise<Scenario[]> {
  const ids = await fetchScenarioIndex();
  const results = await Promise.allSettled(ids.map((id) => fetchScenario(id)));
  return results
    .filter((r): r is PromiseFulfilledResult<Scenario> => r.status === 'fulfilled')
    .map((r) => r.value)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/** Retourne un scénario par son `id`, ou `null` s'il n'existe pas. */
export async function getScenarioById(id: string): Promise<Scenario | null> {
  try {
    return await fetchScenario(id);
  } catch {
    return null;
  }
}
