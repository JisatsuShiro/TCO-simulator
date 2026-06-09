// Adaptateurs entre le modèle réel de simulation (`src/sim`) et la vue mobile.
// La vue mobile pilote désormais le VRAI store : les leviers, leurs positions
// (`plus`/`minus`), et le résultat des manœuvres sur le TCO proviennent de la
// gare réellement chargée — plus de moteur de formation autonome.

import type { Affectation, Lever as SimLever } from '../sim/types';
import type { StationItem } from '../types/gessie';

export type LeverFilter = 'Tout' | 'Signaux' | 'Aiguilles';
export type LeverKind = 'aiguille' | 'controle';

/** Tri naturel des leviers : numérique d'abord, puis alphabétique. */
export function sortLevers(levers: SimLever[]): SimLever[] {
  return [...levers].sort((a, b) => {
    const na = parseInt(a.id, 10);
    const nb = parseInt(b.id, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    if (!isNaN(na)) return -1;
    if (!isNaN(nb)) return 1;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Classe un levier : pilote-t-il (au moins) une aiguille, ou uniquement des
 * contrôles/signaux ? Même heuristique que le panneau bureau (`LeversPanel`).
 */
export function classifyLever(lever: SimLever, affectations: Record<string, Affectation>): LeverKind {
  for (const affId of lever.affectations) {
    const aff = affectations[affId];
    if (aff?.type === 'aiguille') return 'aiguille';
    if (affId.startsWith('Ag')) return 'aiguille';
  }
  return 'controle';
}

export function filterLevers(
  levers: SimLever[],
  filter: LeverFilter,
  affectations: Record<string, Affectation>,
): SimLever[] {
  if (filter === 'Tout') return levers;
  const want: LeverKind = filter === 'Aiguilles' ? 'aiguille' : 'controle';
  return levers.filter((l) => classifyLever(l, affectations) === want);
}

/** Nombre de leviers par signalId — pour disambiguïser les labels partagés. */
export function computeSignalLeverCounts(levers: SimLever[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const l of levers) {
    if (!l.signalId) continue;
    counts[l.signalId] = (counts[l.signalId] ?? 0) + 1;
  }
  return counts;
}

/** Label d'un levier façon Gessie (cf. `LeversPanel.formatLeverLabel`). */
export function leverLabel(lever: SimLever, counts: Record<string, number>): string {
  const signalId = lever.signalId;
  if (!signalId) return lever.affectations[0] ?? lever.id;
  const shared = (counts[signalId] ?? 0) > 1;
  if (!shared) return signalId;
  const dests = lever.directionLabels ?? [];
  if (dests.length === 0) return signalId;
  if (dests.length === 1) return `${signalId}/${dests[0]}`;
  return `${signalId}/${dests[0]} à ${dests[dests.length - 1]}`;
}

/** Libellé lisible de l'état d'une affectation (aiguille G/D, signal O/F). */
export function affEtatLabel(aff: Affectation | undefined): string {
  if (!aff) return '—';
  if (aff.type === 'aiguille') {
    const p = aff.position;
    if (p === 'G' || p === 'g') return p === 'g' ? 'Gauche (disc.)' : 'Gauche';
    if (p === 'D' || p === 'd') return p === 'd' ? 'Droite (disc.)' : 'Droite';
    return '—';
  }
  if (aff.type === 'signal' || aff.type === 'controle') {
    if (aff.position === 'O') return 'Ouvert';
    if (aff.position === 'F') return 'Fermé';
  }
  return aff.position ?? '—';
}

/** État affiché du levier = état de sa première affectation pilotée. */
export function leverEtat(lever: SimLever, affectations: Record<string, Affectation>): string {
  const affId = lever.affectations[0];
  return affId ? affEtatLabel(affectations[affId]) : '—';
}

/** Rectangle monde (coordonnées SVG du TCO) à cadrer pour le zoom. */
export interface FocusRect {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

// Items susceptibles d'être pilotés par un levier et positionnés sur le plan.
const FOCUS_TOOLS = new Set(['aiguille', 'controle', 'signal', 'taquet']);
// Marge monde autour des items ciblés (un signal déborde vers le haut, etc.).
const FOCUS_PAD = 140;
// Empreinte monde minimale du cadre : évite un zoom excessif sur un point seul.
const FOCUS_MIN_W = 560;
const FOCUS_MIN_H = 300;
// Aspect cible ≈ celui de la bande TCO mobile (≈ 480 × 222) : on étire le
// cadre à cet aspect pour qu'il remplisse la zone sans sur-dézoomer.
const FOCUS_ASPECT = 480 / 222;

/**
 * Rectangle à cadrer pour zoomer le TCO sur le levier sélectionné : bounding
 * box de TOUS les items qu'il pilote (par `name` d'affectation), élargi d'une
 * marge, d'une empreinte minimale et de l'aspect de la bande. Cadrer le groupe
 * d'items (plutôt qu'un point) donne un zoom cohérent quelle que soit la gare.
 * `null` si aucun item piloté n'est localisable.
 */
export function resolveLeverFocus(
  station: { items: StationItem[] } | null,
  lever: SimLever | null,
  affectations: Record<string, Affectation>,
): FocusRect | null {
  if (!station || !lever) return null;
  // Noms d'items candidats. Subtilité : les affectations d'aiguille sont
  // nommées « Ag<name> » par le builder (ex. « Ag11 ») alors que l'item TCO
  // s'appelle juste « 11 » → on ajoute aussi le nom sans le préfixe « Ag ».
  const names = new Set<string>();
  for (const affId of lever.affectations) {
    const raw = String(affectations[affId]?.name ?? affId);
    names.add(raw);
    if (raw.startsWith('Ag')) names.add(raw.slice(2));
  }
  const xs: number[] = [];
  const ys: number[] = [];
  for (const it of station.items) {
    if (!FOCUS_TOOLS.has(it.toolId)) continue;
    if (typeof it.xPos !== 'number' || typeof it.yPos !== 'number') continue;
    if (!names.has(String(it.name))) continue;
    xs.push(it.xPos);
    ys.push(it.yPos);
  }
  if (xs.length === 0) return null;

  let minX = Math.min(...xs) - FOCUS_PAD;
  const maxX = Math.max(...xs) + FOCUS_PAD;
  let minY = Math.min(...ys) - FOCUS_PAD;
  const maxY = Math.max(...ys) + FOCUS_PAD;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  let width = Math.max(maxX - minX, FOCUS_MIN_W);
  let height = Math.max(maxY - minY, FOCUS_MIN_H);
  // Étire à l'aspect de la bande pour remplir la zone (cadre centré inchangé).
  if (width / height < FOCUS_ASPECT) width = height * FOCUS_ASPECT;
  else height = width / FOCUS_ASPECT;

  minX = cx - width / 2;
  minY = cy - height / 2;
  return { minX, minY, width, height };
}
