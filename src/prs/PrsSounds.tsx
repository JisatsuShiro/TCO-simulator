// Sons du PRS de Springfield — §11 de `docs/springfield-prs-spec.md`.
//
// L'original déclare cinq `<EMBED>` cachés dans `gaestro.html` et les pilote
// par `dsoXXX()` / `fsoXXX()`, tous conditionnés par le coupe-son global
// `rapelson` :
//
// | `<EMBED>` | Fichier | `LOOP` | Déclencheur |
// |---|---|---|---|
// | `musique`  | `sons/disco.mp3` | 1 | `dsodisco()` — voyant DI **clignotant** |
// | `musique2` | `sons/atr.mp3`   | 1 | `dsoatr()` — annulateur de transit actif |
// | `alertr`   | `sons/alert.mp3` | 1 | `dsoalert()` — alerte radio (scénario sn4) |
// | `deton`    | `sons/deto.mp3`  | 0 | `dsodeto()` — franchissement de carré fermé |
// | `dgong`    | `sons/Gong.mp3`  | 0 | `dsogong()` — annonce voie 2 |
//
// Les trois premiers sont des **boucles** dont l'état se déduit de l'état du
// poste ; les deux derniers sont des **coups** qu'un compteur d'état signale
// (`sfx.deto`, `sfx.gong`), l'état du moteur étant immuable.
//
// Note autoplay : comme `src/components/sim/AudioPlayers.tsx`, on dépend d'un
// geste utilisateur préalable pour que `play()` soit autorisé — garanti ici
// par le clic sur la tuile PRS puis sur un bouton du pupitre.

import { useEffect, useRef } from 'react';
import type { PrsState } from './engine';

const SRC = {
  disco: '/sounds/prs/disco.mp3',
  atr: '/sounds/prs/atr.mp3',
  alert: '/sounds/prs/alert.mp3',
  deto: '/sounds/prs/deto.mp3',
  gong: '/sounds/prs/gong.mp3',
} as const;

export function PrsSounds({ state }: { state: PrsState }) {
  const on = state.sound;
  return (
    <>
      {/* `dsodisco()` — la sonnerie de dérangement ne sonne que tant que le
          voyant DI clignote ; l'acquitter (A.Sn.Di, `di = 2`) la coupe. */}
      <Loop src={SRC.disco} active={on && state.di === 1} />
      {/* `dsoatr()` — tant qu'une annulation de transit est active. */}
      <Loop src={SRC.atr} active={on && state.atrAnnul.some(Boolean)} />
      {/* `dsoalert()` — sirène d'alerte radio, en boucle jusqu'à `fsoalert()`
          (scénario sn4 : levée par le régulateur). */}
      <Loop src={SRC.alert} active={on && state.alerteRadio} />
      <Shot src={SRC.deto} count={state.sfx.deto} enabled={on} />
      <Shot src={SRC.gong} count={state.sfx.gong} enabled={on} />
      {/* Même son, usage le plus fréquent dans l'original : le déraillement. */}
      <Shot src={SRC.alert} count={state.sfx.derail} enabled={on} />
    </>
  );
}

/** Son bouclé, joué tant que `active`. */
function Loop({ src, active }: { src: string; active: boolean }) {
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    if (active) {
      void audio.play().catch(() => {
        /* autoplay refusé tant qu'aucun geste utilisateur n'a eu lieu */
      });
    } else {
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
  }, [active]);

  return <audio ref={ref} src={src} loop preload="none" />;
}

/**
 * Son ponctuel, rejoué à chaque incrément de `count`. Le premier rendu ne
 * joue rien : on mémorise la valeur de départ.
 */
function Shot({ src, count, enabled }: { src: string; count: number; enabled: boolean }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const seen = useRef(count);

  useEffect(() => {
    if (count === seen.current) return;
    seen.current = count;
    const audio = ref.current;
    if (!audio || !enabled) return;
    try {
      audio.currentTime = 0;
    } catch {
      /* ignore */
    }
    void audio.play().catch(() => {
      /* autoplay refusé */
    });
  }, [count, enabled]);

  return <audio ref={ref} src={src} preload="auto" />;
}
