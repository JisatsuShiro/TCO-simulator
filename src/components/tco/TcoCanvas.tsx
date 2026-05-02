import { useMemo } from 'react';
import { useGessieStore } from '../../store/useGessieStore';
import { getRenderer } from './renderers';
import type { ContextMenuTarget } from './TcoContextMenu';
import type { StationItem } from '../../types/gessie';

/* Plus de props : le SVG occupe 100% de son conteneur via CSS, et le viewBox
 * gère le scaling vectoriel pour que tout le contenu soit visible. */

interface BoundingBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

interface Props {
  /** Clic-droit sur un item dont l'affectation supporte au moins une avarie
   *  (aiguille / contrôle / zone). */
  onAvariesMenu?: (target: ContextMenuTarget, x: number, y: number) => void;
  /** Clic-droit sur une voie : ouvre le menu de lancement de train. */
  onTrainMenu?: (suggestedStartingPoint: string | null, x: number, y: number) => void;
}

/**
 * Conteneur SVG du TCO. Itère sur station.items et délègue à la primitive
 * correspondant à item.toolId.
 *
 * Le SVG occupe 100% de son parent. Le `viewBox` est calculé sur le bounding
 * box des items, et `preserveAspectRatio="xMidYMid meet"` (défaut) scale
 * vectoriellement pour faire tenir tout le contenu sans déformer.
 */
export function TcoCanvas({ onAvariesMenu, onTrainMenu }: Props) {
  const station = useGessieStore((s) => s.station);
  const tools = useGessieStore((s) => s.tools);

  const bbox: BoundingBox = useMemo(() => {
    if (!station || station.items.length === 0) {
      return { minX: 0, minY: 0, width: 2400, height: 1200 };
    }
    // Items standards : xPos/yPos. traceLine : x1/y1/x2/y2.
    const xs: number[] = [];
    const ys: number[] = [];
    for (const i of station.items) {
      if (typeof i.xPos === 'number') xs.push(i.xPos);
      if (typeof i.yPos === 'number') ys.push(i.yPos);
      if (typeof i.x1 === 'number') xs.push(i.x1 as number);
      if (typeof i.x2 === 'number') xs.push(i.x2 as number);
      if (typeof i.y1 === 'number') ys.push(i.y1 as number);
      if (typeof i.y2 === 'number') ys.push(i.y2 as number);
    }
    if (xs.length === 0 || ys.length === 0) {
      return { minX: 0, minY: 0, width: 2400, height: 1200 };
    }
    // Padding asymétrique : à droite et en bas, les items s'étendent à partir
    // de leur xPos/yPos (rails, voies font ~200px de long), donc on prévoit
    // de la marge. À gauche et en haut, l'item est centré sur xPos/yPos donc
    // marge minimale suffit. Plus le bbox est serré, plus le contenu rendu
    // est grand pour une même surface de viewport.
    const minX = Math.min(...xs) - 20;
    const minY = Math.min(...ys) - 30;
    const maxX = Math.max(...xs) + 220; // voie : ~200px à droite
    const maxY = Math.max(...ys) + 40;
    return { minX, minY, width: maxX - minX, height: maxY - minY };
  }, [station]);

  if (!station) {
    return <div style={{ padding: 20, color: '#888' }}>Aucune station chargée.</div>;
  }

  const viewBox = `${bbox.minX} ${bbox.minY} ${bbox.width} ${bbox.height}`;

  const handleContextMenu = (e: React.MouseEvent<SVGGElement>, item: StationItem) => {
    // Voie ou rail → menu de lancement de train, point de départ inféré
    // par proximité géométrique (zone la plus proche du clic).
    if ((item.toolId === 'voie' || item.toolId === 'rail') && onTrainMenu) {
      e.preventDefault();
      const svg = e.currentTarget.ownerSVGElement;
      const clickPt = svg ? clientToSvg(svg, e.clientX, e.clientY) : null;
      const closest = clickPt ? findClosestZone(clickPt) : null;
      onTrainMenu(closest, e.clientX, e.clientY);
      return;
    }
    // Aiguille / contrôle / zone → menu d'avaries.
    if (onAvariesMenu) {
      const target = resolveAvariesTarget(item);
      if (!target) return;
      e.preventDefault();
      onAvariesMenu(target, e.clientX, e.clientY);
    }
  };

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      style={{ background: '#1e272e', display: 'block' }}
    >
      <g>
        {station.items.map((item) => {
          const tool = tools[item.toolId];
          if (!tool) return null;
          const Renderer = getRenderer(item.toolId);
          return (
            <g key={item.uid} onContextMenu={(e) => handleContextMenu(e, item)}>
              <Renderer item={item} tool={tool} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/**
 * Résout l'item du TCO en cible de menu d'avaries. On essaie plusieurs
 * conventions de clé :
 *   - aiguille  → 'Ag' + item.name
 *   - controle  → item.name (signal carré ou box-style)
 *   - zone      → item.name ou 'z ' + item.name
 *
 * Lecture lazy via getState() : on n'a pas besoin de souscription Zustand,
 * juste de récupérer les affectations à l'instant du clic-droit.
 */
function resolveAvariesTarget(item: StationItem): ContextMenuTarget | null {
  const data = useGessieStore.getState().player.data;
  if (!data) return null;
  const name = item.name != null ? String(item.name) : '';
  if (!name) return null;

  const candidates = [name, 'Ag' + name, 'z ' + name];
  for (const key of candidates) {
    const a = data.affectations[key];
    if (!a) continue;
    if (a.type === 'aiguille' || a.type === 'controle' || a.type === 'zone') {
      return {
        id: key,
        affType: a.type,
        hasEap: Boolean(a.eap),
        hasEpa: Boolean(a.epa),
        hasProxi: Boolean(a.pedales?.Proxi),
      };
    }
  }
  return null;
}

/**
 * Convertit des coordonnées écran (clientX/Y) en coordonnées SVG monde
 * en utilisant la matrice CTM courante du SVG. Tient compte du viewBox
 * et du scaling appliqué par `preserveAspectRatio`.
 */
function clientToSvg(svg: SVGSVGElement, x: number, y: number): { x: number; y: number } | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const pt = new DOMPoint(x, y).matrixTransform(ctm.inverse());
  return { x: pt.x, y: pt.y };
}

/**
 * Trouve la zone (affectation type 'zone') dont la position est la plus
 * proche du point cliqué (en coordonnées SVG monde). Retourne l'ID
 * d'affectation ou null si aucune zone n'a été trouvée.
 *
 * Les zones n'ont pas de position sur l'affectation directement — on
 * lit la position via le station item correspondant (toolId === 'zone',
 * dont le `name` correspond à la clé d'affectation).
 */
function findClosestZone(clickPt: { x: number; y: number }): string | null {
  const state = useGessieStore.getState();
  const data = state.player.data;
  const station = state.station;
  if (!data || !station) return null;

  let best: { id: string; dist: number } | null = null;
  for (const item of station.items) {
    if (item.toolId !== 'zone') continue;
    if (item.xPos == null || item.yPos == null) continue;
    const itemName = item.name != null ? String(item.name) : '';
    if (!itemName) continue;

    const candidates = [itemName, 'z ' + itemName];
    let affId: string | null = null;
    for (const k of candidates) {
      const a = data.affectations[k];
      if (a && a.type === 'zone') {
        affId = k;
        break;
      }
    }
    if (!affId) continue;

    const dist = Math.hypot(item.xPos - clickPt.x, item.yPos - clickPt.y);
    if (!best || dist < best.dist) {
      best = { id: affId, dist };
    }
  }
  return best?.id ?? null;
}
