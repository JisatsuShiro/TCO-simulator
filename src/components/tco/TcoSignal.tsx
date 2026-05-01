import type { StationItem, Tool } from '../../types/gessie';
import { useGessieStore } from '../../store/useGessieStore';

interface Props {
  item: StationItem;
  tool: Tool;
}

/**
 * Position courante de l'affectation `signal` dans le Player store.
 * Sélecteur primitif (string) pour éviter le piège Zustand "getSnapshot".
 */
function useSignalPosition(name: string | null): string | null {
  return useGessieStore((s) => {
    if (!name || !s.player.data) return null;
    return s.player.data.affectations[name]?.position ?? null;
  });
}

/**
 * Signal — pictogramme placé sur la voie (avertissement de carré, rappel
 * d'avertissement, indicateur de direction…). Reproduction fidèle de
 * `tco-signal` (renderer.js @286020 data + @649083 template) :
 *
 *   props : ["name", "label"]
 *   etat  : `Player.affectations[name].position` (mode play uniquement)
 *   render: <circle r=3 fill={etat==='A' ? '#FFCC00' : 'transparent'}
 *                    stroke=black/>
 *           <text>{name}</text>
 *
 * Sémantique des positions (différente de `controle` qui utilise F/O) :
 *   - "I"  = inactif / au repos          → pas de couleur
 *   - "A"  = avertissement actif         → rond jaune
 *
 * Le levier qui contrôle ce signal porte la correspondance plus → 'I',
 * minus → 'A'. Quand le levier passe en minus, le rond jaune apparaît.
 *
 * Pas d'interaction au clic (Gessie ne permet pas de cliquer un signal —
 * c'est le levier associé qui le commande).
 */
export function TcoSignal({ item }: Props) {
  if (item.xPos == null || item.yPos == null) return null;

  const name = item.name ? String(item.name) : '';
  const etat = useSignalPosition(name || null);
  const isActive = etat === 'A';

  return (
    <g transform={`translate(${item.xPos}, ${item.yPos})`}>
      <circle
        cx={0}
        cy={0}
        r={5}
        fill={isActive ? '#FFCC00' : 'transparent'}
        stroke="#ecf0f1"
        strokeWidth={1.5}
      />
      {name && (
        <text
          x={10}
          y={4}
          fontSize={12}
          fill="#ecf0f1"
          fontFamily="system-ui"
        >
          {name}
        </text>
      )}
    </g>
  );
}
