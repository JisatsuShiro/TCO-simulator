import type { StationItem, Tool } from '../../types/gessie';
import { useGessieStore } from '../../store/useGessieStore';

interface Props {
  item: StationItem;
  tool: Tool;
}

/**
 * Sélecteur primitif (string) pour la position d'une aiguille via son ID
 * d'affectation ("Ag" + name). Évite la boucle Zustand "getSnapshot".
 */
function useAiguillePosition(aigId: string | null): string | null {
  return useGessieStore((s) => {
    if (!aigId || !s.player.data) return null;
    return s.player.data.affectations[aigId]?.position ?? null;
  });
}

/**
 * Composant unifié pour tjd / tjs / to (cf. settings.json de chaque item :
 * tous utilisent `<tco-traverse :type="..." />`).
 *
 * Reproduction fidèle du data() + render() de tco-traverse
 * (renderer.js @287139 + @590400).
 *
 * Conventions :
 *   - shape ∈ {"nw-se", "ne-sw"}
 *   - type ∈ {"tjd", "tjs", "to"}
 *   - jonction (tjs uniquement) ∈ {"up", "down"}
 *
 * Pour les paths :
 *   e (jonction haute active) = type==="tjd" || (type==="tjs" && jonction==="up")
 *   t (jonction basse active) = type==="tjd" || (type==="tjs" && jonction==="down")
 *   → "to" a e=t=false (pas de jonction, juste un X)
 *   → "tjd" a e=t=true (les deux jonctions actives)
 *   → "tjs" n'a qu'une seule jonction selon `jonction`
 */
function buildPath(shape: string, type: string, jonction?: string): string {
  const e = type === 'tjd' || (type === 'tjs' && jonction === 'up');
  const t = type === 'tjd' || (type === 'tjs' && jonction === 'down');

  let n = 'M0,-8';

  // ===== TOP RAIL =====
  if (shape === 'nw-se') {
    n += 'h34l-60,-60m22,0';
    if (e) {
      n += 'l104,60';
      n += 'M76,-8h-20l-29,-29l49,29';
      n += 'M106,-8';
    } else {
      n += 'l60,60';
      n += 'h50';
    }
  } else {
    // shape === 'ne-sw'
    if (e) {
      n += 'l110,-60';
      n += 'M30,-8h20l29,-29l-49,29';
      n += 'M132,-68';
    } else {
      n += 'h50';
      n += 'l60,-60m22,0';
    }
    n += 'l-60,60h34';
  }

  // ===== BOTTOM RAIL =====
  n += 'M0,8';
  if (shape === 'nw-se') {
    if (t) {
      n += 'l110,60';
      n += 'M30,8l49,29l-29,-29h-20';
      n += 'M132,68';
    } else {
      n += 'h50';
      n += 'l60,60m22,0';
    }
    n += 'l-60,-60h34';
  } else {
    n += 'h34l-60,60m22,0';
    if (t) {
      n += 'l104,-60';
      n += 'M76,8h-20l-29,29l49,-29';
    } else {
      n += 'l60,-60';
      n += 'h50';
    }
  }

  return n;
}

/**
 * Positions des cercles de contrôle pour TJS : 4 cercles (2 pour chaque
 * aiguille visuelle) selon la combinaison shape × jonction. Reproduction
 * fidèle du data() Gessie (renderer.js @287139, blocs `a` et `i`).
 */
function tjsCircles(
  shape: string,
  jonction: string,
): { cx: number; cy: number; matches: 'G' | 'D' }[] {
  if (shape === 'nw-se' && jonction === 'down') {
    return [
      { cx: 30, cy: 0, matches: 'G' },
      { cx: 30, cy: 16, matches: 'D' },
      { cx: 73, cy: 41, matches: 'G' },
      { cx: 84, cy: 31, matches: 'D' },
    ];
  }
  if (shape === 'nw-se' && jonction === 'up') {
    return [
      { cx: 35, cy: -40, matches: 'G' },
      { cx: 23, cy: -30, matches: 'D' },
      { cx: 73, cy: 0, matches: 'G' },
      { cx: 73, cy: -17, matches: 'D' },
    ];
  }
  if (shape === 'ne-sw' && jonction === 'down') {
    return [
      { cx: 23, cy: 30, matches: 'G' },
      { cx: 30, cy: 43, matches: 'D' },
      { cx: 70, cy: 19, matches: 'G' },
      { cx: 73, cy: 0, matches: 'D' },
    ];
  }
  if (shape === 'ne-sw' && jonction === 'up') {
    return [
      { cx: 35, cy: -19, matches: 'G' },
      { cx: 40, cy: 0, matches: 'D' },
      { cx: 85, cy: -33, matches: 'G' },
      { cx: 73, cy: -40, matches: 'D' },
    ];
  }
  return [];
}

/**
 * Traversée (jonction double / simple / oblique) — primitive procédurale fidèle à Gessie.
 *
 * Caveats vs Gessie :
 *   - stroke blanc au lieu de noir (fond TCO foncé)
 *   - Cercles de contrôle câblés sur Player.affectations["Ag" + nameUp/nameDown].
 *   - Fans (paths rotate(±22deg)) reproduits pour tjd uniquement.
 */
export function TcoTraverse({ item, tool }: Props) {
  // Hooks d'abord (rules-of-hooks).
  const nameUp = item.nameUp ? String(item.nameUp) : '';
  const nameDown = item.nameDown ? String(item.nameDown) : '';
  // Affectations aiguilles : "Ag" + name (cf. tco-traverse data() @287139).
  const agH = useAiguillePosition(nameUp ? 'Ag' + nameUp : null);
  const agB = useAiguillePosition(nameDown ? 'Ag' + nameDown : null);

  if (item.xPos == null || item.yPos == null || !item.variationId) return null;
  const variation = tool.variations[item.variationId];
  if (!variation) return null;

  const shape = variation.ui;
  const jonction = (variation as { jonction?: string }).jonction;
  const type = tool.id; // "tjd" | "tjs" | "to"

  const d = buildPath(shape, type, jonction);

  return (
    <g transform={`translate(${item.xPos}, ${item.yPos})`}>
      <path
        d={d}
        fill="transparent"
        stroke="var(--tco-trait)"
        strokeWidth={2}
        strokeMiterlimit={10}
      />
      {type === 'tjd' && nameUp && (
        <text x={25} y={-55} fontSize={11} fill="var(--tco-trait)" fontFamily="monospace">
          {nameUp}
        </text>
      )}
      {type === 'tjd' && nameDown && (
        <text
          x={35 + (shape === 'nw-se' ? -20 : 20)}
          y={55}
          fontSize={11}
          fill="var(--tco-trait)"
          fontFamily="monospace"
        >
          {nameDown}
        </text>
      )}

      {/* === TJD : 2 fans (paths rotate ±22°) + 4 cercles de contrôle === */}
      {type === 'tjd' && shape === 'ne-sw' && (
        <>
          <path
            d="M0,30l0,-40a40,40 0 0,1 40,40 z"
            fill="white"
            stroke="#000000"
            transform="rotate(22)"
          />
          <TjdCircle cx={8} cy={2} active={agB === 'G'} />
          <TjdCircle cx={20} cy={32} active={agB === 'D'} />
          <path
            d="M100,-70l0,40a40,40 0 0,1 -40,-40z"
            fill="white"
            stroke="#000000"
            transform="rotate(22)"
          />
          <TjdCircle cx={100} cy={-2} active={agH === 'G'} />
          <TjdCircle cx={88} cy={-32} active={agH === 'D'} />
        </>
      )}
      {type === 'tjd' && shape === 'nw-se' && (
        <>
          <path
            d="M100,70 l-40,0a40,40 0 0,1 40,-40z"
            fill="white"
            stroke="#000000"
            transform="rotate(-22)"
          />
          <TjdCircle cx={88} cy={32} active={agB === 'G'} />
          <TjdCircle cx={100} cy={2} active={agB === 'D'} />
          <path
            d="M-0,-30l0,40a40,40 0 0,0 40,-40z"
            fill="white"
            stroke="#000000"
            transform="rotate(-22)"
          />
          <TjdCircle cx={20} cy={-32} active={agH === 'G'} />
          <TjdCircle cx={8} cy={-2} active={agH === 'D'} />
        </>
      )}

      {/* === TJS : 4 cercles selon shape × jonction (tous lus sur agH) === */}
      {type === 'tjs' && jonction && tjsCircles(shape, jonction).map((c, i) => (
        <TjdCircle key={i} cx={c.cx} cy={c.cy} active={agH === c.matches} />
      ))}
    </g>
  );
}

/**
 * Cercle de contrôle d'aiguille (r=5, jaune si position correspondante).
 */
function TjdCircle({ cx, cy, active }: { cx: number; cy: number; active: boolean }) {
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      stroke="var(--tco-trait)"
      strokeWidth={1}
      fill={active ? '#FFCC00' : 'transparent'}
    />
  );
}
