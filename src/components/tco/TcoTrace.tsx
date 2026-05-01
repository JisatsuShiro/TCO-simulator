import type { StationItem, Tool } from '../../types/gessie';

interface Props {
  item: StationItem;
  tool: Tool;
}

/**
 * Trace : segment de ligne libre (outil "crayon" du designer).
 *
 * Format particulier (type "traceLine") :
 *  - x1, y1, x2, y2 (pas de xPos/yPos)
 *  - ui : "full" / "dashed" / "square"
 */
export function TcoTrace({ item }: Props) {
  const x1 = item.x1 as number | undefined;
  const y1 = item.y1 as number | undefined;
  const x2 = item.x2 as number | undefined;
  const y2 = item.y2 as number | undefined;
  if (x1 == null || y1 == null || x2 == null || y2 == null) return null;

  const ui = String(item.ui ?? 'full');

  if (ui === 'square') {
    // Rectangle entre les deux points
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    return (
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="none"
        stroke="#bdc3c7"
        strokeWidth={1.5}
      />
    );
  }

  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke="#bdc3c7"
      strokeWidth={1.5}
      strokeDasharray={ui === 'dashed' ? '6 3' : undefined}
      strokeLinecap="round"
    />
  );
}
