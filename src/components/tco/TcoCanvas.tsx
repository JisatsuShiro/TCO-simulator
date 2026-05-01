import { useMemo } from 'react';
import { useGessieStore } from '../../store/useGessieStore';
import { getRenderer } from './renderers';

/* Plus de props : le SVG occupe 100% de son conteneur via CSS, et le viewBox
 * gère le scaling vectoriel pour que tout le contenu soit visible. */

interface BoundingBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

/**
 * Conteneur SVG du TCO. Itère sur station.items et délègue à la primitive
 * correspondant à item.toolId.
 *
 * Le SVG occupe 100% de son parent. Le `viewBox` est calculé sur le bounding
 * box des items, et `preserveAspectRatio="xMidYMid meet"` (défaut) scale
 * vectoriellement pour faire tenir tout le contenu sans déformer.
 */
export function TcoCanvas() {
  const station = useGessieStore((s) => s.station);
  const tools = useGessieStore((s) => s.tools);
  const setHoveredUid = useGessieStore((s) => s.setHoveredUid);

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
            <g
              key={item.uid}
              onMouseEnter={() => setHoveredUid(item.uid)}
              onMouseLeave={() => setHoveredUid(null)}
              style={{ cursor: 'help' }}
            >
              <Renderer item={item} tool={tool} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
