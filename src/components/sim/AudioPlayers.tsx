// Players audio "discordance" et "ATR".
//
// Reproduit les watchers Vue Gessie (renderer.js) :
//
//   discordance:
//     watch.discordances_count: 0 < count ? sound.play() : (sound.pause(), currentTime = 0);
//
//   ATR (annulateur de transit):
//     state = transitAnnulateurs.find(e => e.on)
//             ? 'on'
//             : transitAnnulateurs.find(e => e.autorisation)
//               ? 'blink'
//               : 'off';
//     watch.state: e === 'on' ? sound.play() : (sound.pause(), currentTime = 0);
//
// On lit les audio en boucle tant que la condition est vraie. Comme
// `PhonePlayer` (cf. note autoplay), on dépend d'un geste utilisateur
// préalable pour autoriser play() — ce qui est garanti par le clic sur
// "Simulation" / sur un levier au démarrage de la sim.

import { useEffect, useRef } from 'react';
import { useGessieStore } from '../../store/useGessieStore';

const DISCORDANCE_SRC = '/sounds/discordance.mp3';
const ATR_SRC = '/sounds/atr.mp3';

export function AudioPlayers() {
  return (
    <>
      <DiscordancePlayer />
      <AtrAudioPlayer />
    </>
  );
}

function DiscordancePlayer() {
  const active = useGessieStore(
    (s) => (s.player.data?.discordances_count ?? 0) > 0,
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (active) {
      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch((err) => {
          console.warn('[DiscordancePlayer] play() rejected:', err);
        });
      }
    } else {
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
  }, [active]);

  return <audio ref={audioRef} src={DISCORDANCE_SRC} loop preload="auto" />;
}

function AtrAudioPlayer() {
  // L'ATR est "actif" (sound on) dès qu'au moins un annulateur a `on === true`.
  // L'état `blink` du bundle (autorisation seule) ne joue pas le son — il
  // sert uniquement au clignotement de la lampe (déjà rendu côté AtrPanel).
  const active = useGessieStore((s) =>
    Boolean(s.player.data?.transitAnnulateurs.find((a) => a.on)),
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (active) {
      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch((err) => {
          console.warn('[AtrAudioPlayer] play() rejected:', err);
        });
      }
    } else {
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
  }, [active]);

  return <audio ref={audioRef} src={ATR_SRC} loop preload="auto" />;
}
