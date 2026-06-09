// Écran principal mobile — pilote le VRAI simulateur.
//
// - Les leviers et leurs numéros proviennent de la gare réellement chargée
//   (store Zustand `player.data.levers`).
// - On manœuvre un levier en + (plus) ou − (minus) via `toggleLever` ; les
//   gardes d'enclenchement réelles s'appliquent (refus motivés journalisés).
// - Le résultat de la manœuvre est visible sur le TCO (le vrai `TcoViewport`
//   est piloté par le même store : aiguille à gauche/droite, signal ouvert/
//   fermé, etc.).
// - Sélectionner un levier zoome le TCO sur l'item correspondant.

import { useEffect, useMemo, useRef, useState } from 'react';
import { M } from './theme';
import { useGessieStore } from '../store/useGessieStore';
import { useClockTick } from '../sim/useClockTick';
import {
  classifyLever,
  computeSignalLeverCounts,
  filterLevers,
  leverEtat,
  leverLabel,
  resolveLeverFocus,
  sortLevers,
} from './leverModel';
import type { LeverFilter } from './leverModel';
import { LeverZone } from './LeverZone';
import type { LeverLayout } from './LeverZone';
import { DeepDock } from './DeepDock';
import type { FcControl } from './DeepDock';
import type { LeverPosition } from './controls';
import { DeepDetailSheet, DeepRefusSheet } from './sheets';
import type { AeControl } from './sheets';
import { TcoViewport } from '../components/tco/TcoViewport';
import type { Affectation } from '../sim/types';

type Sheet = 'detail' | 'refus' | null;

// Référence stable pour le cas « pas de données » (évite de casser la
// mémoïsation avec un objet littéral recréé à chaque render).
const EMPTY_AFF: Record<string, Affectation> = {};

export function MobileSim({ leverLayout = 'grid', onExit }: { leverLayout?: LeverLayout; onExit?: () => void }) {
  // Fait avancer l'horloge / les trains tant qu'on est en mode play.
  useClockTick();

  const data = useGessieStore((s) => s.player.data);
  const station = useGessieStore((s) => s.station);
  const toggleLever = useGessieStore((s) => s.toggleLever);
  const toggleAnnulElec = useGessieStore((s) => s.toggleAnnulElec);
  const toggleCommutFC = useGessieStore((s) => s.toggleCommutFC);
  const refusals = useGessieStore((s) => s.leverRefusals);
  const clearRefusals = useGessieStore((s) => s.clearLeverRefusals);
  const currentTime = useGessieStore((s) => s.clock.currentTime);
  const speed = useGessieStore((s) => s.clock.speed);
  const mode = useGessieStore((s) => s.player.mode);
  const setSpeed = useGessieStore((s) => s.setSpeed);

  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState<LeverFilter>('Tout');
  const [blink, setBlink] = useState<string[]>([]);
  const [sheet, setSheet] = useState<Sheet>(null);
  // Nonce de recentrage : incrémenté pour ré-afficher le TCO en entier.
  const [recenter, setRecenter] = useState(0);

  const affectations = data?.affectations ?? EMPTY_AFF;
  const levers = useMemo(() => (data ? sortLevers(Object.values(data.levers)) : []), [data]);
  const counts = useMemo(() => computeSignalLeverCounts(levers), [levers]);
  const filtered = useMemo(() => filterLevers(levers, filter, affectations), [levers, filter, affectations]);

  // Sélection effective (dérivée) : le levier choisi s'il existe encore dans la
  // gare courante, sinon aucune sélection → TCO en vue d'ensemble.
  const selId = sel && data?.levers[sel] ? sel : null;
  const cur = selId && data ? data.levers[selId] ?? null : null;
  const focus = useMemo(() => resolveLeverFocus(station, cur, affectations), [station, cur, affectations]);

  // Sélection / désélection d'un levier (re-tap = désélection → vue d'ensemble).
  const selectLever = (id: string) => setSel((prev) => (prev === id ? null : id));
  // Ré-afficher le TCO en entier (désélectionne + recentre même après un pan).
  const resetView = () => {
    setSel(null);
    setRecenter((n) => n + 1);
  };

  // Clignotement de refus (repère visuel temporaire).
  useEffect(() => {
    if (!blink.length) return;
    const id = setTimeout(() => setBlink([]), 2400);
    return () => clearTimeout(id);
  }, [blink]);

  // Manœuvre en + / − : passe par le vrai moteur d'enclenchement. Pas de
  // notification : en cas de refus silencieux (position inchangée après le
  // commit Zustand), on se contente de faire clignoter le levier — le motif
  // reste consultable via le compteur/journal « Refus ».
  const manoeuvre = (id: string, target: LeverPosition) => {
    const before = useGessieStore.getState().player.data?.levers[id]?.position;
    if (!before || before === target) return;
    toggleLever(id);
    setTimeout(() => {
      const after = useGessieStore.getState().player.data?.levers[id]?.position;
      if (after !== target) {
        setBlink([id]);
        setSel(id);
      }
    }, 0);
  };

  // Zone leviers : auto-scroll vers le levier sélectionné.
  const bandRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    const c = bandRef.current;
    const el = selId ? cardRefs.current[selId] : null;
    if (!c || !el) return;
    if (leverLayout === 'grid') c.scrollTo({ top: Math.max(0, el.offsetTop - c.offsetTop - 8), behavior: 'smooth' });
    else c.scrollTo({ left: el.offsetLeft - 16, behavior: 'smooth' });
  }, [selId, filter, leverLayout]);

  // Infos du levier sélectionné.
  const curLabel = cur ? leverLabel(cur, counts) : '';
  const curGroup: 'Signaux' | 'Aiguilles' = cur && classifyLever(cur, affectations) === 'aiguille' ? 'Aiguilles' : 'Signaux';
  const curEtat = cur ? leverEtat(cur, affectations) : '—';
  const fcAffId = cur ? cur.affectations.find((a) => affectations[a]?.positionFC !== undefined) : undefined;
  const fc: FcControl | null = fcAffId
    ? { on: affectations[fcAffId]?.positionFC === true, onToggle: () => toggleCommutFC(fcAffId) }
    : null;
  const ae: AeControl | null = cur?.annulateurElec
    ? { on: cur.annulateurElec.enabled, onToggle: () => toggleAnnulElec(cur.id) }
    : null;

  const running = mode === 'play' && speed > 0;
  const fmt = formatClock(currentTime);
  const stationName = station?.name ?? '—';

  return (
    <div style={{ width: '100vw', height: '100dvh', display: 'flex', justifyContent: 'center', background: '#000' }}>
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: M.bg,
          fontFamily: M.sans,
          color: M.text,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <DeepBar running={running} onToggleRun={() => setSpeed(running ? 0 : 1)} fmt={fmt} stationName={stationName} onExit={onExit} />

        {/* TCO réel (identique au bureau / tablette) : reflète les manœuvres.
            Glisser pour déplacer ; « Vue d'ensemble » pour tout réafficher. */}
        <div style={{ height: 222, flexShrink: 0, position: 'relative', borderBottom: `1px solid ${M.border}` }}>
          <TcoViewport height="100%" focus={focus} recenter={recenter} />
          <button
            onClick={resetView}
            style={{
              position: 'absolute',
              right: 10,
              bottom: 10,
              height: 30,
              padding: '0 12px',
              borderRadius: 9,
              border: `1px solid ${M.border}`,
              background: `${M.panel2}cc`,
              color: M.muted,
              fontSize: 11.5,
              fontFamily: M.mono,
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M2 5 V2 H5 M9 2 H12 V5 M12 9 V12 H9 M5 12 H2 V9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Vue d'ensemble
          </button>
        </div>

        {/* filtres */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px 6px' }}>
          {(['Tout', 'Signaux', 'Aiguilles'] as LeverFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                height: 28,
                padding: '0 13px',
                borderRadius: 14,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: filter === f ? 600 : 500,
                border: `1px solid ${filter === f ? M.accent : M.border}`,
                background: filter === f ? M.accentDim : M.panel,
                color: filter === f ? '#fff' : M.muted,
              }}
            >
              {f}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setSheet('refus')}
            style={{
              height: 28,
              padding: '0 11px',
              borderRadius: 14,
              cursor: 'pointer',
              fontSize: 11.5,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              border: `1px solid ${refusals.length ? M.red : M.border}`,
              background: M.panel,
              color: refusals.length ? M.red : M.muted,
            }}
          >
            Refus <span style={{ fontFamily: M.mono }}>{refusals.length}</span>
          </button>
        </div>

        {/* zone leviers — grille (défaut) ou bande */}
        <LeverZone
          layout={leverLayout}
          list={filtered}
          counts={counts}
          sel={selId}
          setSel={selectLever}
          blink={blink}
          bandRef={bandRef}
          cardRefs={cardRefs}
        />

        {/* dock de commande */}
        {cur ? (
          <DeepDock
            lever={cur}
            label={curLabel}
            group={curGroup}
            etat={curEtat}
            fc={fc}
            onManoeuvre={(t) => manoeuvre(cur.id, t)}
            onDetail={() => setSheet('detail')}
          />
        ) : (
          <div
            style={{
              flexShrink: 0,
              padding: '14px',
              background: M.panel,
              borderTop: `1px solid ${M.border}`,
              color: M.faint,
              fontSize: 12.5,
              textAlign: 'center',
            }}
          >
            {data ? 'Sélectionnez un levier.' : 'Chargement de la gare…'}
          </div>
        )}

        {/* feuilles + toast */}
        {sheet === 'detail' && cur && (
          <DeepDetailSheet
            lever={cur}
            label={curLabel}
            group={curGroup}
            affectations={affectations}
            ae={ae}
            fc={fc}
            onManoeuvre={(t) => manoeuvre(cur.id, t)}
            refusals={refusals.filter((r) => r.leverId === cur.id)}
            stationName={stationName}
            onClose={() => setSheet(null)}
          />
        )}
        {sheet === 'refus' && (
          <DeepRefusSheet
            refusals={refusals}
            onClose={() => setSheet(null)}
            onClear={clearRefusals}
            onPick={(id) => {
              setSel(id);
              setSheet(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

function formatClock(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '--:--:--';
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`;
}

/* ── barre d'app locale (retour accueil + nom gare + horloge + play/pause) ── */
function DeepBar({
  running,
  onToggleRun,
  fmt,
  stationName,
  onExit,
}: {
  running: boolean;
  onToggleRun: () => void;
  fmt: string;
  stationName: string;
  onExit?: () => void;
}) {
  return (
    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px 9px' }}>
      <button
        onClick={onExit}
        aria-label="Retour à l'accueil"
        title="Accueil"
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 1,
          fontWeight: 800,
          fontSize: 17,
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: onExit ? 'pointer' : 'default',
          fontFamily: 'inherit',
          color: M.text,
        }}
      >
        <span style={{ color: M.brand }}>gessie</span>
        <span>Web</span>
      </button>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 12,
          fontFamily: M.mono,
          background: M.panel,
          border: `1px solid ${M.border}`,
          borderRadius: 9,
          padding: '5px 10px',
          color: M.text,
          maxWidth: 150,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {stationName}
      </div>
      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 13, fontFamily: M.mono, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt}</span>
      <button
        onClick={onToggleRun}
        aria-label={running ? 'Mettre en pause' : 'Lancer'}
        style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          border: `1px solid ${M.border}`,
          background: M.panel,
          color: M.accent,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
      >
        {running ? (
          <svg width="11" height="11" viewBox="0 0 12 12">
            <rect x="2.5" y="2" width="2.5" height="8" fill="currentColor" />
            <rect x="7" y="2" width="2.5" height="8" fill="currentColor" />
          </svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 12 12">
            <path d="M3 2 L10 6 L3 10 Z" fill="currentColor" />
          </svg>
        )}
      </button>
    </div>
  );
}
