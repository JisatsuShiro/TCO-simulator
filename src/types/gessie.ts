// Types dérivés des JSON réels de Gessie (cf. items/*/settings.json et stations/*/settings.json)

/** Une variation d'un type d'item (ex: aiguille "e-nw", rail "dashed"). */
export interface Variation {
  label: string;
  id: string;
  icon: string;
  ui: string;
  jonction?: string;
}

/** Une option configurable par l'utilisateur sur un item. */
export interface ToolOption {
  label: string;
  id: string;
  type: 'textfield' | 'select' | 'radio' | 'checkbox' | 'hidden';
  placeholder?: string;
  default?: string;
  choices?: string; // JSON-stringifié dans Gessie d'origine
}

/**
 * Définition d'un type d'item (= "tool"), chargée depuis items/{id}-X.X.X/settings.json.
 * Note : on ignore le champ `template` de Gessie (compilation Vue runtime),
 * on remplace par un dispatch table TS côté React.
 */
export interface Tool {
  id: string;            // ex: "aiguille"
  label: string;
  version: string;
  icon: string;
  variations: Record<string, Variation>;
  options: ToolOption[];
  category: 'drawing' | string; // "drawing" pour les éléments du TCO
  files?: { name: string; type: string }[];
}

/** Un item placé dans une station (un élément du TCO). */
export interface StationItem {
  uid: string;
  toolId: string;        // référence un Tool.id (ex: "aiguille")
  variationId?: string;  // référence une variation (ex: "e-nw")
  type: string;          // ex: "drawingAiguille" / "traceLine"
  xPos?: number;         // optionnel : trace utilise x1/y1/x2/y2
  yPos?: number;
  name?: string;
  rotation?: string;
  // Les autres champs dépendent du tool (sens, ipcf, nodes, x1, x2, y1, y2, ui, etc.)
  [key: string]: unknown;
}

/** Une station chargée depuis stations/{id}/settings.json. */
export interface Station {
  id: string;
  name: string;
  identification?: string;
  point?: string;
  author_name?: string;
  author_email?: string;
  items: StationItem[];
  enclenchements?: unknown[];
  parcours?: unknown[];
  cantonnement?: unknown[];
  annexeI?: unknown[];
  annexeIbis?: unknown[];
  annexeII?: unknown[];
  annexeIII?: unknown[];
  annexeIV?: unknown[];
  annexeV?: unknown[];
  annexeVI?: unknown[];
  annexeILabels?: unknown[];
  /**
   * Items auxiliaires à positionnement absolu (cartouches, indicateurs
   * terrain, leviers du pupitre…). Chaque entrée porte un `parentType` qui
   * détermine quel composant la rend (atrGroup, atr, lever, bloc…). Le TCO
   * Web exploite uniquement les entrées qu'il sait rendre — le reste est
   * ignoré silencieusement.
   */
  objectsStyle?: ObjectStyleItem[];
  controlesVU?: unknown[];
}

/** Item de `objectsStyle` — équivalent web des objets superposés au TCO. */
export interface ObjectStyleItem {
  id: string;
  parentType: string;
  type?: string;
  name?: string;
  position?: {
    position?: string;
    left?: string;
    top?: string;
  };
  [key: string]: unknown;
}

/** Helper : reconstruit le `type` d'un item à la mode Gessie. */
export function buildItemType(category: string, toolId: string): string {
  return category + toolId.charAt(0).toUpperCase() + toolId.slice(1);
}
