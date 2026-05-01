// Hook qui pose un setInterval(1000) et appelle store.tick() tant qu'on est
// en mode play. Le tick est no-op si speed === 0 (pause).
//
// À monter dans le composant racine de la zone "play" (TcoViewport / App).

import { useEffect } from 'react';
import { useGessieStore } from '../store/useGessieStore';

export function useClockTick(): void {
  const mode = useGessieStore((s) => s.player.mode);
  const tick = useGessieStore((s) => s.tick);

  useEffect(() => {
    if (mode !== 'play') return;
    const id = window.setInterval(() => tick(), 1000);
    return () => window.clearInterval(id);
  }, [mode, tick]);
}
