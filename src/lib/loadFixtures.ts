import type { Station, Tool } from '../types/gessie';

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
