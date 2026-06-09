import { useEffect, useState } from 'react';

// Largeur en deçà de laquelle on bascule sur la vue mobile. 768px = limite
// usuelle tablette/portrait ; le TCO bureau (panels côte-à-côte) cesse d'être
// confortable bien avant.
const MOBILE_QUERY = '(max-width: 768px)';

/** `true` quand le viewport correspond au format mobile. Réagit aux
 *  redimensionnements / rotations via `matchMedia`. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY).matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
