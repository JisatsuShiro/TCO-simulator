// Poignée de redimensionnement vertical — barre fine entre deux zones,
// drag à la souris pour changer la hauteur de la zone supérieure.
//
// Utilise les Pointer Events (compatibles souris + tactile) avec
// `setPointerCapture` pour que le drag continue même si le curseur sort
// du handle pendant le mouvement.

import { useRef, useState } from 'react';
import { colors, spacing } from '../tokens';

interface Props {
  /** Appelé pendant le drag avec le delta vertical (px) depuis pointerdown. */
  onResize: (deltaY: number) => void;
  /** Optionnel : appelé en fin de drag pour persister la hauteur finale. */
  onResizeEnd?: () => void;
  /** Hauteur du handle (px). Défaut 8. */
  height?: number;
}

export function ResizeHandle({ onResize, onResizeEnd, height = 8 }: Props) {
  const [hover, setHover] = useState(false);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    startY.current = e.clientY;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    onResize(e.clientY - startY.current);
    startY.current = e.clientY;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    onResizeEnd?.();
  };

  const active = hover || dragging;

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Redimensionner le TCO"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        height,
        cursor: 'row-resize',
        background: active ? colors.accent.primary : colors.surface.medium,
        borderTop: `1px solid ${colors.border.subtle}`,
        borderBottom: `1px solid ${colors.border.subtle}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xxs,
        transition: 'background 120ms ease',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      {/* Trois petits points pour signaler la poignée */}
      <Dot active={active} />
      <Dot active={active} />
      <Dot active={active} />
    </div>
  );
}

function Dot({ active }: { active: boolean }) {
  return (
    <span
      style={{
        width: 3,
        height: 3,
        borderRadius: '50%',
        background: active ? '#FFFFFF' : colors.text.muted,
        transition: 'background 120ms ease',
      }}
    />
  );
}
