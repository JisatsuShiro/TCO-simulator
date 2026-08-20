// Écran « PRS de Springfield ».
//
// Mise en page reprise de la maquette Claude Design « PRS TCO — Voie Libre » :
// bandeau (logo, poste, horloge), TCO, rangée pupitre, barre d'actions.
// La logique d'enclenchement vit dans `./engine` et n'est pas touchée par
// l'habillage — cf. `docs/springfield-prs-spec.md`.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PrsTco } from './PrsTco';
import { PrsPupitre } from './PrsPupitre';
import { PrsDerangements } from './PrsDerangements';
import { PrsSounds } from './PrsSounds';
import { PrsImprimes } from './PrsImprimes';
import type { ImprimeVue } from './PrsImprimes';
import { PrsFiche } from './PrsFiche';
import { PrsTerrain } from './PrsTerrain';
import type { TerrainState } from './PrsTerrain';
import { PrsDispositifMenu } from './PrsDispositifMenu';
import type { DispositifMenuState } from './PrsDispositifMenu';
import { PrsAppels } from './PrsAppels';
import { PrsFaultMenu } from './PrsFaultMenu';
import type { FaultMenuState } from './PrsFaultMenu';
import { Panel } from './ui';
import { actionButton, selectStyle } from './styles';
import { prs, prsFont } from './theme';
import {
  acknowledgeDi,
  pressS81,
  annulAtr,
  applyZoneFaultNow,
  armAtr,
  changeDispositif,
  createInitialState,
  pressRoute,
  resetFaults,
  restoreAtr,
  setAigFault,
  setDispositifMode,
  setGeneration,
  setRouteFault,
  setSignalFault,
  setTestZones,
  setZoneFault,
  throwLever,
  toggleKey,
  tick,
  toggleCarreClose,
  toggleMainMoteur,
  toggleTestAig,
  acquitterMessage,
  annoncerCirculation,
  toggleTraffic,
  scenarioSeconds,
  startScenario,
  stopScenario,
  toggleSound,
  sendOrdre,
  cancelOrdre,
  sendCba,
  cancelCba,
  clearFaultOn,
  faultOptionsFor,
  hasFaultOn,
} from './engine';
import type { PrsState } from './engine';
import { trainStatus } from './traffic';
import { SCENARIOS, formatSimClock } from './scenarios';
import type { AigId } from './topology';

/** Cadence du rafraîchissement des temporisations (D.M.T., purge ATR). */
const TICK_MS = 250;

/**
 * Cadences de l'horloge du poste.
 *
 * L'original n'en a pas : `speed()` incrémente une variable `tspeed` que rien
 * ne relit jamais. L'accélération est donc un ajout du portage — un scénario
 * dure une heure simulée, et l'on ne veut pas toujours l'attendre en temps
 * réel. ×5 permet de traverser une fenêtre travaux ou d'atteindre une phase
 * lointaine ; au-delà, les temporisations du trafic deviennent trop courtes
 * pour qu'on voie ce qui se passe.
 */
const CADENCES = [1, 2, 5] as const;
export type Cadence = (typeof CADENCES)[number];

export interface PrsPageProps {
  /** Retour à l'accueil, déclenché par le logo du bandeau. */
  onExit: () => void;
}

export function PrsPage({ onExit }: PrsPageProps) {
  const [state, setState] = useState<PrsState>(createInitialState);
  const [selectedAig, setSelectedAig] = useState<AigId | null>(null);
  const [showDerangements, setShowDerangements] = useState(false);
  /**
   * Fenêtre des imprimés : `null` fermée, `'choix'` sur la liste,
   * `'cba'` / `'ordre'` sur l'imprimé lui-même.
   */
  const [imprime, setImprime] = useState<ImprimeVue | null>(null);
  // Fiche de situation de travail du scénario en cours (`ftst()`).
  const [fiche, setFiche] = useState(false);
  // Menu contextuel des dispositifs, ouvert au clic droit sur un itinéraire.
  const [dispoMenu, setDispoMenu] = useState<DispositifMenuState | null>(null);
  // Manœuvre au terrain, ouverte au clic sur une aiguille du TCO.
  const [terrain, setTerrain] = useState<TerrainState | null>(null);
  const [faultMenu, setFaultMenu] = useState<FaultMenuState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<Cadence>(1);

  // Le poste tourne sur une horloge **virtuelle**, qui avance à `rate` fois le
  // temps réel — 0 en pause, sinon l'une des cadences. Toutes les échéances mémorisées
  // dans l'état (D.M.T., purge de l'ATR 1, trafic, scénario) sont des dates
  // prises sur cette horloge : changer de cadence n'en périme aucune, il
  // suffit de recaler l'origine avant d'appliquer la nouvelle.
  // L'origine est figée au montage : `useRef` évalue son argument à chaque
  // rendu, un `Date.now()` y serait un appel impur.
  const [clockOrigin] = useState(() => Date.now());
  const baseRef = useRef({ real: clockOrigin, sim: clockOrigin });
  const rateRef = useRef(1);
  /**
   * Cadence courante, hors pause.
   *
   * Doublée en référence : deux clics dans la même frame liraient sinon la
   * même valeur d'état et sauteraient un cran.
   */
  const speedRef = useRef<Cadence>(1);
  const simNow = useCallback(
    () => baseRef.current.sim + (Date.now() - baseRef.current.real) * rateRef.current,
    [],
  );

  /** Recale l'origine sur l'instant courant, puis applique la cadence. */
  const setRate = useCallback(
    (rate: number) => {
      baseRef.current = { sim: simNow(), real: Date.now() };
      rateRef.current = rate;
    },
    [simNow],
  );

  const togglePause = useCallback(() => {
    const next = !paused;
    setRate(next ? 0 : speedRef.current);
    setPaused(next);
  }, [paused, setRate]);

  /** Le bouton fait défiler les cadences : ×1, ×2, ×5, puis retour. */
  const toggleSpeed = useCallback(() => {
    const next = CADENCES[(CADENCES.indexOf(speedRef.current) + 1) % CADENCES.length];
    speedRef.current = next;
    // En pause, la cadence reste nulle : elle prendra effet à la reprise.
    if (!paused) setRate(next);
    setSpeed(next);
  }, [paused, setRate]);

  // Horloge : fait avancer les temporisations (D.M.T., purge de l'ATR 1,
  // autorisation d'accès) et rafraîchit les décomptes affichés.
  // `tick` renvoie la **même référence** quand rien n'a expiré : React
  // court-circuite alors le rendu.
  useEffect(() => {
    if (paused) return;
    const h = window.setInterval(() => {
      const t = simNow();
      setNow(t);
      setState((s) => tick(s, t));
    }, TICK_MS);
    return () => window.clearInterval(h);
  }, [paused, simNow]);

  const act = useCallback((fn: (s: PrsState) => PrsState) => setState((s) => fn(s)), []);

  const handleReset = useCallback(() => {
    setState(createInitialState());
    setSelectedAig(null);
    setImprime(null);
    setFaultMenu(null);
  }, []);

  /**
   * Séquence physique d'un annulateur.
   *
   * L'annulateur **direct** annule d'un seul geste — `atri()` fait
   * `batr1 = 1; bannul1 = 1; dtri();` : soulever le coupon suffit. Les deux
   * **indirects** ne font qu'autoriser l'annulation (`atrz()`, `atre()` :
   * « Cliquez pour autoriser l'annulation du transit ») ; c'est la plaque de
   * transit qui la confirme, au terrain. Dans les deux cas, un dernier clic
   * replace le coupon.
   */
  const cycleAtr = useCallback(
    (n: 1 | 2 | 3) =>
      setState((s) => {
        if (s.atrAnnul[n - 1]) return restoreAtr(s, n);
        if (s.atrArmed[n - 1]) return s; // la plaque a la main
        const arme = armAtr(s, n);
        return n === 1 && arme.atrArmed[0] ? annulAtr(arme, n, simNow()) : arme;
      }),
    [simNow],
  );

  const summary = useMemo(() => buildSummary(state), [state]);
  const simSec = scenarioSeconds(state, now);
  const clock = useMemo(
    () => (simSec != null ? formatSimClock(simSec) : formatClock(now)),
    [simSec, now],
  );
  const today = useMemo(() => formatDate(now), [now]);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        background: prs.bg,
        fontFamily: prsFont.ui,
        color: prs.text,
      }}
    >
      <style>{`@keyframes prs-blink { 50% { opacity: 0.35; } }`}</style>

      <PrsSounds state={state} />

      <TopBar
        onExit={onExit}
        traffic={state.traffic}
        onToggleTraffic={() => act((s) => toggleTraffic(s, simNow()))}
        scenario={state.scenario?.id ?? ''}
        onSelectScenario={(id) => {
          setState((s) => (id ? startScenario(id, simNow()) : stopScenario(s)));
          // Changer de scénario referme la fiche du précédent.
          setFiche(false);
        }}
        fiche={fiche}
        onToggleFiche={() => setFiche((v) => !v)}
        clock={clock}
        date={today}
        paused={paused}
        onTogglePause={togglePause}
        speed={speed}
        onToggleSpeed={toggleSpeed}
        sound={state.sound}
        onToggleSound={() => act(toggleSound)}
      />

      <div
        style={{
          maxWidth: 1600,
          margin: '0 auto',
          padding: '18px 22px 40px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <PrsTco
          state={state}
          onSelectAig={(id, at) => {
            // Le clic désigne toujours l'aiguille — c'est ce que lit le menu
            // des dérangements. Sous la clé, il ouvre en plus la manœuvre au
            // terrain, à l'endroit cliqué.
            setSelectedAig(id);
            setTerrain({ aig: id, x: at.x, y: at.y });
          }}
          selectedAig={selectedAig}
          onContextFault={(target, at) => setFaultMenu({ target, x: at.x, y: at.y })}
        />

        <PrsPupitre
          state={state}
          now={now}
          dispositifMode={state.dispMode}
          selectedAig={selectedAig}
          keyTaken={state.clemm}
          onPressRoute={(id) => act((s) => pressRoute(s, id, simNow()))}
          onChangeDispositif={(id, kind, delta) => act((s) => changeDispositif(s, id, kind, delta))}
          onSetDispositifMode={(m) => act((x) => setDispositifMode(x, m))}
          onToggleCarre={(sig) => act((s) => toggleCarreClose(s, sig))}
          onToggleTestAig={() => act(toggleTestAig)}
          onTestZones={(on) => act((s) => setTestZones(s, on))}
          onAckDi={() => act(acknowledgeDi)}
          onPressS81={() => act(pressS81)}
          onCycleAtr={cycleAtr}
          onAnnulAtr={(n) => act((s) => annulAtr(s, n, simNow()))}
          onSelectAig={setSelectedAig}
          onToggleMainMoteur={(id) => act((s) => toggleMainMoteur(s, id))}
          onThrowLever={(id) => act((s) => throwLever(s, id))}
          onToggleKey={() => act(toggleKey)}
          onSetState={setState}
          onAnnoncer={(cell, num) => act((s) => annoncerCirculation(s, cell, num, simNow()))}
          onRouteMenu={(id, x, y) => setDispoMenu({ route: id, x, y })}
          imprime={imprime}
          onSelectImprime={(id) => setImprime(id as ImprimeVue | null)}
        />

        {/* `quXX()` : cliquer une aiguille du TCO ne descend au sol que sous
            la clé Main-Moteur. Sans elle, le clic ne fait que désigner
            l'aiguille — pour le menu des dérangements. */}
        {terrain && state.clemm && (
          <PrsTerrain
            menu={terrain}
            state={state}
            onToggleMainMoteur={(id) => act((s) => toggleMainMoteur(s, id))}
            onThrowLever={(id) => act((s) => throwLever(s, id))}
            onClose={() => setTerrain(null)}
          />
        )}

        {dispoMenu && (
          <PrsDispositifMenu
            menu={dispoMenu}
            state={state}
            onChange={(id, kind, delta) => act((s) => changeDispositif(s, id, kind, delta))}
            onClose={() => setDispoMenu(null)}
          />
        )}

        {fiche && state.scenario && (
          <PrsFiche id={state.scenario.id} onClose={() => setFiche(false)} />
        )}

        <ActionBar
          summary={summary}
          showDerangements={showDerangements}
          onToggleDerangements={() => setShowDerangements((v) => !v)}
          imprime={imprime}
          onOpenImprimes={() => setImprime('choix')}
          generation={state.genPrs}
          onSetGeneration={(g) => act((s) => setGeneration(s, g))}
          onReset={handleReset}
        />

        {imprime && (
          <PrsImprimes
            state={state}
            vue={imprime}
            onVue={(v) => {
              // `fbull()` remet l'imprimé à blanc avant de le présenter : un
              // bulletin resté en attente est annulé, on repart d'une feuille
              // vierge.
              if (v === 'cba') act(cancelCba);
              if (v === 'ordre') act(cancelOrdre);
              setImprime(v);
            }}
            onSendCba={(draft) => act((s) => sendCba(s, draft))}
            onCancelCba={() => act(cancelCba)}
            onSendOrdre={(draft) => act((s) => sendOrdre(s, draft))}
            onCancelOrdre={() => act(cancelOrdre)}
            onClose={() => setImprime(null)}
          />
        )}

        {showDerangements && (
          <PrsDerangements
            state={state}
            onSetZoneFault={(k) => act((s) => setZoneFault(s, k))}
            onApplyZoneNow={() => act(applyZoneFaultNow)}
            onSetAigFault={(f) => act((s) => setAigFault(s, f))}
            onSetSignalFault={(f) => act((s) => setSignalFault(s, f))}
            onSetRouteFault={(f) => act((s) => setRouteFault(s, f))}
            onReset={() => act(resetFaults)}
          />
        )}

        {AFFICHER_JOURNAL && <Journal state={state} />}
      </div>

      {/* Appels des conducteurs et accidents de circulation. C'est l'`alert()`
          de l'original, sans le blocage : hors du flux, en bas à droite, tant
          qu'on ne les a pas pris. */}
      <PrsAppels
        messages={state.messages}
        onAcquitter={(seq) => act((s) => acquitterMessage(s, seq))}
      />

      {faultMenu && (
        <PrsFaultMenu
          menu={faultMenu}
          options={faultOptionsFor(state, faultMenu.target)}
          hasFault={hasFaultOn(state, faultMenu.target)}
          onPick={(o) => {
            act(o.apply);
            setFaultMenu(null);
          }}
          onClear={() => {
            act((s) => clearFaultOn(s, faultMenu.target));
            setFaultMenu(null);
          }}
          onClose={() => setFaultMenu(null)}
        />
      )}
    </div>
  );
}

// ===== Bandeau ===============================================================

function TopBar({
  onExit,
  traffic,
  onToggleTraffic,
  scenario,
  onSelectScenario,
  fiche,
  onToggleFiche,
  clock,
  date,
  paused,
  onTogglePause,
  speed,
  onToggleSpeed,
  sound,
  onToggleSound,
}: {
  onExit: () => void;
  traffic: boolean;
  onToggleTraffic: () => void;
  scenario: string;
  onSelectScenario: (id: string) => void;
  /** La fiche de situation de travail est-elle dépliée ? */
  fiche: boolean;
  onToggleFiche: () => void;
  clock: string;
  date: string;
  paused: boolean;
  onTogglePause: () => void;
  speed: Cadence;
  onToggleSpeed: () => void;
  sound: boolean;
  onToggleSound: () => void;
}) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        padding: '14px 22px',
        background: prs.header,
        borderBottom: `1px solid rgba(255,255,255,.07)`,
      }}
    >
      <button
        type="button"
        onClick={onExit}
        title="Retour à l'accueil"
        aria-label="Retour à l'accueil"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: 'inherit',
          font: 'inherit',
        }}
      >
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            border: `1.5px solid ${prs.textMuted}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width={20} height={20} viewBox="0 0 20 20" aria-hidden="true">
            <circle cx={10} cy={10} r={8.4} fill="none" stroke={prs.textMuted} strokeWidth={1.1} />
            <line x1={4.6} y1={14.6} x2={15} y2={5.4} stroke={prs.textMuted} strokeWidth={1.1} />
          </svg>
        </span>
        <span style={{ fontSize: 19, fontWeight: 600, letterSpacing: 0.2, whiteSpace: 'nowrap' }}>
          Voie Libre
        </span>
      </button>

      <span style={{ fontSize: 12.5, color: prs.textFaint, letterSpacing: 0.6, whiteSpace: 'nowrap' }}>
        POC TCO
      </span>

      {/* Pilotage de la séance : trafic de fond et scénario. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 14, whiteSpace: 'nowrap' }}>
        <button
          type="button"
          onClick={onToggleTraffic}
          style={actionButton(traffic ? 'amber' : undefined)}
          title="Trafic souple : circulations continues voie 1 (AG) et voie 2 (N2)"
        >
          {traffic ? 'Arrêter le trafic' : 'Trafic souple'}
        </button>
        <select
          value={scenario}
          onChange={(e) => onSelectScenario(e.target.value)}
          style={{ ...selectStyle, width: 'auto', minWidth: 210 }}
          title="Chaque scénario réinitialise le poste, règle l'horloge simulée et injecte son incident"
        >
          <option value="">Scénario… (aucun)</option>
          {SCENARIOS.map((sc) => (
            <option key={sc.id} value={sc.id}>
              {sc.label} — {sc.hint}
            </option>
          ))}
        </select>
        {/* Bouton `btst` : la planche du graphique de circulation prévu. */}
        <button
          type="button"
          onClick={onToggleFiche}
          disabled={!scenario}
          title={
            scenario
              ? 'Fiche de situation de travail : le graphique de circulation prévu'
              : 'Choisissez un scénario pour consulter sa fiche'
          }
          style={{
            ...actionButton(fiche && scenario ? 'amber' : undefined),
            opacity: scenario ? 1 : 0.4,
            cursor: scenario ? 'pointer' : 'default',
          }}
        >
          T.S.T.
        </button>
      </div>

      <div
        style={{
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 26,
          whiteSpace: 'nowrap',
        }}
      >
        <span
          style={{
            font: `600 22px/1 ${prsFont.mono}`,
            color: prs.green,
            letterSpacing: 2,
            textShadow: '0 0 12px rgba(79,209,139,.35)',
          }}
        >
          {clock}
        </span>
        {/* Pause : fige l'horloge du poste et, avec elle, toutes les
            temporisations en cours. */}
        <button
          type="button"
          onClick={onTogglePause}
          title={paused ? 'Reprendre' : 'Mettre en pause'}
          aria-label={paused ? 'Reprendre' : 'Mettre en pause'}
          aria-pressed={paused}
          style={{
            width: 34,
            height: 34,
            marginLeft: -14,
            borderRadius: '50%',
            background: paused ? prs.amberBg : prs.button,
            border: `1px solid ${paused ? prs.amber : prs.borderMid}`,
            color: paused ? prs.amber : prs.textFaint,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden="true" fill="currentColor">
            {paused ? (
              <polygon points="2,0 12,6 2,12" />
            ) : (
              <>
                <rect x={1} y={0} width={3.5} height={12} rx={0.8} />
                <rect x={7.5} y={0} width={3.5} height={12} rx={0.8} />
              </>
            )}
          </svg>
        </button>
        {/* Cadence : le poste avance à ×1, ×2 ou ×5 du temps réel. Les
            temporisations suivent, l'horloge du scénario aussi. */}
        <button
          type="button"
          onClick={onToggleSpeed}
          title={
            speed === 1
              ? 'Accélérer le temps ×2'
              : `Cadence ×${speed} — cliquez pour passer à ×${
                  CADENCES[(CADENCES.indexOf(speed) + 1) % CADENCES.length]
                }`
          }
          aria-pressed={speed !== 1}
          style={{
            height: 34,
            minWidth: 40,
            marginLeft: -16,
            borderRadius: prs.radius.pill,
            background: speed !== 1 ? prs.amberBg : prs.button,
            border: `1px solid ${speed !== 1 ? prs.amber : prs.borderMid}`,
            color: speed !== 1 ? prs.amber : prs.textFaint,
            font: `600 13px/1 ${prsFont.mono}`,
            letterSpacing: 0.5,
            cursor: 'pointer',
            padding: '0 10px',
          }}
        >
          ×{speed}
        </button>
        <span style={{ font: `13px/1 ${prsFont.mono}`, color: '#7f93aa', letterSpacing: 1.5 }}>
          {date}
        </span>
        {/* Coupe-son global : bouton `bson` de la frame `tete` (`fonson()`). */}
        <button
          type="button"
          onClick={onToggleSound}
          title={sound ? 'Couper le son' : 'Rétablir le son'}
          aria-label={sound ? 'Couper le son' : 'Rétablir le son'}
          aria-pressed={sound}
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: sound ? prs.blueBg : prs.button,
            border: `1px solid ${sound ? prs.borderBlue : prs.borderMid}`,
            color: sound ? prs.blueText : prs.textFaint,
            font: `15px/1 ${prsFont.ui}`,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          {sound ? '🔊' : '🔇'}
        </button>
      </div>
    </header>
  );
}

// ===== Barre d'actions =======================================================

function ActionBar({
  summary,
  showDerangements,
  onToggleDerangements,
  imprime,
  onOpenImprimes,
  generation,
  onSetGeneration,
  onReset,
}: {
  summary: string;
  showDerangements: boolean;
  onToggleDerangements: () => void;
  /** Imprimé actuellement déplié, s'il y en a un. */
  imprime: string | null;
  /** Ouvre la fenêtre de choix de l'imprimé. */
  onOpenImprimes: () => void;
  generation: 0 | 1;
  onSetGeneration: (g: 0 | 1) => void;
  onReset: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        flexWrap: 'wrap',
      }}
    >
      {/* Le choix de génération descend ici : le bandeau porte désormais le
          pilotage de la séance. */}
      <select
        value={generation}
        onChange={(e) => onSetGeneration(Number(e.target.value) === 1 ? 1 : 0)}
        style={{ ...selectStyle, width: 'auto' }}
        title="En 1ʳᵉ génération, la D.M.T. détruit l'itinéraire d'elle-même à échéance ; en 2ᵉ, le bouton se rallume."
      >
        <option value={0}>PRS 2ᵉ génération</option>
        <option value={1}>PRS 1ʳᵉ génération</option>
      </select>
      <button
        type="button"
        onClick={onToggleDerangements}
        style={actionButton(showDerangements ? 'amber' : undefined)}
      >
        Dérangement
      </button>
      {/* Consignes et documentation technique du poste — le sélecteur
          « Consignes… » de l'original ne contenait déjà plus rien, et les
          documents (CG S6A N°8, CR S6A N°1, CCE S9C N°2) sont livrés à part en
          PDF. Le bouton attend qu'on décide de ce qu'il ouvre. */}
      <button
        type="button"
        onClick={() => undefined}
        style={actionButton()}
        title="Consignes et documentation technique du poste — à venir"
      >
        Documentation
      </button>
      {/* Imprimés réglementaires — le sélecteur « Imprimés… » du panneau
          « À disposition » ouvrait le Bulletin Cba et l'Ordre / Avis. */}
      <button
        type="button"
        onClick={onOpenImprimes}
        style={actionButton(imprime ? 'amber' : undefined)}
        title="Imprimés réglementaires : Bulletin Cba, Ordre / Avis"
      >
        Formulaire
      </button>
      <button type="button" onClick={onReset} style={actionButton()}>
        Initialiser
      </button>
      <span
        style={{
          marginLeft: 8,
          fontSize: 11.5,
          fontFamily: prsFont.mono,
          color: prs.textFaint,
        }}
      >
        {summary}
      </span>
    </div>
  );
}

function buildSummary(s: PrsState): string {
  const established = Object.values(s.established).filter(Boolean).length;
  const open = Object.values(s.signals).filter((v) => v === 0).length;
  const faults = Object.values(s.faults).filter(Boolean).length;
  const parts = [
    `${established} itinéraire${established > 1 ? 's' : ''} établi${established > 1 ? 's' : ''}`,
    `${open} signal${open > 1 ? 'aux' : ''} ouvert${open > 1 ? 's' : ''}`,
  ];
  if (faults > 0) {
    parts.push(`${faults} dérangement${faults > 1 ? 's' : ''} actif${faults > 1 ? 's' : ''}`);
  }
  for (const t of s.trains) parts.push(trainStatus(t));
  return parts.join(' · ');
}

function formatClock(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// ===== Journal ===============================================================

/**
 * Le journal du poste est masqué.
 *
 * Il n'a pas d'équivalent dans l'original — qui n'a que des `alert()`
 * bloquantes — et il reste le témoin de référence des essais, qui lisent
 * `state.log` directement. Remettre ce drapeau à `true` le rétablit.
 */
const AFFICHER_JOURNAL: boolean = false;

function Journal({ state }: { state: PrsState }) {
  const color = (l: 'info' | 'warn' | 'error') =>
    l === 'error' ? prs.redSoft : l === 'warn' ? prs.amber : prs.textMuted;

  return (
    <Panel title="Journal du poste" accent="neutral">
      {state.log.length === 0 ? (
        <p style={{ margin: 0, fontSize: 11.5, color: prs.textFaint, lineHeight: '16px' }}>
          Les commandes, refus et dérangements s'inscrivent ici. Commencez par appuyer sur un bouton
          d'itinéraire : un premier appui le forme, un second le détruit.
        </p>
      ) : (
        <ol
          style={{
            margin: 0,
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            maxHeight: 220,
            overflowY: 'auto',
            fontFamily: prsFont.mono,
            fontSize: 11.5,
            lineHeight: '16px',
          }}
        >
          {state.log.map((e) => (
            <li key={e.seq} style={{ color: color(e.level) }}>
              {e.text}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
