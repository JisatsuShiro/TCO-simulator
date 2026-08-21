import type { StationItem, Tool } from '../../types/gessie';

interface Props {
  item: StationItem;
  tool: Tool;
}

interface RailNode {
  x: number;
  y: number;
}

/**
 * Écart entre les deux rails parallèles (px).
 * Aligné sur la convention Gessie : aiguille place son trunk à y=±8
 * (cf. render fn @569560 → "M0,8*vMod"), donc gap = 16.
 */
const RAIL_GAP = 16;

/**
 * Rail : deux paths parallèles tracés depuis (xPos, yPos) à travers les nodes.
 *
 * Reproduction de l'algorithme de tco-rail (renderer.js @283896) :
 *   1. Trier les nodes par x ascendant
 *   2. Compléter à `length` nodes en ajoutant {x: prev.x + 50, y: prev.y}
 *   3. Pour chaque transition prev → node :
 *      - dx = node.x - prev.x  (doit être ≥ 0)
 *      - dy = node.y - prev.y
 *      - f  = |dx| - |dy|       (doit être ≥ 0)
 *      - rail haut : l{f},0 + (l6,0 si dy>0) + l{|dy|},{dy} + (l6,0 si dy<0)
 *      - rail bas  : l{f},0 + (l6,0 si dy<0) + l{|dy|},{dy} + (l6,0 si dy>0)
 *      Le décalage de 6px sur l'un ou l'autre rail compense la diagonale
 *      pour que les deux rails restent parallèles.
 */
export function TcoRail({ item }: Props) {
  const xPos = item.xPos;
  const yPos = item.yPos;
  if (xPos == null || yPos == null) return null;

  const rawNodes = item['nodes'];
  let nodes: RailNode[] = [];
  if (Array.isArray(rawNodes)) {
    nodes = rawNodes as RailNode[];
  } else if (typeof rawNodes === 'string') {
    try {
      nodes = JSON.parse(rawNodes);
    } catch {
      return null;
    }
  }

  const n = parseInt(String(item['nodesNumber'] ?? nodes.length), 10) || nodes.length;
  const used = nodes.slice(0, n).sort((a, b) => a.x - b.x);
  // Pad avec +50,0 si pas assez de nodes
  while (used.length < n) {
    const last = used[used.length - 1] ?? { x: 0, y: 0 };
    used.push({ x: last.x + 50, y: last.y });
  }

  let pathTop = `M${xPos},${yPos - RAIL_GAP / 2}`;
  let pathBot = `M${xPos},${yPos + RAIL_GAP / 2}`;
  let prev = { x: 0, y: 0 };

  for (const node of used) {
    const dx = node.x - prev.x;
    const dy = node.y - prev.y;
    if (dx < 0) {
      prev = node;
      continue; // skip invalides (Gessie marque "error")
    }
    const f = Math.abs(dx) - Math.abs(dy);
    if (f < 0) {
      prev = node;
      continue;
    }

    pathTop += `l${f},0`;
    if (dy > 0) pathTop += `l6,0`;
    pathTop += `l${Math.abs(dy)},${dy}`;
    if (dy < 0) pathTop += `l6,0`;

    pathBot += `l${f},0`;
    if (dy < 0) pathBot += `l6,0`;
    pathBot += `l${Math.abs(dy)},${dy}`;
    if (dy > 0) pathBot += `l6,0`;

    prev = node;
  }

  const isDashed = item.variationId === 'dashed';
  const dashArray = isDashed ? '8 4' : undefined;

  // Hit rect : bounding box approximative du rail à partir des nodes,
  // pour permettre le clic-droit (menu Lancer un train) n'importe où sur
  // le segment, pas seulement sur le stroke fin du path.
  const lastX = used[used.length - 1]?.x ?? 0;
  const yDeltas = used.map((n) => n.y);
  const yMin = Math.min(0, ...yDeltas);
  const yMax = Math.max(0, ...yDeltas);
  const hitX = xPos - 4;
  const hitY = yPos + yMin - (RAIL_GAP / 2 + 4);
  const hitWidth = lastX + 8;
  const hitHeight = yMax - yMin + RAIL_GAP + 8;

  return (
    <g>
      <rect
        x={hitX}
        y={hitY}
        width={hitWidth}
        height={hitHeight}
        fill="transparent"
        pointerEvents="all"
      />
      <path
        d={pathTop}
        fill="none"
        stroke="var(--tco-trait)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="miter"
        strokeDasharray={dashArray}
        pointerEvents="none"
      />
      <path
        d={pathBot}
        fill="none"
        stroke="var(--tco-trait)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="miter"
        strokeDasharray={dashArray}
        pointerEvents="none"
      />
    </g>
  );
}
