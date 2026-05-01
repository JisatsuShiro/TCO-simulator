import type { StationItem, Tool } from '../../types/gessie';

interface Props {
  item: StationItem;
  tool: Tool;
}

/**
 * Paths exacts de la render function Vue de tco-joint (renderer.js @558289).
 *
 * Chaque joint est composé de DEUX paths formant des "brackets" face à face,
 * symbolisant une coupure isolante sur la voie.
 *
 *   e  : joint droit (entre deux rails horizontaux)
 *        → 2 rectangles ouverts en C de chaque côté de la coupure
 *   ne : joint oblique haut-droit (sur diagonale ↗)
 *   nw : joint oblique bas-droit (sur diagonale ↘)
 */
const PATHS: Record<string, string> = {
  e: 'M0,-8 h17 v16 h-17 M50,-8 h-17 v16 h17',
  ne: 'M12,-20 l-10,10 l11,11 l10,-10 M-20,12 l10,-10 l11,11 l-10,10',
  nw: 'M-20,-12 l10,10 l11,-11 l-10,-10 M12,20 l-10,-10 l11,-11 l10,10',
};

/**
 * Joint isolant : marque visuelle de coupure entre deux portions de rail.
 * Reproduction fidèle du rendu Gessie (et non plus l'icône SVG du toolbar).
 */
export function TcoJoint({ item, tool }: Props) {
  if (item.xPos == null || item.yPos == null || !item.variationId) return null;
  const variation = tool.variations[item.variationId];
  if (!variation) return null;

  const ui = variation.ui; // "e", "ne" ou "nw"
  const d = PATHS[ui];
  if (!d) return null;

  return (
    <g transform={`translate(${item.xPos}, ${item.yPos})`}>
      <path
        d={d}
        fill="transparent"
        stroke="#ecf0f1"
        strokeWidth={2}
        strokeMiterlimit={10}
      />
    </g>
  );
}
