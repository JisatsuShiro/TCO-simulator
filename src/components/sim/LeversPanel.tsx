// Panneau des leviers — interaction principale du PRS.
//
// Click sur un levier → dispatch `toggleLever`. Si une garde refuse
// (incompatibilité, EAP/EPA actif, zone occupée…), Gessie échoue
// silencieusement — on détecte le no-op via `setTimeout(0)` et on
// déclenche l'animation didactique de refus locale au composant `Lever`.
//
// Phase 2 : intégration des commutateurs FC. On regroupe les leviers
// consécutifs qui partagent exactement le même ensemble de FC en
// "groupes" rendus chacun comme une mini-grille (FC en row 1 spannant
// la largeur du groupe, leviers en row 2). Le conteneur principal
// est en flex-wrap pour gérer le débordement horizontal.

import { useState, useMemo, useEffect } from 'react';
import { useGessieStore, type LeverRefusalEntry } from '../../store/useGessieStore';
import { Lever } from '../../design/primitives/Lever';
import { Panel } from '../../design/primitives/Panel';
import { Clock } from '../../design/primitives/Clock';
import { SpeedSelector } from '../../design/primitives/SpeedSelector';
import { useClockTick } from '../../sim/useClockTick';
import { colors, radii, spacing, typography } from '../../design/tokens';
import type { Affectation, Lever as LeverType } from '../../sim/types';
import { LeverKeyholeStrip, AuxiliaryKeysColumn } from './KeysPanel';
import { DispositifsMenu, type DispositifsTarget } from './DispositifsMenu';
import {
  FaPushButton,
  FcPushButton,
  EpaKeybox,
  AeKeybox,
} from './AnnulCells';
import { AtrPlate } from './AtrPanel';

type LeversView = 'leviers' | 'refusals';

/**
 * Classifie un levier : pilote-t-il (au moins) une aiguille ou uniquement
 * des contrôles/signaux ? On regarde le type de chaque affectation, avec
 * une heuristique de secours sur le préfixe "Ag" (convention Gessie pour
 * les aiguilles).
 */
function classifyLever(
  lever: LeverType,
  affectations: Record<string, Affectation>,
): 'aiguille' | 'controle' {
  for (const affId of lever.affectations) {
    const aff = affectations[affId];
    if (aff?.type === 'aiguille') return 'aiguille';
    if (affId.startsWith('Ag')) return 'aiguille';
  }
  return 'controle';
}

/**
 * Annulateurs/commutateurs applicables à un levier, regroupés par signal.
 * Un levier qui contrôle plusieurs signaux peut avoir plusieurs entrées.
 */
interface ChannelAnnotations {
  /** Signaux dont l'annulateur FA est exposé en slot-top. */
  faSignals: string[];
  /** Signaux dont l'annulateur de substitution est exposé en slot-top. */
  substSignals: string[];
  /** Signaux dont le commutateur FC est exposé en slot-top. */
  fcSignals: string[];
  /** Signaux avec EPA exposé en slot-bottom (keybox laitonné). */
  epaSignals: string[];
}

/**
 * Construit les annotations par canal AU NIVEAU D'UN GROUPE, en dédupliquant
 * les annulateurs partagés entre plusieurs leviers du même signal. Règle :
 * le PREMIER levier (ordre d'itération) qui possède un signal "réclame" son
 * annulateur FA/Subst/FC/EPA ; les leviers suivants voient une cellule vide
 * pour ce signal (mais le rail garde sa hauteur, donc l'alignement
 * horizontal est préservé).
 */
function computeGroupAnnotations(
  levers: LeverType[],
  affectations: Record<string, Affectation>,
): Map<string, ChannelAnnotations> {
  const result = new Map<string, ChannelAnnotations>();
  const claimedFa = new Set<string>();
  const claimedSubst = new Set<string>();
  const claimedFc = new Set<string>();
  const claimedEpa = new Set<string>();
  for (const lever of levers) {
    const ann: ChannelAnnotations = {
      faSignals: [],
      substSignals: [],
      fcSignals: [],
      epaSignals: [],
    };
    for (const affId of lever.affectations) {
      const aff = affectations[affId];
      if (!aff) continue;
      if (aff.annulateurFA && !claimedFa.has(affId)) {
        ann.faSignals.push(affId);
        claimedFa.add(affId);
      }
      if (aff.annulSubstitution && !claimedSubst.has(affId)) {
        ann.substSignals.push(affId);
        claimedSubst.add(affId);
      }
      if (aff.positionFC !== undefined && !claimedFc.has(affId)) {
        ann.fcSignals.push(affId);
        claimedFc.add(affId);
      }
      if (aff.epa && !claimedEpa.has(affId)) {
        ann.epaSignals.push(affId);
        claimedEpa.add(affId);
      }
    }
    result.set(lever.id, ann);
  }
  return result;
}

export function LeversPanel() {
  // Pose le setInterval(1000) qui fait tourner l'horloge tant qu'on est en
  // mode play. Historiquement dans `SimControls` (composant supprimé après
  // l'intégration des contrôles dans le header de ce panel).
  useClockTick();

  const data = useGessieStore((s) => s.player.data);
  const toggleLever = useGessieStore((s) => s.toggleLever);
  const toggleAnnulElec = useGessieStore((s) => s.toggleAnnulElec);
  const refusalsCount = useGessieStore((s) => s.leverRefusals.length);
  const refusalsUnseen = useGessieStore((s) => s.leverRefusalsUnseen);
  const markRefusalsSeen = useGessieStore((s) => s.markLeverRefusalsSeen);
  const atrCount = useGessieStore(
    (s) => s.player.data?.transitAnnulateurs.length ?? 0,
  );
  // Signaux qui exposent un EPA (annulateur de parcours) — un par signal,
  // dédupliqué. Rendus dans leur propre cartouche à côté du groupe ATR.
  // Pour chaque signal on remonte aussi la liste des leviers qui le pilotent
  // (inverse de l'index lever→affectations) afin d'étiqueter le keybox avec
  // "L<leverIds>".
  const epaEntries = useMemo(() => {
    if (!data) return [] as { signalId: string; leverIds: string[] }[];
    const signalToLevers = new Map<string, string[]>();
    for (const lever of Object.values(data.levers)) {
      for (const sid of lever.affectations) {
        const arr = signalToLevers.get(sid) ?? [];
        arr.push(lever.id);
        signalToLevers.set(sid, arr);
      }
    }
    const sortNatural = (a: string, b: string) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      if (!isNaN(na)) return -1;
      if (!isNaN(nb)) return 1;
      return a.localeCompare(b);
    };
    return Object.entries(data.affectations)
      .filter(([, a]) => Boolean(a.epa))
      .map(([signalId]) => ({
        signalId,
        leverIds: (signalToLevers.get(signalId) ?? []).slice().sort(sortNatural),
      }))
      .sort((a, b) => a.signalId.localeCompare(b.signalId));
  }, [data]);
  const [view, setView] = useState<LeversView>('leviers');
  const [refusedLever, setRefusedLever] = useState<string | null>(null);
  const [dispositifsMenu, setDispositifsMenu] = useState<
    { x: number; y: number; target: DispositifsTarget } | null
  >(null);

  // Quand l'opérateur consulte l'onglet "Refus", on marque tout comme lu →
  // arrête le clignotement. On laisse les entrées dans la liste pour
  // consultation : seul le badge `unseen` est reset.
  useEffect(() => {
    if (view === 'refusals' && refusalsUnseen > 0) {
      markRefusalsSeen();
    }
  }, [view, refusalsUnseen, markRefusalsSeen]);

  // Liste triée des leviers (mémoïsée pour stabiliser les positions de groupe).
  const levers = useMemo(() => {
    if (!data) return [];
    return Object.values(data.levers).sort((a, b) => {
      // Tri naturel : numérique d'abord, puis alpha
      const na = parseInt(a.id, 10);
      const nb = parseInt(b.id, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      if (!isNaN(na)) return -1;
      if (!isNaN(nb)) return 1;
      return a.id.localeCompare(b.id);
    });
  }, [data]);

  // Sépare les leviers en deux familles : ceux qui pilotent des
  // contrôles/signaux et ceux qui pilotent des aiguilles. Affichés
  // respectivement à gauche et à droite du panel.
  const controleLevers = useMemo(() => {
    if (!data) return [];
    return levers.filter((l) => classifyLever(l, data.affectations) === 'controle');
  }, [data, levers]);

  const aiguilleLevers = useMemo(() => {
    if (!data) return [];
    return levers.filter((l) => classifyLever(l, data.affectations) === 'aiguille');
  }, [data, levers]);

  if (!data) return null;
  if (levers.length === 0) return null;

  const handleLeverClick = (id: string, positionBefore: 'plus' | 'minus') => {
    toggleLever(id);
    // Détection du refus silencieux : si la position n'a pas changé
    // après le commit Zustand, on déclenche l'animation didactique.
    setTimeout(() => {
      const after = useGessieStore.getState().player.data?.levers[id]?.position;
      if (after === positionBefore) {
        setRefusedLever(id);
        // Reset après la durée de l'animation pour permettre un nouveau refus.
        setTimeout(() => setRefusedLever(null), 600);
      }
    }, 0);
  };

  const handleLeverContextMenu = (e: React.MouseEvent, leverId: string) => {
    e.preventDefault();
    setDispositifsMenu({ x: e.clientX, y: e.clientY, target: { kind: 'lever', leverId } });
  };

  // Rails actifs par groupe : un rail apparaît si au moins un canal du
  // groupe l'utilise.
  const groupRailsControle = computeGroupRails(controleLevers, data.affectations);
  const groupRailsAiguille = computeGroupRails(aiguilleLevers, data.affectations);

  // Union des rails de tous les groupes : sert à RÉSERVER la place du
  // slot-top sur les canaux qui n'ont pas leurs propres rails (typiquement
  // Aiguilles, qui n'a ni FA ni FC). Sans ça, les leviers d'aiguilles
  // "remontent" verticalement par rapport aux leviers de signaux et
  // l'alignement horizontal entre rangées est cassé.
  const reservedRails: GroupRails = {
    fa: groupRailsControle.fa || groupRailsAiguille.fa,
    subst: groupRailsControle.subst || groupRailsAiguille.subst,
    fc: groupRailsControle.fc || groupRailsAiguille.fc,
  };

  // Annotations dédupliquées par groupe : si plusieurs leviers partagent un
  // signal (cas Cv212/EP — destination EP / destination LP), seul le premier
  // levier rend l'annulateur FA/Subst/FC/EPA. Les suivants voient une
  // cellule vide.
  const annotationsControle = computeGroupAnnotations(controleLevers, data.affectations);
  const annotationsAiguille = computeGroupAnnotations(aiguilleLevers, data.affectations);

  // Nombre de leviers par signal — sert au format de label Gessie : on
  // suffixe "/destination" uniquement si le signal a >1 leviers à
  // disambiguer.
  const signalLeverCounts = computeSignalLeverCounts(levers);

  // Le titre du panel compose deux blocs côte à côte : les onglets à gauche
  // (Leviers / Refus) et les contrôles de sim à droite (horloge + sélecteur
  // de vitesse + badge discordances). Un wrapper flex avec
  // `justifyContent: 'space-between'` et `flex: 1` permet d'occuper toute
  // la largeur du header du Panel.
  const tabs = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        flex: 1,
        minWidth: 0,
      }}
    >
      <LeversTabs
        activeView={view}
        onChange={setView}
        refusalsTotal={refusalsCount}
        refusalsUnseen={refusalsUnseen}
      />
      <SimHeaderControls />
    </div>
  );

  return (
    <Panel
      title={tabs}
      bodyDirection="row"
      bodyGap={spacing.md}
      bodyAlign="start"
      padding={12}
    >
      {view === 'leviers' ? (
        <>
          {/* Zone principale "pupitre intégré" : leviers groupés en deux
              cartouches (Signaux à gauche, Aiguilles à droite). Chaque
              levier devient un "canal" vertical avec ses annulateurs au-
              dessus et son keybox/AE en-dessous. */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              minWidth: 0,
              gap: spacing.sm,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                gap: spacing.md,
                alignItems: 'flex-start',
                flexWrap: 'wrap',
              }}
            >
            {controleLevers.length > 0 && (
              <ChannelGroup
                tag="signal"
                tagLabel="Signaux"
              >
                {controleLevers.map((l) => (
                  <LeverChannel
                    key={l.id}
                    lever={l}
                    annotations={annotationsControle.get(l.id) ?? EMPTY_ANNOTATIONS}
                    signalLeverCounts={signalLeverCounts}
                    refusedLever={refusedLever}
                    groupRails={groupRailsControle}
                    reservedRails={reservedRails}
                    onLeverClick={handleLeverClick}
                    onAnnulElecToggle={toggleAnnulElec}
                    onLeverContextMenu={handleLeverContextMenu}
                  />
                ))}
              </ChannelGroup>
            )}
            {aiguilleLevers.length > 0 && (
              <ChannelGroup
                tag="aig"
                tagLabel="Aiguilles"
              >
                {aiguilleLevers.map((l) => (
                  <LeverChannel
                    key={l.id}
                    lever={l}
                    annotations={annotationsAiguille.get(l.id) ?? EMPTY_ANNOTATIONS}
                    signalLeverCounts={signalLeverCounts}
                    refusedLever={refusedLever}
                    groupRails={groupRailsAiguille}
                    reservedRails={reservedRails}
                    onLeverClick={handleLeverClick}
                    onAnnulElecToggle={toggleAnnulElec}
                    onLeverContextMenu={handleLeverContextMenu}
                  />
                ))}
              </ChannelGroup>
            )}
            {atrCount > 0 && (
              <ChannelGroup
                tag="atr"
                tagLabel="Annulateurs de transit"
                direction="column"
              >
                {Array.from({ length: atrCount }, (_, i) => (
                  <AtrPlate key={i} index={i} />
                ))}
              </ChannelGroup>
            )}
            {epaEntries.length > 0 && (
              <ChannelGroup
                tag="atr"
                tagLabel="Annul EPA"
              >
                {epaEntries.map((e) => (
                  <EpaKeybox
                    key={`epa-${e.signalId}`}
                    signalId={e.signalId}
                    leverIds={e.leverIds}
                  />
                ))}
              </ChannelGroup>
            )}
            </div>
          </div>

          {/* Colonne droite : boîtes à clés / cadenas / verrous centraux.
              Retourne null automatiquement si aucun de ces éléments
              n'existe. */}
          <AuxiliaryKeysColumn />
        </>
      ) : (
        <RefusalsView />
      )}

      {dispositifsMenu && (
        <DispositifsMenu
          x={dispositifsMenu.x}
          y={dispositifsMenu.y}
          target={dispositifsMenu.target}
          onClose={() => setDispositifsMenu(null)}
        />
      )}

      {/* Keyframes pour le clignotement de l'onglet "Refus" quand des
          refus non lus s'accumulent. Couleur ↔ blanc → halo rouge → couleur,
          discret mais accrocheur. */}
      <style>{`@keyframes gessieRefusBlink {
        0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); border-color: ${colors.signal.rouge}; background: ${colors.signal.rouge}; color: #fff; }
        50% { box-shadow: 0 0 0 4px rgba(220, 38, 38, 0.55); border-color: #FF6B6B; background: #FF6B6B; color: #fff; }
      }`}</style>
    </Panel>
  );
}

// ===== LeversTabs ============================================================
//
// Onglets dans le header du LeversPanel. Deux onglets :
//   - "Leviers" : la grille classique (positions actuelles, FC, AE, clés…)
//   - "Refus N" : journal des refus de toggleLever — pulse en rouge quand
//                 `refusalsUnseen > 0`. Clic = switch view + mark seen.

function LeversTabs({
  activeView,
  onChange,
  refusalsTotal,
  refusalsUnseen,
}: {
  activeView: LeversView;
  onChange: (v: LeversView) => void;
  refusalsTotal: number;
  refusalsUnseen: number;
}) {
  return (
    <div style={{ display: 'flex', gap: spacing.xxs, alignItems: 'center' }}>
      <TabButton
        label="Leviers"
        active={activeView === 'leviers'}
        onClick={() => onChange('leviers')}
      />
      <TabButton
        label="Refus"
        badge={refusalsTotal}
        active={activeView === 'refusals'}
        blink={refusalsUnseen > 0}
        onClick={() => onChange('refusals')}
      />
    </div>
  );
}

// ===== SimHeaderControls ====================================================
//
// Contrôles de simulation intégrés à droite du header du LeversPanel :
//   - Horloge (Clock) avec pastille qui pulse quand la sim avance
//   - Sélecteur de vitesse (×0 = pause, ×1, ×2, ×5, ×10)
//   - Badge "DISC N" quand au moins une discordance est active
//
// Ces contrôles vivaient historiquement dans un composant `SimControls`
// rendu en bandeau dédié sous le TCO. Le déplacement ici libère cette
// ligne et concentre l'opérateur sur un seul header.

function SimHeaderControls() {
  const mode = useGessieStore((s) => s.player.mode);
  const speed = useGessieStore((s) => s.clock.speed);
  const currentTime = useGessieStore((s) => s.clock.currentTime);
  const discordancesCount = useGessieStore(
    (s) => s.player.data?.discordances_count ?? 0,
  );
  const setSpeed = useGessieStore((s) => s.setSpeed);

  const running = mode === 'play' && speed > 0;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
        flexShrink: 0,
      }}
    >
      <Clock timeMs={currentTime} running={running} />
      {mode === 'play' && <SpeedSelector speed={speed} onChange={setSpeed} />}
      {discordancesCount > 0 && (
        <span
          aria-label={`${discordancesCount} discordance${discordancesCount > 1 ? 's' : ''} active${discordancesCount > 1 ? 's' : ''}`}
          title="Aiguilles ou taquets en discordance (contrôle absent)"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '2px 10px',
            background: colors.signal.rouge,
            color: colors.text.primary,
            border: '1px solid #7A1414',
            borderRadius: 999,
            fontFamily: typography.mono.family,
            fontSize: typography.size.xs,
            fontWeight: typography.weight.bold,
            letterSpacing: 0.4,
          }}
        >
          <span aria-hidden="true">⚠</span>
          DISC {discordancesCount}
        </span>
      )}
    </div>
  );
}

function TabButton({
  label,
  active,
  blink = false,
  badge,
  onClick,
}: {
  label: string;
  active: boolean;
  blink?: boolean;
  badge?: number;
  onClick: () => void;
}) {
  // L'animation n'est appliquée qu'au badge `unseen > 0`. Le bouton lui-même
  // garde son apparence neutre/active pour ne pas distraire en permanence.
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={
        badge && badge > 0
          ? `Onglet ${label} (${badge}${blink ? ', non lu' : ''})`
          : `Onglet ${label}`
      }
      style={{
        background: active ? colors.surface.dark : 'transparent',
        color: active ? colors.text.primary : colors.text.secondary,
        border: `1px solid ${active ? colors.border.default : 'transparent'}`,
        borderRadius: radii.sm,
        padding: '4px 10px',
        cursor: 'pointer',
        fontFamily: typography.ui.family,
        fontSize: typography.size.sm,
        fontWeight: active ? typography.weight.semibold : typography.weight.medium,
        letterSpacing: 0.2,
        display: 'inline-flex',
        alignItems: 'center',
        gap: spacing.xxs,
        transition: `background 120ms, color 120ms`,
      }}
    >
      <span>{label}</span>
      {badge != null && badge > 0 && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 18,
            height: 16,
            padding: '0 5px',
            borderRadius: 999,
            background: blink ? colors.signal.rouge : colors.surface.medium,
            color: blink ? '#fff' : colors.text.secondary,
            border: `1px solid ${blink ? colors.signal.rouge : colors.border.subtle}`,
            fontFamily: typography.mono.family,
            fontSize: typography.size.xs,
            fontWeight: typography.weight.bold,
            animation: blink ? 'gessieRefusBlink 1s ease-in-out infinite' : undefined,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ===== RefusalsView ==========================================================
//
// Liste chronologique inversée des refus de toggleLever (le plus récent en
// haut). Chaque entrée affiche l'heure simulée, le levier ciblé, le code de
// garde, et la raison FR localisée. Bouton "Effacer" en haut pour purger.

function RefusalsView() {
  const refusals = useGessieStore((s) => s.leverRefusals);
  const clear = useGessieStore((s) => s.clearLeverRefusals);

  if (refusals.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          minHeight: 80,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: colors.text.muted,
          fontStyle: 'italic',
          fontSize: typography.size.sm,
        }}
      >
        Aucun refus enregistré. Les manœuvres impossibles s'afficheront ici.
      </div>
    );
  }

  // Tri décroissant par uid (qui contient le timestamp, donc ordre stable
  // chronologique inverse).
  const ordered = [...refusals].reverse();

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.xs,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <button
          type="button"
          onClick={clear}
          style={{
            background: 'transparent',
            color: colors.text.secondary,
            border: `1px solid ${colors.border.default}`,
            borderRadius: radii.sm,
            padding: '2px 10px',
            cursor: 'pointer',
            fontFamily: typography.ui.family,
            fontSize: typography.size.xs,
          }}
        >
          Effacer
        </button>
      </div>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: spacing.xxs,
          maxHeight: 320,
          overflowY: 'auto',
        }}
      >
        {ordered.map((entry) => (
          <RefusalRow key={entry.uid} entry={entry} />
        ))}
      </ul>
    </div>
  );
}

function RefusalRow({ entry }: { entry: LeverRefusalEntry }) {
  const time = formatSimTime(entry.time);
  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: spacing.sm,
        padding: `${spacing.xs}px ${spacing.sm}px`,
        background: colors.surface.medium,
        border: `1px solid ${colors.border.subtle}`,
        borderRadius: radii.sm,
        fontFamily: typography.ui.family,
        fontSize: typography.size.sm,
      }}
    >
      <span
        style={{
          fontFamily: typography.mono.family,
          fontSize: typography.size.xs,
          color: colors.text.muted,
          minWidth: 60,
          letterSpacing: 0.4,
        }}
      >
        {time}
      </span>
      <span
        style={{
          fontFamily: typography.mono.family,
          fontWeight: typography.weight.bold,
          color: colors.text.primary,
          minWidth: 32,
        }}
      >
        L{entry.leverId}
      </span>
      <span
        style={{
          fontFamily: typography.mono.family,
          fontSize: typography.size.xs,
          padding: '1px 6px',
          borderRadius: radii.sm,
          background: colors.surface.darkest,
          color: colors.text.secondary,
          border: `1px solid ${colors.border.subtle}`,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          alignSelf: 'flex-start',
        }}
      >
        {entry.guard}
      </span>
      <span
        style={{
          flex: 1,
          color: colors.text.primary,
          minWidth: 0,
        }}
      >
        {entry.reason}
      </span>
    </li>
  );
}

function formatSimTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '--:--:--';
  const d = new Date(ms);
  // Heure simulée — on lit l'horloge du Player en UTC pour reproduire
  // l'affichage du Clock primitive (qui formate aussi en UTC HH:MM:SS).
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

// Largeur d'un canal (top slot + lever + bottom slot empilés). Cale au
// plus juste sur le bouton levier (`BOX_WIDTH + 6 = 38 px`) — pas de
// slack horizontal, c'est `alignItems: center` qui centre.
const CHANNEL_WIDTH = 38;

// Hauteur d'un rail dans le slot-top (cellule FA / Subst / FC). Les rails
// sont empilés verticalement à des Y FIXES → tous les boutons d'un même
// type s'alignent horizontalement à travers la rangée des canaux.
const RAIL_HEIGHT = 22;

// Hauteur fixe du slot-bottom (AE + EPA keybox). Garde les pieds des
// canaux alignés.
// Hauteur du slot-bottom : juste assez pour le bouton AE (~24 px) + un peu
// d'air. Les keyboxes EPA ont migré dans leur propre cartouche, donc ce
// slot a maigri.
const SLOT_BOTTOM_HEIGHT = 32;

// Gap horizontal entre canaux.
const CHANNEL_GAP = 2;

/**
 * Rails actifs dans un groupe de canaux. Un rail apparaît si AU MOINS un
 * canal du groupe l'utilise. Les groupes sans aucun rail (ex : Aiguilles)
 * n'ont pas de slot-top, ce qui les rend compacts visuellement.
 */
interface GroupRails {
  fa: boolean;
  subst: boolean;
  fc: boolean;
}

function computeGroupRails(
  levers: LeverType[],
  affectations: Record<string, Affectation>,
): GroupRails {
  let fa = false;
  let subst = false;
  let fc = false;
  for (const l of levers) {
    for (const id of l.affectations) {
      const aff = affectations[id];
      if (!aff) continue;
      if (aff.annulateurFA) fa = true;
      if (aff.annulSubstitution) subst = true;
      if (aff.positionFC !== undefined) fc = true;
      if (fa && subst && fc) return { fa, subst, fc };
    }
  }
  return { fa, subst, fc };
}

// Mapping des dispositifs d'attention vers les couleurs de la tête de manche.
// Reproduit la convention "manchon coloré" qu'un opérateur PRS pose sur un
// levier pour signaler son attention.
const DISPOSITIF_KNOB_COLORS: Record<string, string> = {
  DA: colors.signal.rouge,
  DSA: colors.accent.primary,
  DR: colors.signal.jaune,
};

// Ordre canonique : DA en haut, DSA au milieu, DR en bas (tri stable
// indépendant de l'ordre d'activation, sinon les bandes "sautent" en
// fonction de l'ordre des clics).
const DISPOSITIF_ORDER = ['DA', 'DSA', 'DR'] as const;

function knobColorsFor(dispositifs: string[]): string[] {
  const set = new Set(dispositifs);
  return DISPOSITIF_ORDER.filter((d) => set.has(d)).map((d) => DISPOSITIF_KNOB_COLORS[d]);
}

// ===== ChannelGroup : cartouche d'un groupe de canaux =====================
//
// Repro le `.group` du design "Pupitre intégré" : bordure subtile, tag pill
// coloré (Signaux/Aiguilles), ligne de séparation, meta légère à droite.

const TAG_PALETTE = {
  signal: {
    bg: 'rgba(91, 155, 255, 0.12)',
    color: colors.accent.primary,
    border: 'rgba(91, 155, 255, 0.25)',
  },
  aig: {
    bg: 'rgba(234, 179, 8, 0.12)',
    color: colors.signal.jaune,
    border: 'rgba(234, 179, 8, 0.25)',
  },
  atr: {
    bg: 'rgba(180, 150, 90, 0.15)',
    color: '#d8c896',
    border: 'rgba(180, 150, 90, 0.30)',
  },
} as const;

function ChannelGroup({
  tag,
  tagLabel,
  meta,
  direction = 'row',
  children,
}: {
  tag: keyof typeof TAG_PALETTE;
  tagLabel: string;
  meta?: string;
  /** Sens d'empilement des enfants. `'row'` (défaut, pour les canaux
      leviers qui s'étalent horizontalement) ou `'column'` (pour les
      groupes verticaux type ATR). */
  direction?: 'row' | 'column';
  children: React.ReactNode;
}) {
  const palette = TAG_PALETTE[tag];
  const isColumn = direction === 'column';
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.015)',
        border: `1px solid ${colors.border.subtle}`,
        borderRadius: radii.md,
        padding: `${spacing.xs}px ${spacing.sm}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.xs,
        minWidth: 0,
      }}
    >
      {/* En-tête : tag pill + ligne + meta */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.sm,
          fontSize: 10,
          color: colors.text.muted,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          fontWeight: typography.weight.semibold,
        }}
      >
        <span
          style={{
            padding: '1px 7px',
            borderRadius: radii.sm,
            background: palette.bg,
            color: palette.color,
            border: `1px solid ${palette.border}`,
            fontFamily: typography.mono.family,
            fontWeight: typography.weight.medium,
            letterSpacing: 0,
            textTransform: 'none',
            fontSize: 11,
          }}
        >
          {tagLabel}
        </span>
        <span
          style={{
            flex: 1,
            height: 1,
            background: colors.border.subtle,
          }}
        />
        {meta && (
          <span
            style={{
              fontFamily: typography.mono.family,
              color: colors.text.muted,
              fontWeight: typography.weight.medium,
              letterSpacing: 0,
              textTransform: 'none',
              fontSize: 11,
            }}
          >
            {meta}
          </span>
        )}
      </div>
      {/* Corps : grille des canaux. Les labels FA/FC ont migré dans le
          slot-top de chaque canal (au-dessus de chaque bouton) — plus de
          colonne `RailLabelsColumn` à gauche. En mode `column`, on
          empile verticalement (utilisé par le groupe ATR). */}
      <div
        style={{
          display: 'flex',
          flexDirection: isColumn ? 'column' : 'row',
          flexWrap: isColumn ? 'nowrap' : 'wrap',
          gap: isColumn ? spacing.xs : `${spacing.xs}px ${CHANNEL_GAP}px`,
          alignItems: isColumn ? 'center' : 'flex-start',
          flex: 1,
          minWidth: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ===== SlotTopLabel / SlotTopCell ===========================================
//
// Helpers du slot-top par canal : un micro-label "FA"/"FC" au-dessus de
// chaque colonne et la cellule du bouton dessous. Largeur 50% (deux
// colonnes côte à côte par canal) pour garantir l'alignement horizontal
// FA-d'un-canal / FA-du-canal-d'à-côté, idem FC.

function SlotTopLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        flex: 1,
        textAlign: 'center',
        fontFamily: typography.mono.family,
        fontSize: 8,
        color: colors.text.muted,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        lineHeight: 1.1,
      }}
    >
      {children}
    </span>
  );
}

function SlotTopCell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
      }}
    >
      {children}
    </div>
  );
}

// ===== LeverChannel : un canal vertical complet ============================
//
// Layout per-canal : slot-top (annulateurs FA / Subst / FC) + Lever (avec
// ses serrures embarquées) + slot-bottom (AE + EPA keybox).
//
// Le slot-top et le slot-bottom ont des hauteurs FIXES pour aligner tous
// les leviers d'une même rangée — même si un canal n'a aucun annulateur,
// son slot reste réservé pour ne pas casser la grille visuelle.

const EMPTY_ANNOTATIONS: ChannelAnnotations = {
  faSignals: [],
  substSignals: [],
  fcSignals: [],
  epaSignals: [],
};

function LeverChannel({
  lever,
  annotations,
  signalLeverCounts,
  refusedLever,
  groupRails,
  reservedRails,
  onLeverClick,
  onAnnulElecToggle,
  onLeverContextMenu,
}: {
  lever: LeverType;
  /** Annotations du canal, déjà dédupliquées au niveau du groupe : un signal
      partagé entre plusieurs leviers n'apparaît que dans les annotations du
      premier d'entre eux. Les autres leviers reçoivent les listes vides
      pour ce signal. */
  annotations: ChannelAnnotations;
  signalLeverCounts: Record<string, number>;
  refusedLever: string | null;
  /** Rails actifs au niveau du groupe — détermine si ce canal RENDU
      VISIBLEMENT ses boutons FA / FC. Si false, le slot-top reste mais
      passe en `visibility: hidden` pour préserver la hauteur. */
  groupRails: GroupRails;
  /** Rails RÉSERVÉS au niveau global (union des groupes). Détermine la
      structure du slot-top (colonnes FA / FC) pour que les canaux d'un
      groupe sans rails (typiquement Aiguilles) conservent la même hauteur
      que ceux d'un groupe avec rails (Signaux). */
  reservedRails: GroupRails;
  onLeverClick: (id: string, positionBefore: 'plus' | 'minus') => void;
  onAnnulElecToggle: (leverId: string) => void;
  onLeverContextMenu: (e: React.MouseEvent, leverId: string) => void;
}) {
  const ann = annotations;
  // Subst retiré temporairement de l'UI (cf. tag stories). Le pipeline de
  // calcul `ann.substSignals` reste actif pour un retour facile.
  const hasOwnRail = groupRails.fa || groupRails.fc;
  const hasReservedRail = reservedRails.fa || reservedRails.fc;

  return (
    <div
      onContextMenu={(e) => onLeverContextMenu(e, lever.id)}
      style={{
        width: CHANNEL_WIDTH,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: spacing.xxs,
        padding: `${spacing.xxs}px 2px`,
        borderRadius: radii.sm,
      }}
    >
      {/* Slot-top : FA + FC côte à côte avec leurs micro-labels au-dessus.
          La STRUCTURE (quelles colonnes existent) suit `reservedRails`
          (union globale) pour que tous les canaux — y compris ceux d'un
          groupe sans rails — gardent la même hauteur. La VISIBILITÉ suit
          `groupRails` (rails propres au groupe) : un canal qui n'a aucun
          rail à lui passe en `visibility: hidden`. */}
      {hasReservedRail && (
        <div
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1,
            visibility: hasOwnRail ? 'visible' : 'hidden',
          }}
          aria-hidden={!hasOwnRail}
        >
          {/* Ligne 1 : micro-labels "FA" / "FC" */}
          <div
            style={{
              width: '100%',
              display: 'flex',
              gap: CHANNEL_GAP,
              justifyContent: 'center',
            }}
          >
            {reservedRails.fa && <SlotTopLabel>FA</SlotTopLabel>}
            {reservedRails.fc && <SlotTopLabel>FC</SlotTopLabel>}
          </div>
          {/* Ligne 2 : boutons FA / FC sur la même ligne */}
          <div
            style={{
              width: '100%',
              display: 'flex',
              gap: CHANNEL_GAP,
              justifyContent: 'center',
              height: RAIL_HEIGHT,
              alignItems: 'center',
            }}
          >
            {reservedRails.fa && (
              <SlotTopCell>
                {ann.faSignals.map((sid) => (
                  <FaPushButton key={`fa-${sid}`} signalId={sid} compact />
                ))}
              </SlotTopCell>
            )}
            {reservedRails.fc && (
              <SlotTopCell>
                {ann.fcSignals.map((sid) => (
                  <FcPushButton key={`fc-${sid}`} signalId={sid} compact />
                ))}
              </SlotTopCell>
            )}
          </div>
        </div>
      )}

      {/* Lever : design inchangé (cf. design/primitives/Lever.tsx). Les
          serrures sont rendues DANS la plaque via `keyholeSlot`. */}
      <Lever
        id={lever.id}
        num={lever.id}
        label={formatLeverLabel(lever, signalLeverCounts)}
        position={lever.position}
        refused={refusedLever === lever.id}
        onClick={() => onLeverClick(lever.id, lever.position)}
        keyholeSlot={<LeverKeyholeStrip leverId={lever.id} embedded />}
        knobColors={knobColorsFor(lever.dispositifs)}
      />

      {/* Slot-bottom : AE (annulateur électrique du levier). Les keyboxes
          EPA ont été déplacées vers le groupe "Annul EPA" à côté du groupe
          "Annulateurs de transit" — un canal par signal au lieu d'un par
          levier, ce qui évite la duplication quand un signal est piloté par
          plusieurs leviers. */}
      <div
        style={{
          height: SLOT_BOTTOM_HEIGHT,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 4,
          paddingTop: 2,
        }}
      >
        {lever.annulateurElec && (
          <AeKeybox leverId={lever.id} onToggle={onAnnulElecToggle} />
        )}
      </div>
    </div>
  );
}

/**
 * Compte le nombre de leviers qui contrôlent chaque signalId. Sert au
 * formatLeverLabel : on n'ajoute le suffixe "/destination" que si plusieurs
 * leviers partagent le même signal (sinon le signal seul suffit).
 */
function computeSignalLeverCounts(levers: LeverType[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const l of levers) {
    if (!l.signalId) continue;
    counts[l.signalId] = (counts[l.signalId] ?? 0) + 1;
  }
  return counts;
}

/**
 * Construit le label d'un levier au format Gessie. Règle observée :
 *   - Si le levier ne pilote pas de signal (aiguilles : Ag11, Ag15a/b…) ou
 *     que le signal est unique sur ce poste → on retourne le label de
 *     l'affectation principale (ou signalId).
 *   - Si plusieurs leviers partagent le même signal → "{signalId}/{dest}".
 *     Pour multi-destination on combine first-and-last avec " à ".
 *
 * Fallback : `lever.affectations[0]` si signalId est absent (cas aiguille).
 */
function formatLeverLabel(
  lever: LeverType,
  signalLeverCounts: Record<string, number>,
): string {
  const signalId = lever.signalId;
  if (!signalId) {
    return lever.affectations[0] ?? lever.id;
  }
  const sharedWithOthers = (signalLeverCounts[signalId] ?? 0) > 1;
  if (!sharedWithOthers) return signalId;
  const dests = lever.directionLabels ?? [];
  if (dests.length === 0) return signalId;
  if (dests.length === 1) return `${signalId}/${dests[0]}`;
  return `${signalId}/${dests[0]} à ${dests[dests.length - 1]}`;
}

