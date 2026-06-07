// Player audio "téléphone" — sonnerie + panneau d'action quand un train arrive
// devant un contrôle non-ouvert.
//
// Reproduction du composant Vue Gessie (renderer.js) + intégration des
// actions `trainCanStart` / `forceTrainStart` qui apparaissent dans le bundle
// comme boutons par-train accessibles pendant la sonnerie :
//
//   computed: { phoneIsRinging() { return this.$store.state.Player.phoneIsRinging } }
//   watch:    { phoneIsRinging() { this.phoneIsRinging ? sound.play() : sound.pause() } }
//   methods:  { stopPhone() { sound.pause(); dispatch("stopPhone") } }
//
//   click: () => $store.dispatch("trainCanStart",  { trainId })   // ré-évalue
//   click: () => $store.dispatch("forceTrainStart", { trainId })   // bypass
//
// La sonnerie est allumée par `setPhoneRingingMutation(true)` dans
// `sim/train.ts:moveTrainIn` quand un train rencontre un `controle` dont la
// position n'est pas 'O' (et pas en `forcePassage`).
//
// Note autoplay browser : modern Chrome/Firefox bloquent `audio.play()` tant
// qu'aucun geste utilisateur n'a eu lieu sur la page. Comme la sim démarre
// suite à un clic (mode Simulation, lancer un train, etc.), on est hors de
// cette restriction. En cas d'échec on log et on no-op silencieusement.

import { useEffect, useMemo, useRef } from 'react';
import { useGessieStore } from '../../store/useGessieStore';
import { colors, motion, radii, shadows, spacing, typography } from '../../design/tokens';

const TELEPHONE_SRC = '/sounds/telephone.mp3';

interface ArrestedTrain {
  trainId: string;
  target: string;
}

export function PhonePlayer() {
  const phoneIsRinging = useGessieStore(
    (s) => s.player.data?.phoneIsRinging ?? false,
  );
  const stopPhone = useGessieStore((s) => s.stopPhone);
  const trainCanStart = useGessieStore((s) => s.trainCanStart);
  const forceTrainStart = useGessieStore((s) => s.forceTrainStart);

  // Sélecteur scalaire CSV → liste des trains arrêtés (paused moveTrainIn
  // avec remainingTime === 0). On filtre uniquement ceux qui FONT sonner le
  // téléphone, càd contre un contrôle. Format CSV : "trainId|target".
  const arrestedCsv = useGessieStore((s) => {
    if (!s.player.data) return '';
    const rows: string[] = [];
    const seen = new Set<string>();
    for (const ev of s.clock.pausedEvents) {
      if (ev.type !== 'moveTrainIn') continue;
      if ((ev.remainingTime ?? 0) !== 0) continue;
      const name = ev.train?.name;
      const target = ev.target;
      if (!name || !target || seen.has(name)) continue;
      // On ne garde que les arrêts devant un contrôle (= ce qui fait sonner).
      const aff = s.player.data?.affectations[target];
      if (aff?.type !== 'controle') continue;
      seen.add(name);
      rows.push(`${name}|${target}`);
    }
    return rows.sort().join('\n');
  });
  const arrested: ArrestedTrain[] = useMemo(() => {
    if (arrestedCsv === '') return [];
    return arrestedCsv.split('\n').map((row) => {
      const [trainId, target] = row.split('|');
      return { trainId, target };
    });
  }, [arrestedCsv]);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (phoneIsRinging) {
      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch((err) => {
          console.warn('[PhonePlayer] play() rejected:', err);
        });
      }
    } else {
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        /* certains UA jettent si readyState insuffisant — ignoré */
      }
    }
  }, [phoneIsRinging]);

  // Le panneau reste visible tant qu'il y a au moins un train arrêté, même
  // après "Raccrocher". Sinon l'opérateur perdrait l'accès aux actions
  // Réessayer / Faire passer tant que le train n'a pas franchi le signal.
  // Seuls la sonnerie audio, le pulse rouge et le bouton "Raccrocher" sont
  // gated par `phoneIsRinging`.
  const visible = phoneIsRinging || arrested.length > 0;

  return (
    <>
      {/* L'élément audio reste monté en permanence ; seul l'état joué/pause
          change. `loop` garde la sonnerie continue tant que l'opérateur n'a
          pas raccroché. */}
      <audio ref={audioRef} src={TELEPHONE_SRC} loop preload="auto" />
      {visible && (
        <div
          role="region"
          aria-label={
            phoneIsRinging
              ? 'Téléphone en sonnerie'
              : 'Trains arrêtés devant signal fermé'
          }
          style={{
            position: 'fixed',
            right: spacing.lg,
            bottom: spacing.lg,
            display: 'flex',
            flexDirection: 'column',
            gap: spacing.xs,
            background: colors.surface.dark,
            border: `1px solid ${phoneIsRinging ? colors.accent.danger : colors.border.default}`,
            borderRadius: radii.md,
            boxShadow: phoneIsRinging
              ? `${shadows.md}, 0 0 16px rgba(220, 38, 38, 0.45)`
              : shadows.md,
            padding: spacing.sm,
            minWidth: 280,
            maxWidth: 360,
            fontFamily: typography.ui.family,
            zIndex: 1000,
            animation: phoneIsRinging
              ? `gessieRingPulse 0.9s ${motion.easing.easeInOut} infinite`
              : undefined,
          }}
        >
          {/* Ligne 1 : raccrocher (action principale du widget) — seulement
              quand le téléphone sonne. Une fois raccroché, le bouton disparaît
              mais le panneau reste pour conserver les actions par train. */}
          {phoneIsRinging && (
            <button
              type="button"
              onClick={stopPhone}
              aria-label="Raccrocher le téléphone"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing.sm,
                padding: `${spacing.sm}px ${spacing.md}px`,
                background: colors.accent.danger,
                color: colors.text.primary,
                fontSize: typography.size.sm,
                fontWeight: typography.weight.semibold,
                border: `1px solid #7A1414`,
                borderRadius: radii.md,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 16 }}>
                ☎
              </span>
              Raccrocher
            </button>
          )}

          {/* Ligne 2+ : un bloc par train arrêté devant un contrôle fermé.
              Reste visible tant qu'aucune action (Réessayer succès / Faire
              passer) n'a fait redémarrer le train. */}
          {arrested.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: spacing.xs,
                paddingTop: phoneIsRinging ? spacing.xs : 0,
                borderTop: phoneIsRinging
                  ? `1px solid ${colors.border.subtle}`
                  : 'none',
              }}
            >
              <div
                style={{
                  fontSize: typography.size.xs,
                  fontFamily: typography.mono.family,
                  color: colors.text.muted,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                }}
              >
                Trains arrêtés
              </div>
              {arrested.map((t) => (
                <ArrestedTrainRow
                  key={t.trainId}
                  trainId={t.trainId}
                  target={t.target}
                  onCanStart={trainCanStart}
                  onForceStart={forceTrainStart}
                />
              ))}
            </div>
          )}
        </div>
      )}
      {/* Keyframes de pulsation pour signifier la sonnerie active. Posé en
          inline-style global via une <style> ; React 19 dédoublonne. */}
      <style>{`@keyframes gessieRingPulse {
        0%, 100% { box-shadow: 0 4px 12px rgba(0,0,0,0.3), 0 0 16px rgba(220, 38, 38, 0.45); }
        50% { box-shadow: 0 4px 12px rgba(0,0,0,0.3), 0 0 24px rgba(220, 38, 38, 0.75); }
      }`}</style>
    </>
  );
}

function ArrestedTrainRow({
  trainId,
  target,
  onCanStart,
  onForceStart,
}: {
  trainId: string;
  target: string;
  onCanStart: (trainId: string) => void;
  onForceStart: (trainId: string) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xs,
        padding: `${spacing.xxs}px 0`,
      }}
    >
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontFamily: typography.mono.family,
          fontSize: typography.size.xs,
          color: colors.text.primary,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={`Train ${trainId} arrêté devant ${target}`}
      >
        <strong>{trainId}</strong>
        <span style={{ color: colors.text.muted }}> → {target}</span>
      </span>
      <button
        type="button"
        onClick={() => onCanStart(trainId)}
        title="Ré-évalue la garde signal. Si le signal a été ouvert, le train repart."
        style={{
          padding: `${spacing.xxs}px ${spacing.xs}px`,
          background: 'transparent',
          color: colors.text.primary,
          border: `1px solid ${colors.border.default}`,
          borderRadius: radii.sm,
          fontSize: typography.size.xs,
          fontFamily: 'inherit',
          cursor: 'pointer',
        }}
      >
        Réessayer
      </button>
      <button
        type="button"
        onClick={() => onForceStart(trainId)}
        title="Force le passage du signal fermé (faute professionnelle simulée)."
        style={{
          padding: `${spacing.xxs}px ${spacing.xs}px`,
          background: colors.accent.warning,
          color: colors.surface.darkest,
          border: `1px solid ${colors.accent.warning}`,
          borderRadius: radii.sm,
          fontSize: typography.size.xs,
          fontWeight: typography.weight.semibold,
          fontFamily: 'inherit',
          cursor: 'pointer',
        }}
      >
        Faire passer
      </button>
    </div>
  );
}
