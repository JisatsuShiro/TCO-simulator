import { useEffect, useState } from 'react';
import { useGessieStore } from '../../store/useGessieStore';

/**
 * Tooltip suivi de souris : affiche le JSON brut de l'item survolé.
 *
 * Stratégie : un overlay HTML positionné en `position: fixed` avec
 * coordonnées clientX/clientY (mises à jour par mousemove sur window).
 * Pas besoin de connaître la position du SVG : on suit directement la souris.
 */
export function ItemTooltip() {
  const hoveredUid = useGessieStore((s) => s.hoveredUid);
  const station = useGessieStore((s) => s.station);

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!hoveredUid) {
      setPos(null);
      return;
    }
    const onMove = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [hoveredUid]);

  if (!hoveredUid || !station || !pos) return null;
  const item = station.items.find((i) => i.uid === hoveredUid);
  if (!item) return null;

  // Décalage pour ne pas que le tooltip soit sous le curseur
  const left = pos.x + 14;
  const top = pos.y + 14;

  return (
    <pre
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 1000,
        margin: 0,
        padding: '8px 10px',
        background: 'rgba(15, 22, 30, 0.95)',
        color: '#ecf0f1',
        border: '1px solid #4a5d70',
        borderRadius: 4,
        fontSize: 11,
        fontFamily: '"SF Mono", Consolas, monospace',
        lineHeight: 1.4,
        maxWidth: 480,
        maxHeight: 360,
        overflow: 'auto',
        pointerEvents: 'none',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
      }}
    >
      {JSON.stringify(item, null, 2)}
    </pre>
  );
}
