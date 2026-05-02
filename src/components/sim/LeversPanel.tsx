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

import { useState, useMemo } from 'react';
import { useGessieStore } from '../../store/useGessieStore';
import { Lever } from '../../design/primitives/Lever';
import { KnobButton } from '../../design/primitives/KnobButton';
import { Panel } from '../../design/primitives/Panel';
import { spacing } from '../../design/tokens';
import type { Lever as LeverType } from '../../sim/types';

interface Group {
  /** Liste des signalIds FC qui couvrent tous les leviers du groupe. */
  fcSignals: string[];
  levers: LeverType[];
}

export function LeversPanel() {
  const data = useGessieStore((s) => s.player.data);
  const toggleLever = useGessieStore((s) => s.toggleLever);
  const toggleCommutFC = useGessieStore((s) => s.toggleCommutFC);
  const [refusedLever, setRefusedLever] = useState<string | null>(null);

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

  // Pour chaque levier, liste des affectations qui ont un FC.
  // On les utilise pour grouper les leviers consécutifs partageant les
  // mêmes FCs.
  const groups = useMemo<Group[]>(() => {
    if (!data) return [];
    const fcsByLever = levers.map((l) =>
      l.affectations
        .filter((aff) => data.affectations[aff]?.positionFC !== undefined)
        .sort(),
    );
    const result: Group[] = [];
    let current: Group | null = null;
    for (let i = 0; i < levers.length; i++) {
      const fcs = fcsByLever[i];
      const key = fcs.join('|');
      // Un levier sans FC ne se merge jamais avec ses voisins : il forme
      // toujours son propre groupe solo. Ainsi chaque levier solo est un
      // flex-item séparé, susceptible de wrapper et d'être réparti sur
      // les deux rangées. Sans cette règle, des stations comme Clelles
      // (aucun FC) finissaient en un seul groupe géant débordant.
      const canMerge = fcs.length > 0;
      if (canMerge && current && current.fcSignals.join('|') === key) {
        current.levers.push(levers[i]);
      } else {
        if (current) result.push(current);
        current = { fcSignals: fcs, levers: [levers[i]] };
      }
    }
    if (current) result.push(current);
    return result;
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

  const fcCount = groups.reduce((acc, g) => acc + g.fcSignals.length, 0);

  // Sépare les groupes en deux rangées : la première rangée prend les
  // groupes jusqu'à atteindre la moitié des leviers, le reste va sur la
  // seconde. Un groupe partagé par un FC reste indivisible.
  const targetFirstRow = Math.ceil(levers.length / 2);
  const firstRow: Group[] = [];
  const secondRow: Group[] = [];
  let firstRowCount = 0;
  for (const g of groups) {
    if (firstRowCount < targetFirstRow) {
      firstRow.push(g);
      firstRowCount += g.levers.length;
    } else {
      secondRow.push(g);
    }
  }

  // alignItems: flex-start → on aligne les tops des groupes. Comme chaque
  // groupe a une zone FC fixe (FC_ZONE_HEIGHT), tous les boîtiers de leviers
  // démarrent au même Y. Les labels en dessous peuvent avoir des hauteurs
  // variables sans casser l'alignement.
  // Le gap entre groupes est identique au gap entre leviers d'un même groupe
  // (LEVER_GAP) pour que tous les leviers paraissent uniformément espacés.
  const rowStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: LEVER_GAP,
    alignItems: 'flex-start',
  };

  return (
    <Panel
      title="Leviers"
      meta={`${levers.length} levier${levers.length > 1 ? 's' : ''}${fcCount ? ` · ${fcCount} FC` : ''}`}
      bodyDirection="column"
      bodyGap={40}
      bodyAlign="center"
      padding={12}
    >
      <div style={rowStyle}>
        {firstRow.map((group, gi) => (
          <LeverGroup
            key={`r1-${gi}`}
            group={group}
            refusedLever={refusedLever}
            onLeverClick={handleLeverClick}
            onFcToggle={toggleCommutFC}
          />
        ))}
      </div>
      {secondRow.length > 0 && (
        <div style={rowStyle}>
          {secondRow.map((group, gi) => (
            <LeverGroup
              key={`r2-${gi}`}
              group={group}
              refusedLever={refusedLever}
              onLeverClick={handleLeverClick}
              onFcToggle={toggleCommutFC}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

// Hauteur réservée à la zone FC en haut de chaque groupe. Identique pour
// tous les groupes (avec ou sans FC) afin que les boîtiers des leviers
// s'alignent au même Y sur toute une rangée.
const FC_ZONE_HEIGHT = 56;

// Gap horizontal commun à tous les leviers — appliqué à la fois entre
// leviers d'un même groupe FC et entre groupes différents, afin que tous
// les leviers paraissent espacés uniformément.
const LEVER_GAP = 12;

function LeverGroup({
  group,
  refusedLever,
  onLeverClick,
  onFcToggle,
}: {
  group: Group;
  refusedLever: string | null;
  onLeverClick: (id: string, positionBefore: 'plus' | 'minus') => void;
  onFcToggle: (signalId: string) => void;
}) {
  const hasFc = group.fcSignals.length > 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 0,
      }}
    >
      {/* Zone FC : hauteur fixe pour aligner les leviers en dessous. */}
      <div
        style={{
          height: FC_ZONE_HEIGHT,
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'flex-end',
          gap: spacing.xs,
          paddingBottom: spacing.xs,
        }}
      >
        {hasFc &&
          group.fcSignals.map((signalId) => (
            <FcCell key={signalId} signalId={signalId} onToggle={onFcToggle} />
          ))}
      </div>
      {/* Rangée des leviers : tous les boîtiers démarrent au même Y. */}
      <div style={{ display: 'flex', gap: LEVER_GAP, alignItems: 'flex-start' }}>
        {group.levers.map((l) => (
          <Lever
            key={l.id}
            id={l.id}
            num={l.id}
            label={l.affectations.join(', ')}
            position={l.position}
            refused={refusedLever === l.id}
            onClick={() => onLeverClick(l.id, l.position)}
          />
        ))}
      </div>
    </div>
  );
}

function FcCell({
  signalId,
  onToggle,
}: {
  signalId: string;
  onToggle: (signalId: string) => void;
}) {
  // Pas de détection de refus : `toggleCommutFC` (sim/actions.ts) n'a aucune
  // garde — le commutateur FC n'est pas soumis à enclenchement dans Gessie.
  // Un clic = toggle systématique.
  const active = useGessieStore(
    (s) => Boolean(s.player.data?.affectations[signalId]?.positionFC),
  );

  return (
    <KnobButton
      id={signalId}
      active={active}
      label={signalId}
      onClick={() => onToggle(signalId)}
    />
  );
}
