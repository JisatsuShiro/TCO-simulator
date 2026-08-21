import { useState } from 'react';
import { TcoCanvas } from './TcoCanvas';
import { TcoContextMenu } from './TcoContextMenu';
import type { ContextMenuTarget } from './TcoContextMenu';
import { TcoTrainMenu } from './TcoTrainMenu';
import { TcoAtrLight } from './TcoAtrLight';

interface Props {
  /** Hauteur du viewport visible (la largeur prend 100% du parent). */
  height?: number | string;
  /** Rectangle monde (coordonnées SVG) à cadrer, avec animation. `null` → vue
   *  d'ensemble. Non fourni (bureau) → vue statique inchangée. Transmis tel
   *  quel à `TcoCanvas`. */
  focus?: { minX: number; minY: number; width: number; height: number } | null;
  /** Nonce de recentrage (cf. TcoCanvas) — transmis tel quel. */
  recenter?: number;
}

interface AvariesMenuState {
  x: number;
  y: number;
  target: ContextMenuTarget;
}

interface TrainMenuState {
  x: number;
  y: number;
  suggestedStartingPoint: string | null;
}

/**
 * Conteneur du TCO. Pan/zoom temporairement désactivés — le contenu déborde
 * en scroll natif si la station est plus grande que le viewport.
 *
 * Gère les deux menus contextuels du TCO :
 *   - Avaries : clic-droit sur aiguille / contrôle / zone
 *   - Lancer un train : clic-droit sur voie
 *
 * Pour réactiver le pan/zoom plus tard : remettre TransformWrapper /
 * TransformComponent de react-zoom-pan-pinch ici (la lib reste installée).
 */
export function TcoViewport({ height = '80vh', focus, recenter }: Props) {
  const [avariesMenu, setAvariesMenu] = useState<AvariesMenuState | null>(null);
  const [trainMenu, setTrainMenu] = useState<TrainMenuState | null>(null);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height,
        background: 'var(--tco-panel)',
        overflow: 'hidden',
        border: '1px solid var(--tco-border)',
      }}
    >
      <TcoCanvas
        focus={focus}
        recenter={recenter}
        onAvariesMenu={(target, x, y) => {
          setTrainMenu(null);
          setAvariesMenu({ target, x, y });
        }}
        onTrainMenu={(suggestedStartingPoint, x, y) => {
          setAvariesMenu(null);
          setTrainMenu({ suggestedStartingPoint, x, y });
        }}
      />
      {/* LED ATR globale — repro `<div class="top">ATr <atr-light/></div>`
          du bundle. Centré en haut du TCO, conditionné par la présence d'au
          moins un ATR (le composant retourne null sinon). */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          pointerEvents: 'auto',
        }}
      >
        <TcoAtrLight />
      </div>
      {avariesMenu && (
        <TcoContextMenu
          x={avariesMenu.x}
          y={avariesMenu.y}
          target={avariesMenu.target}
          onClose={() => setAvariesMenu(null)}
        />
      )}
      {trainMenu && (
        <TcoTrainMenu
          x={trainMenu.x}
          y={trainMenu.y}
          suggestedStartingPoint={trainMenu.suggestedStartingPoint}
          onClose={() => setTrainMenu(null)}
        />
      )}
    </div>
  );
}
