// Indicateur ATR global au-dessus du TCO.
//
// Reproduction du composant Vue `atr-light` (bundle Gessie) :
//
//   props: []                               // pas de props — lit le store
//   data:  { lightIsOn:false, interval:undefined, sound:atr.mp3 }
//   computed:
//     transitAnnulateurs() => Player.transitAnnulateurs
//     state() =>
//       any(a.on)            ? "on"
//       : any(a.autorisation) ? "blink"
//       : "off"
//   watch state(s):
//     "on"    → lightIsOn=true,  play sound (loop)
//     "blink" → setInterval 1s qui toggle lightIsOn
//     "off"   → clear interval, lightIsOn=false, stop sound
//   click  → stopSound (acknowledge)
//
//   template:
//     <div v-if="transitAnnulateurs" class="light" :class="{on}" @click="stopSound">
//       <audio loop ref="sound" :src="sound"/>
//     </div>
//
// Mounted in <SplitArea id="zoneTco"> :
//   <div v-if="ATrLightNeeded" class="top">ATr <atr-light/></div>
//   <tco-room/>
//
// Côté Web : on garde le même placement (bandeau au-dessus du `TcoViewport`),
// avec le texte "ATr" + une LED ronde, conditionné à la présence d'au moins
// un ATR dans la station.

import { useEffect, useRef, useState } from 'react';
import { useGessieStore } from '../../store/useGessieStore';
import { colors, radii, spacing, typography } from '../../design/tokens';

type AtrLightState = 'on' | 'blink' | 'off';

export function TcoAtrLight() {
  const hasAny = useGessieStore(
    (s) => (s.player.data?.transitAnnulateurs.length ?? 0) > 0,
  );
  const anyOn = useGessieStore(
    (s) => s.player.data?.transitAnnulateurs.some((a) => a.on) ?? false,
  );
  const anyAutorisation = useGessieStore(
    (s) =>
      s.player.data?.transitAnnulateurs.some((a) => a.autorisation) ?? false,
  );

  const state: AtrLightState = anyOn ? 'on' : anyAutorisation ? 'blink' : 'off';

  // Phase du clignotement, pilotée par un setInterval comme dans le bundle
  // Gessie (cadence 1000 ms). Seule cette phase est en state — les modes
  // `on` et `off` sont dérivés directement de `state` au render.
  const [blinkPhase, setBlinkPhase] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const acknowledgedRef = useRef(false);

  useEffect(() => {
    if (state !== 'blink') return;
    const id = window.setInterval(() => setBlinkPhase((v) => !v), 1000);
    return () => window.clearInterval(id);
  }, [state]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (state === 'on' && !acknowledgedRef.current) {
      // play() peut rejeter si l'utilisateur n'a pas encore interagi avec
      // la page (autoplay policy). On ignore silencieusement.
      audio.play().catch(() => undefined);
      return;
    }
    audio.pause();
    audio.currentTime = 0;
    if (state === 'off') acknowledgedRef.current = false;
  }, [state]);

  const lightIsOn =
    state === 'on' ? true : state === 'blink' ? blinkPhase : false;

  if (!hasAny) return null;

  const handleClick = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    acknowledgedRef.current = true;
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xs,
        padding: `${spacing.xxs}px ${spacing.sm}px`,
        background: colors.surface.dark,
        border: `1px solid ${colors.border.subtle}`,
        borderRadius: radii.sm,
        fontFamily: typography.mono.family,
        fontSize: typography.size.sm,
        color: colors.text.secondary,
        letterSpacing: 0.5,
        userSelect: 'none',
        width: 'fit-content',
      }}
    >
      <span style={{ fontWeight: typography.weight.semibold }}>ATr</span>
      <button
        type="button"
        onClick={handleClick}
        aria-label={`LED ATR globale, état ${state}`}
        title={
          state === 'on'
            ? 'ATR actif — clic pour acquitter le son'
            : state === 'blink'
              ? 'Autorisation ATR donnée'
              : 'ATR au repos'
        }
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          border: `1px solid ${colors.border.default}`,
          background: lightIsOn ? colors.signal.rouge : '#1a0808',
          boxShadow: lightIsOn
            ? `0 0 8px ${colors.signal.rouge}aa, inset 0 1px 1px rgba(255,255,255,0.25)`
            : 'inset 0 1px 1px rgba(0,0,0,0.6)',
          cursor: state === 'on' ? 'pointer' : 'default',
          padding: 0,
          transition: 'background 120ms, box-shadow 120ms',
        }}
      />
      <audio ref={audioRef} src="/sounds/atr.mp3" loop preload="auto" />
    </div>
  );
}
