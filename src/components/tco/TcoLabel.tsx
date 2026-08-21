import type { StationItem, Tool } from '../../types/gessie';

interface Props {
  item: StationItem;
  tool: Tool;
}

const SIZE_MAP: Record<string, number> = {
  small: 9,
  medium: 12,
  large: 16,
};

const COLOR_MAP: Record<string, string> = {
  black: 'var(--tco-trait)',  // sur fond foncé, "noir" devient blanc lisible
  blue: '#3498db',
  red: '#e74c3c',
};

/**
 * Label : texte libre, optionnellement encadré, taille et couleur paramétrables.
 *
 * Notes :
 *  - Gessie utilise "black" comme couleur par défaut, on le mappe en blanc
 *    pour rester lisible sur fond TCO foncé.
 *  - L'encadré est un rectangle fin autour du texte.
 */
export function TcoLabel({ item }: Props) {
  if (item.xPos == null || item.yPos == null) return null;
  const text = String(item.text ?? '');
  if (!text) return null;

  const size = SIZE_MAP[String(item.size ?? '')] ?? 11;
  const color = COLOR_MAP[String(item.color ?? '')] ?? 'var(--tco-trait)';
  const border = Boolean(item.border);

  // Largeur approximative : ~0.6 * fontSize par caractère monospace
  const w = Math.max(text.length * size * 0.6 + 8, 20);
  const h = size + 6;

  return (
    <g transform={`translate(${item.xPos}, ${item.yPos})`}>
      {border && (
        <rect
          x={-2}
          y={-h + size / 2 - 1}
          width={w}
          height={h}
          fill="none"
          stroke={color}
          strokeWidth={1}
        />
      )}
      <text x={2} y={size / 2} fontSize={size} fill={color} fontFamily="system-ui">
        {text}
      </text>
    </g>
  );
}
