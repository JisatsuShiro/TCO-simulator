import type { StationItem, Tool } from '../../types/gessie';

interface Props {
  item: StationItem;
  tool: Tool;
}

/**
 * Voie : segment horizontal à deux rails parallèles avec flèches indicatrices
 * de sens de circulation.
 *
 * Reproduction fidèle du tco-voie Gessie (renderer.js @288936 + @666343).
 *
 * Architecture :
 *   - Le data() construit deux strings pathUp et pathDown en concaténant
 *     des fragments selon une séquence de 5 segments choisie par sens/ipcf
 *   - La render fn assemble : path d="M0,-8 [pathUp] M0,-8m0,16 [pathDown]"
 *     → top rail à y=-8, bottom rail à y=8 (gap 16, aligné avec les rails)
 *   - Label affiché à (110, -15) avec font-size 20, text-anchor middle
 *
 * Patterns par segment :
 *   "<" : pathUp += l42,-12l-12,12h10  ; pathDown += l42,12l-12,-12h10
 *         → flèche pointant vers la gauche
 *   ">" : pathUp += h10l-12,-12l42,12  ; pathDown += h10l-12,12l42,-12
 *         → flèche pointant vers la droite
 *   "_" : both += h40
 *         → segment plat de 40px
 *
 * Séquences de 5 segments selon (sens, ipcf) :
 *   left,        ipcf=false : ["<","_","_","_","_"]
 *   left,        ipcf=true  : ["<","<","_","_",">"]
 *   right,       ipcf=false : ["_","_","_","_",">"]
 *   right,       ipcf=true  : ["<","_","_",">",">"]
 *   both/autre              : ["<","_","_","_",">"]
 *
 * Largeur totale ≈ 200 px.
 */
function buildVoiePaths(sens: string, ipcf: boolean): { pathUp: string; pathDown: string } {
  let segments: string[];
  if (sens === 'left') {
    segments = ipcf ? ['<', '<', '_', '_', '>'] : ['<', '_', '_', '_', '_'];
  } else if (sens === 'right') {
    segments = ipcf ? ['<', '_', '_', '>', '>'] : ['_', '_', '_', '_', '>'];
  } else {
    segments = ['<', '_', '_', '_', '>'];
  }

  let pathUp = '';
  let pathDown = '';
  for (const seg of segments) {
    if (seg === '<') {
      pathUp += 'l42,-12l-12,12h10';
      pathDown += 'l42,12l-12,-12h10';
    } else if (seg === '>') {
      pathUp += 'h10l-12,-12l42,12';
      pathDown += 'h10l-12,12l42,-12';
    } else {
      pathUp += 'h40';
      pathDown += 'h40';
    }
  }
  return { pathUp, pathDown };
}

export function TcoVoie({ item }: Props) {
  if (item.xPos == null || item.yPos == null) return null;
  const sens = String(item.sens ?? 'both');
  const ipcf = Boolean(item.ipcf);
  const name = item.name ? String(item.name) : '';

  const { pathUp, pathDown } = buildVoiePaths(sens, ipcf);
  // Single path : start top rail M0,-8, append pathUp, jump to bottom rail
  // (M0,-8 m0,16 = M0,8), append pathDown
  const d = `M0,-8 ${pathUp} M0,-8m0,16 ${pathDown}`;

  return (
    <g transform={`translate(${item.xPos}, ${item.yPos})`}>
      {/* Zone de hit élargie pour le clic-droit (menu Lancer un train).
          Le path lui-même est fin (rails + flèches), faut viser pile dessus
          sans ce rect. */}
      <rect
        x={-10}
        y={-22}
        width={220}
        height={44}
        fill="transparent"
        pointerEvents="all"
      />
      <path
        d={d}
        fill="transparent"
        stroke="var(--tco-trait)"
        strokeWidth={2}
        strokeMiterlimit={10}
        pointerEvents="none"
      />
      {name && (
        <text
          x={110}
          y={-15}
          fontSize={20}
          fill="var(--tco-trait)"
          fontFamily="system-ui"
          textAnchor="middle"
        >
          {name}
        </text>
      )}
    </g>
  );
}
