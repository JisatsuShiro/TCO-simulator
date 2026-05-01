import { TcoCanvas } from './TcoCanvas';
import { ItemTooltip } from './ItemTooltip';

interface Props {
  /** Hauteur du viewport visible (la largeur prend 100% du parent). */
  height?: number | string;
}

/**
 * Conteneur du TCO. Pan/zoom temporairement désactivés — le contenu déborde
 * en scroll natif si la station est plus grande que le viewport.
 *
 * Pour réactiver le pan/zoom plus tard : remettre TransformWrapper /
 * TransformComponent de react-zoom-pan-pinch ici (la lib reste installée).
 */
export function TcoViewport({ height = '80vh' }: Props) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height,
        background: '#1e272e',
        overflow: 'hidden',
        border: '1px solid #34495e',
      }}
    >
      <TcoCanvas />
      <ItemTooltip />
    </div>
  );
}
