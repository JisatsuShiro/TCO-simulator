import type { StationItem, Tool } from '../../types/gessie';

interface Props {
  item: StationItem;
  tool: Tool;
}

/**
 * Placeholder générique pour les types d'items pas encore implémentés.
 * Affiche un petit carré + le toolId, utile pour visualiser la position
 * de tous les éléments d'une station avant d'avoir codé chaque primitive.
 */
export function TcoGenericPlaceholder({ item, tool }: Props) {
  if (item.xPos == null || item.yPos == null) return null;
  return (
    <g transform={`translate(${item.xPos}, ${item.yPos})`}>
      <rect
        x={-6}
        y={-6}
        width={12}
        height={12}
        fill="#34495e"
        stroke="#7f8c8d"
        strokeWidth={1}
        opacity={0.7}
      />
      <text x={10} y={4} fontSize={9} fill="#bdc3c7" fontFamily="monospace">
        {tool.id}
      </text>
    </g>
  );
}
