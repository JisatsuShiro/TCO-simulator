import type { StationItem, Tool } from '../../types/gessie';

interface Props {
  item: StationItem;
  tool: Tool;
  /** Taille du symbole en unités SVG. */
  size?: number;
  /** Couleur appliquée au symbole. Les paths utilisent fill="inherit" ou stroke="inherit". */
  color?: string;
}

/**
 * Primitive générique : rend la variation de l'item via <use> sur l'icons.svg
 * du tool. Fonctionne pour aiguille, joint, taquet, tjd, tjs, to — tout type
 * dont la variation pointe vers un symbole de la forme "./icons.svg#<id>".
 *
 * Selon le type, les paths utilisent fill="inherit" (joint, taquet) ou
 * stroke="inherit" (aiguille, tjd, tjs, to). On set les deux sur <use>
 * pour couvrir les deux cas.
 */
export function TcoSvgIcon({ item, tool, size = 20, color = '#ecf0f1' }: Props) {
  if (!item.variationId || item.xPos == null || item.yPos == null) return null;
  const variation = tool.variations[item.variationId];
  if (!variation) return null;

  // Variation.icon = "./icons.svg#e-nw" ou "./ui.svg#w" → on extrait le filename + symbolId
  const [path, symbolId] = variation.icon.split('#');
  if (!symbolId) return null;
  const filename = path.split('/').pop() || 'icons.svg';

  // Les fichiers SVG sont servis depuis /public/items/{id}-{version}/{filename}
  const href = `/items/${tool.id}-${tool.version}/${filename}#${symbolId}`;

  const half = size / 2;

  return (
    <g>
      <use
        href={href}
        x={item.xPos - half}
        y={item.yPos - half}
        width={size}
        height={size}
        fill={color}
        stroke={color}
      />
      {item.name && (
        <text
          x={item.xPos + half + 2}
          y={item.yPos + 4}
          fontSize={8}
          fill="#bdc3c7"
          fontFamily="monospace"
        >
          {String(item.name)}
        </text>
      )}
    </g>
  );
}
