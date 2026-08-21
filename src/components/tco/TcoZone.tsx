import type { StationItem, Tool } from '../../types/gessie';
import { useGessieStore } from '../../store/useGessieStore';

interface Props {
  item: StationItem;
  tool: Tool;
}

/**
 * Sélecteur primitif (boolean) pour `circulation`. On suit le pattern de
 * TcoAiguille : retourner uniquement une primitive empêche le bug
 * "getSnapshot should be cached" (chaque appel retourne la même référence
 * pour la même valeur).
 *
 * Cherche l'affectation soit par nom direct (ex: "z 1") soit en préfixant
 * "z " (selon la convention de génération du builder).
 */
function useZoneCirculation(name: string): boolean {
  return useGessieStore((s) => {
    if (!name || !s.player.data) return false;
    const aff =
      s.player.data.affectations[name] ??
      s.player.data.affectations['z ' + name];
    return Boolean(aff?.circulation);
  });
}

/**
 * Zone : rectangle blanc/rouge posé entre les deux rails, indicateur d'état
 * d'occupation d'une zone isolée.
 *
 * Reproduction fidèle de tco-zone (renderer.js : data() @289729 + render @582595).
 *
 * Structure du render :
 *   <svg x={x} y={y}>
 *     <g transform="rotate(rotate) translate(0, -2*(rotate/45))">
 *       [edit] <circle cx=0 cy=0 r=3 fill="red"/>      ← marqueur édition
 *       <path d="M-10,-8 h20 m0,16 h-20z"/>             ← 2 segments rails y=±8
 *       <rect x=-12 y=-5 width=24 height=10 fill={color}/>  ← rectangle zone
 *       <text y=-14 x=0 font-size=12 anchor="middle"/>  ← nom au-dessus
 *     </g>
 *   </svg>
 *
 * Couleur (computed `color` Vue, fidèle Gessie) :
 *   - circulation (un train occupe la zone) → "#FF0000"
 *   - libre / transit / par défaut          → "white"
 *
 * variationId :
 *   - "default" : visible (rect + nom)
 *   - "hidden"  : invisible (logique de zone sans représentation graphique)
 *
 * Translation accompagnant la rotation (-2*(rotate/45)) : compense le
 * décentrage visuel quand on tourne de 45/-45° (cf. controle, idem).
 */
export function TcoZone({ item }: Props) {
  // Hooks d'abord (rules-of-hooks).
  const name = item.name ? String(item.name) : '';
  // Couleur Gessie d'origine : circulation:true → rouge, sinon blanc.
  const circulation = useZoneCirculation(name);

  if (item.xPos == null || item.yPos == null) return null;

  const variation = item.variationId ?? 'default';
  if (variation === 'hidden') return null;

  const rotate = parseInt(String(item.rotate ?? '0'), 10) || 0;
  const rotateOffset = -2 * (rotate / 45);

  const color = circulation ? '#FF0000' : '#ffffff';

  return (
    <g transform={`translate(${item.xPos}, ${item.yPos})`}>
      <g transform={`rotate(${rotate}) translate(0, ${rotateOffset})`}>
        {/* Les rails qui traversent la zone */}
        <path
          d="M-10,-8 h20 m0,16 h-20z"
          fill="transparent"
          stroke="var(--tco-trait)"
          strokeWidth={2}
          strokeMiterlimit={10}
        />
        {/* Le rectangle de zone */}
        <rect
          x={-12}
          y={-5}
          width={24}
          height={10}
          fill={color}
          stroke="var(--tco-trait)"
          strokeWidth={2}
        />
        {/* Le nom de la zone au-dessus (Gessie: 12, agrandi pour lisibilité) */}
        {name && (
          <text
            y={-16}
            x={0}
            fontSize={20}
            fill="var(--tco-trait)"
            fontFamily="system-ui"
            textAnchor="middle"
          >
            {name}
          </text>
        )}
      </g>
    </g>
  );
}
