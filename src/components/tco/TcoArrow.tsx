// Flèche de direction : chevron en V indiquant un sens de circulation.
//
// Reproduction procédurale fidèle de `arrow/ui.svg` du package Gessie. Le
// path d'origine vit dans un viewBox 0 0 512 512 et est dupliqué pour 8
// rotations via `transform="rotate(angle 256 256)"` (mêmes conventions
// que le taquet, cf. TcoTaquet.tsx).
//
// Le path original (chevron pointant à gauche, taille 512) :
//   M128,256L384,0L256,256l128,256L128,256z
//
// Note : les variations actuelles du tool n'exposent que `w` et `e`, mais
// on supporte les 8 orientations comme la SVG d'origine au cas où une
// future station les utiliserait.

import type { StationItem, Tool } from '../../types/gessie';

interface Props {
  item: StationItem;
  tool: Tool;
}

const ARROW_PATH = 'M128,256L384,0L256,256l128,256L128,256z';

const ROTATION: Record<string, number> = {
  w: 0,
  nw: 45,
  n: 90,
  ne: 135,
  e: 180,
  se: 225,
  s: 270,
  sw: 315,
};

const SIZE = 20;

export function TcoArrow({ item, tool }: Props) {
  if (item.xPos == null || item.yPos == null || !item.variationId) return null;
  const variation = tool.variations[item.variationId];
  if (!variation) return null;
  const ui = variation.ui ?? item.variationId;
  const angle = ROTATION[ui];
  if (angle === undefined) return null;

  const scale = SIZE / 512;

  return (
    <g>
      <g
        transform={`translate(${item.xPos}, ${item.yPos}) rotate(${angle}) scale(${scale}) translate(-256, -256)`}
      >
        <path d={ARROW_PATH} fill="var(--tco-trait)" stroke="none" />
      </g>
      {item.name && (
        <text
          x={item.xPos + SIZE / 2 + 2}
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
