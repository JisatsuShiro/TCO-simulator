// Taquet : symbole en équerre indiquant un dérailleur ou butoir de protection.
//
// Reproduction procédurale fidèle de `taquet/icons.svg` du package Gessie.
// Le path d'origine vit dans un viewBox 0 0 512 512 et est dupliqué pour
// chacune des 8 orientations via `transform="rotate(angle 256 256)"`.
//
// Convention orientations :
//   w (gauche)   : 0°    nw : 45°
//   n (haut)     : 90°   ne : 135°
//   e (droite)   : 180°  se : 225°
//   s (bas)      : 270°  sw : 315°
//
// Le path original (centré sur 256,256 en taille 512) :
//   M64,64L64,374L160,374L160,310L128,310L128,128L160,128L160,64z
//
// Chemin de rendu : `<g transform="translate(xPos,yPos) rotate(angle) scale(s) translate(-256,-256)">`
// avec s = SIZE/512 — équivalent au `<use>` du bundle mais inlined React.

import type { StationItem, Tool } from '../../types/gessie';

interface Props {
  item: StationItem;
  tool: Tool;
}

const TAQUET_PATH =
  'M64,64L64,374L160,374L160,310L128,310L128,128L160,128L160,64z';

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

export function TcoTaquet({ item, tool }: Props) {
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
        <path d={TAQUET_PATH} fill="var(--tco-trait)" stroke="none" />
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
