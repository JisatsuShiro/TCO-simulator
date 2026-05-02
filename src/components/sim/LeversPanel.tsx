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
import type { Affectation, Lever as LeverType } from '../../sim/types';
import { LeverKeyholeStrip, AuxiliaryKeysColumn } from './KeysPanel';

interface Group {
  /** Liste des signalIds FC qui couvrent tous les leviers du groupe. */
  fcSignals: string[];
  levers: LeverType[];
}

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
 * Construit les groupes FC à partir d'une liste de leviers : on regroupe
 * les leviers consécutifs partageant exactement le même ensemble de
 * signaux FC. Les leviers sans FC sont laissés en groupes solo.
 */
function buildFcGroups(
  levers: LeverType[],
  affectations: Record<string, Affectation>,
): Group[] {
  const fcsByLever = levers.map((l) =>
    l.affectations
      .filter((aff) => affectations[aff]?.positionFC !== undefined)
      .sort(),
  );
  const result: Group[] = [];
  let current: Group | null = null;
  for (let i = 0; i < levers.length; i++) {
    const fcs = fcsByLever[i];
    const key = fcs.join('|');
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

  // Groupes FC : seuls les contrôles peuvent partager un commutateur FC.
  const controleGroups = useMemo<Group[]>(() => {
    if (!data) return [];
    return buildFcGroups(controleLevers, data.affectations);
  }, [data, controleLevers]);

  // Aiguilles : pas de FC, donc chaque levier est son propre groupe solo.
  // On garde la même structure pour mutualiser le rendu LeverGroup.
  const aiguilleGroups = useMemo<Group[]>(
    () => aiguilleLevers.map((l) => ({ fcSignals: [], levers: [l] })),
    [aiguilleLevers],
  );

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

  const fcCount =
    controleGroups.reduce((acc, g) => acc + g.fcSignals.length, 0) +
    aiguilleGroups.reduce((acc, g) => acc + g.fcSignals.length, 0);

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
      bodyDirection="row"
      bodyGap={spacing.md}
      bodyAlign="start"
      padding={12}
    >
      {/* Zone principale : leviers de contrôle à gauche, leviers d'aiguille
          à droite — convention PRS classique où l'opérateur lit les
          itinéraires (aiguilles) près des sorties de la grille TCO et garde
          les commandes auxiliaires (contrôles) à part. Les deux sous-zones
          sont englobées dans un wrapper flex pour que la colonne auxiliaire
          de droite (boîtes à clés / cadenas / verrous centraux) reste
          alignée à droite du panel et ne passe pas sous les leviers. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 40,
          alignItems: 'flex-start',
          flex: 1,
          minWidth: 0,
          flexWrap: 'wrap',
        }}
      >
        {controleGroups.length > 0 && (
          <div style={rowStyle}>
            {controleGroups.map((group, gi) => (
              <LeverGroup
                key={`c-${gi}`}
                group={group}
                refusedLever={refusedLever}
                onLeverClick={handleLeverClick}
                onFcToggle={toggleCommutFC}
              />
            ))}
          </div>
        )}
        {aiguilleGroups.length > 0 && (
          <div style={rowStyle}>
            {aiguilleGroups.map((group, gi) => (
              <LeverGroup
                key={`a-${gi}`}
                group={group}
                refusedLever={refusedLever}
                onLeverClick={handleLeverClick}
                onFcToggle={toggleCommutFC}
              />
            ))}
          </div>
        )}
      </div>

      {/* Colonne droite : boîtes à clés / cadenas / verrous centraux.
          Retourne null automatiquement si aucun de ces éléments n'existe. */}
      <AuxiliaryKeysColumn />
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
      {/* Rangée des leviers : tous les boîtiers démarrent au même Y.
          Les serrures du levier sont rendues DANS la plaque (slot
          `keyholeSlot`) pour reproduire le visuel d'un poste PRS réel
          où les serrures sont fixées sur la plaque métallique. */}
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
            keyholeSlot={<LeverKeyholeStrip leverId={l.id} embedded />}
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
