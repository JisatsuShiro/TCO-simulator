// Le thème clair/sombre : lecture, bascule, mémorisation.
//
// La valeur vit sur `<html data-theme>`, posée avant le premier rendu par le
// script en ligne d'`index.html`. Ce module ne fait que la relire et l'écrire ;
// c'est la feuille `theme.css` qui en tire les couleurs, et les composants n'y
// touchent jamais — ils lisent leurs jetons habituels, devenus des `var(--…)`.
//
// Trois états sont possibles côté utilisateur : « clair », « sombre », et
// **rien**, qui veut dire « comme le système ». Le troisième n'est pas stocké :
// son absence *est* le réglage. On peut donc y revenir en effaçant la clé, et
// un poste qui change de préférence système suit sans qu'on ait à le lui dire.

import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

/** Clé de stockage. Absente = suivre le système. */
const CLE = 'voie-libre.theme';

const estTheme = (v: unknown): v is Theme => v === 'light' || v === 'dark';

/** Ce que le système demande, quand l'utilisateur n'a rien choisi. */
function themeDuSysteme(): Theme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function lireChoix(): Theme | null {
  try {
    const v = localStorage.getItem(CLE);
    return estTheme(v) ? v : null;
  } catch {
    // Navigation privée, stockage refusé : on suivra le système.
    return null;
  }
}

/** Applique le thème au document — c'est le seul point qui écrit l'attribut. */
function poser(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export interface UseTheme {
  /** Le thème effectivement appliqué. */
  theme: Theme;
  /** L'utilisateur a-t-il choisi, ou suit-on le système ? */
  suitLeSysteme: boolean;
  /** Bascule d'un thème à l'autre, et mémorise le choix. */
  basculer: () => void;
  /** Oublie le choix et repasse sous la conduite du système. */
  suivreLeSysteme: () => void;
}

export function useTheme(): UseTheme {
  // L'attribut fait foi : le script d'`index.html` l'a déjà résolu, et le lire
  // évite que le premier rendu contredise ce qui est affiché.
  const [theme, setTheme] = useState<Theme>(() => {
    const pose = document.documentElement.dataset.theme;
    return estTheme(pose) ? pose : themeDuSysteme();
  });
  const [suitLeSysteme, setSuitLeSysteme] = useState(() => lireChoix() === null);

  // Tant qu'aucun choix n'est fait, on suit le système en direct : changer la
  // préférence du poste change le thème sans recharger.
  useEffect(() => {
    if (!suitLeSysteme) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const suivre = () => {
      const t = themeDuSysteme();
      poser(t);
      setTheme(t);
    };
    suivre();
    mq.addEventListener('change', suivre);
    return () => mq.removeEventListener('change', suivre);
  }, [suitLeSysteme]);

  const basculer = useCallback(() => {
    setTheme((courant) => {
      const suivant: Theme = courant === 'dark' ? 'light' : 'dark';
      poser(suivant);
      try {
        localStorage.setItem(CLE, suivant);
      } catch {
        // Le choix ne survivra pas au rechargement, mais il s'applique.
      }
      setSuitLeSysteme(false);
      return suivant;
    });
  }, []);

  const suivreLeSysteme = useCallback(() => {
    try {
      localStorage.removeItem(CLE);
    } catch {
      // Rien à oublier.
    }
    setSuitLeSysteme(true);
  }, []);

  return { theme, suitLeSysteme, basculer, suivreLeSysteme };
}
