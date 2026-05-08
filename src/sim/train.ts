// Actions de simulation des trains.
//
// Reproduction fidèle des actions Vuex Player de Gessie liées au mouvement
// des trains : startTrain / moveTrainIn / moveTrainOut / enterZone /
// leaveZone / releasePedale / annulationEap / annulationEpa /
// pedaleEAP / pedaleEPA / toggleDisturbance.
//
// Convention de retour :
//   - Actions purement state → (state, payload) => PlayerData
//   - Actions qui programment des events Clock → ActionResult { state, events }
//
// Tous les events programmés ont `uid: ''` ; le store appellera ensureUid()
// avant de les pousser. Les events à mettre en pause / reprendre sont
// signalés via les champs `pauseEventUids`/`resumeEventUids` dans le résultat.
//
// Comportement Gessie reproduit tel quel — y compris quelques bizarreries :
//   - direction `enterZone` toujours `pair` pour FORCAGE_OCCUPATION
//   - dans `gare-X`, "voieLibre" est settée à `A` (active) alors que la
//     mutation s'appelle SWITCH_VOIE_LIBRE_BLOC … (ce qui semble inversé).
//   - dans LEAVE_ZONE on ne touche pas circulation si disturbances.length>0.
//   - leaveZone dispatch updateTransit SANS unlockLever.

import type { ActionResult } from './actions';
import {
  closeWithFA,
  informObservers,
  setEAPOff,
  setEPAOff,
  updateAffectationPosition,
  updateTransit,
  zapOff,
  zapOn,
} from './actions';
import type {
  Affectation,
  Bloc,
  Direction,
  PlayerData,
  SimEvent,
  Train,
  TrainSize,
} from './types';

// ===== Constantes =====

/** Table fixe Gessie : durée (s) de franchissement par taille de train. */
const SIZE_TABLE: Record<TrainSize, number> = {
  Petit: 10,
  Moyen: 20,
  Grand: 30,
};

// ===== Résultat enrichi pour les actions trains =====
//
// On étend ActionResult pour signaler des opérations sur la file Clock que
// l'action ne peut pas faire elle-même (pause/resume).

export interface TrainActionResult extends ActionResult {
  /** Events à mettre en pause par uid. */
  pauseEventUids?: string[];
  /** Events à reprendre par uid. */
  resumeEventUids?: string[];
  /** Events à retirer du Clock par uid (after resume). */
  removeEventUids?: string[];
}

// ===== Helpers internes =====

function patchAffectation(
  state: PlayerData,
  affectationId: string,
  patch: Partial<Affectation>,
): PlayerData {
  const cur = state.affectations[affectationId];
  if (!cur) return state;
  return {
    ...state,
    affectations: { ...state.affectations, [affectationId]: { ...cur, ...patch } },
  };
}

function patchBloc(
  state: PlayerData,
  blocIdx: number,
  patch: Partial<Bloc>,
): PlayerData {
  if (blocIdx < 0 || blocIdx >= state.blocs.length) return state;
  const blocs = state.blocs.slice();
  blocs[blocIdx] = { ...blocs[blocIdx], ...patch };
  return { ...state, blocs };
}

// ===== Mutations privées =====

function enterZoneMutation(
  state: PlayerData,
  direction: Direction | undefined,
  zoneId: string,
): PlayerData {
  const a = state.affectations[zoneId];
  if (!a) return state;
  const patch: Partial<Affectation> = { circulation: true };
  if (direction && a.transit) {
    patch.transit = {
      ...a.transit,
      [direction]: { ...a.transit[direction], haveTransit: true },
      // Conserve l'autre direction telle quelle.
      pair: direction === 'pair' ? { ...a.transit.pair, haveTransit: true } : a.transit.pair,
      impair: direction === 'impair' ? { ...a.transit.impair, haveTransit: true } : a.transit.impair,
    };
  }
  return patchAffectation(state, zoneId, patch);
}

function leaveZoneMutation(state: PlayerData, zoneId: string): PlayerData {
  const a = state.affectations[zoneId];
  if (!a) return state;
  // Reproduction fidèle : LEAVE_ZONE ne touche pas circulation si des
  // disturbances sont présentes (FORCAGE_OCCUPATION, MAINTIEN_OCCUPATION...)
  if ((a.disturbances?.length ?? 0) !== 0) return state;
  return patchAffectation(state, zoneId, { circulation: false });
}

function setPedalePressedMutation(
  state: PlayerData,
  signalId: string,
  pedaleId: string,
  isPressed: boolean,
): PlayerData {
  const a = state.affectations[signalId];
  if (!a || !a.pedales || !a.pedales[pedaleId]) return state;
  const newPedales = {
    ...a.pedales,
    [pedaleId]: { ...a.pedales[pedaleId], pressed: isPressed },
  };
  return patchAffectation(state, signalId, { pedales: newPedales });
}

function setBlocPedalePressedMutation(
  state: PlayerData,
  gareLabel: string,
  pedaleId: string,
  isPressed: boolean,
): PlayerData {
  const idx = state.blocs.findIndex((b) => b.gareLabel === gareLabel);
  if (idx === -1) return state;
  const bloc = state.blocs[idx];
  const ped = (bloc.pedales as unknown as Record<string, { pressed?: boolean } | undefined>)[
    pedaleId
  ];
  if (!ped) return state;
  const newPedales = {
    ...(bloc.pedales as object),
    [pedaleId]: { ...ped, pressed: isPressed },
  } as Bloc['pedales'];
  return patchBloc(state, idx, { pedales: newPedales });
}

function linkEventsToControlMutation(
  state: PlayerData,
  signalId: string,
  eventsId: string[] | undefined,
): PlayerData {
  return patchAffectation(state, signalId, { linkedEvents: eventsId });
}

function setPhoneRingingMutation(state: PlayerData, ringing: boolean): PlayerData {
  return { ...state, phoneIsRinging: ringing };
}

// ===== stopPhone =====
//
// Reproduction de l'action Vuex `stopPhone` (renderer.js) :
//   stopPhone(e) { e.commit("PHONE_STATUS", { ringing: false }) }
//
// Côté UI, le bouton "raccrocher" + le watcher `phoneIsRinging` arrêtent le
// son. La sonnerie est rallumée par `setPhoneRingingMutation(true)` quand un
// train arrive devant un signal fermé (cf. `moveTrainIn`).

export function stopPhone(state: PlayerData): PlayerData {
  if (!state.phoneIsRinging) return state;
  return setPhoneRingingMutation(state, false);
}

// ===== toggleFA =====
//
// Bascule l'annulateur de Fermeture Automatique d'un signal.
//
// Reproduction fidèle de l'action Vuex `toggleFA` (renderer.js) :
//   toggleFA(e, t) {
//     var n = v.affectations[t], a = !n.annulateurFA.enabled;
//     n.epa && a === false && e.dispatch("annulationEpa", { signalId: t });
//     n.eap && a === false && e.dispatch("annulationEap", { signalId: t });
//     e.commit("CHANGE_FA_STATUS", { signalId: t, newPosition: a });
//   }
//
// Sémantique : `enabled = true` (sceau brisé) bypasse la fermeture déclenchée
// par closeWithFA (cf. `actions.ts:723`). Quand l'opérateur réenclenche le
// sceau (`a === false`), si le signal a accumulé un EPA/EAP pendant que la
// FA était désactivée, on tente de les libérer via annulationEpa/Eap (qui
// ont leurs propres gardes : levier en minus, pédale, zone…).
//
// L'ordre d'opérations Gessie (annulation* AVANT la mutation) est conservé,
// même si ni `annulationEpa` ni `annulationEap` ne consultent
// `annulateurFA.enabled` — pour rester strictement fidèle au bundle.

export function toggleFA(state: PlayerData, signalId: string): PlayerData {
  const aff = state.affectations[signalId];
  if (!aff?.annulateurFA) return state;

  const newEnabled = !aff.annulateurFA.enabled;

  let s = state;
  if (newEnabled === false) {
    if (aff.epa) s = annulationEpa(s, signalId);
    if (aff.eap) s = annulationEap(s, signalId);
  }

  // CHANGE_FA_STATUS : on relit l'affectation depuis `s` au cas où
  // annulationEpa/Eap auraient muté l'objet (setEPAOff retourne un nouvel
  // objet d'affectation).
  const cur = s.affectations[signalId];
  if (!cur?.annulateurFA) return s;
  return {
    ...s,
    affectations: {
      ...s.affectations,
      [signalId]: { ...cur, annulateurFA: { enabled: newEnabled } },
    },
  };
}

// ===== trainCanStart / forceTrainStart =====
//
// Reproduit les actions Vuex `trainCanStart` et `forceTrainStart` (renderer.js).
// Logique commune :
//   1. Filtrer les pausedEvents du train (par nom).
//   2. Trouver l'event "arrivé" : type === 'moveTrainIn' && remainingTime === 0.
//      C'est celui qui fait sonner le téléphone (signal fermé devant le train).
//   3. Reprendre TOUS les events paused du train (resume → events queue).
//   4. Retirer l'event arrivé de la queue (on va le re-jouer manuellement).
//   5. Re-jouer moveTrainIn avec `forcePassage` :
//        - false (`trainCanStart`)  : ré-évalue la garde signal. Si le signal a
//          été ouvert depuis, le train repart ; sinon il se rebloque.
//        - true  (`forceTrainStart`): bypass garde signal (`moveTrainIn` à
//          train.ts:773 fait `position === 'O' || forcePassage`). Le train
//          franchit le signal fermé — faute professionnelle simulée pour
//          l'apprentissage du geste interdit.
//
// Le store consomme le `TrainActionResult` enrichi pour orchestrer Clock
// (resume + remove + add events + nouvelles pauses).

interface TrainStartCtx {
  pausedEvents: SimEvent[];
  runningEvents: SimEvent[];
  currentTime: number;
}

function trainStartImpl(
  state: PlayerData,
  trainId: string,
  forcePassage: boolean,
  ctx: TrainStartCtx,
): TrainActionResult {
  const trainPaused = ctx.pausedEvents.filter((e) => e.train?.name === trainId);
  if (trainPaused.length === 0) return { state };

  const arrived = trainPaused.find(
    (e) => e.type === 'moveTrainIn' && (e.remainingTime ?? 0) === 0,
  );
  if (!arrived || !arrived.train || !arrived.target) return { state };

  // moveTrainIn re-joue les gardes ; il a besoin de la file d'events à jour
  // après le resume. Ici on simule le "post-resume" en ajoutant les paused
  // remontés à `runningEvents`, puis en retirant l'arrivé (qu'on re-joue).
  const resumedRunning = ctx.runningEvents.concat(
    trainPaused.filter((e) => e.uid !== arrived.uid),
  );

  const moveCtx = {
    allRunningEvents: resumedRunning,
    runningEvents: resumedRunning,
  };
  const res = moveTrainIn(
    state,
    {
      train: arrived.train,
      target: arrived.target,
      time: arrived.time ?? ctx.currentTime,
      forcePassage,
    },
    moveCtx,
  );

  return {
    state: res.state,
    events: res.events,
    pauseEventUids: res.pauseEventUids,
    // Tous les paused du train sont remontés en file ; le store les retire
    // de pausedEvents. moveTrainIn peut en repauser certains si le signal
    // est toujours fermé (pauseEventUids ci-dessus).
    resumeEventUids: trainPaused.map((e) => e.uid).filter((u): u is string => !!u),
    // L'arrivé est remontée ET retirée — `removeEventUids` est appliqué
    // après les resume côté store.
    removeEventUids: arrived.uid ? [arrived.uid] : undefined,
  };
}

export function trainCanStart(
  state: PlayerData,
  params: { trainId: string },
  ctx: TrainStartCtx,
): TrainActionResult {
  return trainStartImpl(state, params.trainId, false, ctx);
}

export function forceTrainStart(
  state: PlayerData,
  params: { trainId: string },
  ctx: TrainStartCtx,
): TrainActionResult {
  return trainStartImpl(state, params.trainId, true, ctx);
}

function addDisturbanceMutation(
  state: PlayerData,
  affectationId: string | undefined,
  blocId: string | undefined,
  disturbance: string,
): PlayerData {
  if (affectationId !== undefined) {
    const a = state.affectations[affectationId];
    if (!a) return state;
    if (a.disturbances.indexOf(disturbance) !== -1) return state;
    return patchAffectation(state, affectationId, {
      disturbances: a.disturbances.concat([disturbance]),
    });
  }
  if (blocId !== undefined) {
    const idx = state.blocs.findIndex((b) => b.id === blocId);
    if (idx === -1) return state;
    const bloc = state.blocs[idx];
    if (bloc.disturbances.indexOf(disturbance) !== -1) return state;
    return patchBloc(state, idx, { disturbances: bloc.disturbances.concat([disturbance]) });
  }
  return state;
}

function removeDisturbanceMutation(
  state: PlayerData,
  affectationId: string | undefined,
  blocId: string | undefined,
  disturbance: string,
): PlayerData {
  if (affectationId !== undefined) {
    const a = state.affectations[affectationId];
    if (!a) return state;
    return patchAffectation(state, affectationId, {
      disturbances: a.disturbances.filter((d) => d !== disturbance),
    });
  }
  if (blocId !== undefined) {
    const idx = state.blocs.findIndex((b) => b.id === blocId);
    if (idx === -1) return state;
    const bloc = state.blocs[idx];
    return patchBloc(state, idx, {
      disturbances: bloc.disturbances.filter((d) => d !== disturbance),
    });
  }
  return state;
}

// ===== startTrain =====
//
// Génère un nom unique numérique : à partir de 4000, on incrémente jusqu'à
// trouver un nombre absent du pool de noms en cours ET ayant la bonne parité
// (pair/impair correspond à direction).
//
// Programme un moveTrainIn immédiat à `currentTime` sur `startingPoint`.

export function startTrain(
  state: PlayerData,
  payload: { train: Train; existingTrainNames: string[]; currentTime: number },
): TrainActionResult {
  const { train: incomingTrain, existingTrainNames, currentTime } = payload;
  // Trouve le premier nombre >= 4000 qui n'est pas déjà pris ET dont la parité
  // correspond à la direction. Boucle Gessie d'origine :
  //   while (existing.includes(o) || o%2 == (direction==='pair' ? 1 : 0)) o++
  let o = 4000;
  while (true) {
    const name = String(o);
    const wantedParity = incomingTrain.direction === 'pair' ? 1 : 0;
    const conflict =
      existingTrainNames.indexOf(name) !== -1 ||
      o % 2 === wantedParity;
    if (!conflict) break;
    o += 1;
  }
  const train: Train = { ...incomingTrain, name: String(o) };
  const evt: SimEvent = {
    uid: '',
    time: currentTime,
    type: 'moveTrainIn',
    train,
    target: train.startingPoint,
  };
  return { state, events: [evt] };
}

// ===== moveTrainOut =====
//
// Quand un train sort d'un point :
//   - Si la cible est une zone → leaveZone
//   - Reprend tout moveTrainIn paused dont target === ce point ET
//     remainingTime <= 0 (= train suiveur qui était bloqué derrière).

export function moveTrainOut(
  state: PlayerData,
  payload: { train: Train; target: string; pausedEvents: SimEvent[] },
): TrainActionResult {
  const { train, target, pausedEvents } = payload;
  const targetAff = state.affectations[target];
  let s = state;
  if (targetAff?.type === 'zone') {
    s = leaveZone(s, { direction: train.direction, zoneId: target });
  }
  // Trouver le moveTrainIn paused (un seul, comme dans Gessie).
  const found = pausedEvents.find(
    (e) =>
      e.type === 'moveTrainIn' &&
      e.target === target &&
      (e.remainingTime ?? Infinity) <= 0,
  );
  return {
    state: s,
    resumeEventUids: found ? [found.uid] : undefined,
  };
}

// ===== enterZone =====

export function enterZone(
  state: PlayerData,
  payload: { direction?: Direction; zoneId: string },
): PlayerData {
  const { direction, zoneId } = payload;
  let s = enterZoneMutation(state, direction, zoneId);
  const o = s.affectations[zoneId];
  if (!o) return s;
  if (o.observers) s = informObservers(s, o.observers);
  if (o.faTrigger) {
    for (const sigId of o.faTrigger) {
      s = closeWithFA(s, sigId);
    }
  }
  if (o.zapDeclenchees) {
    for (const sigId of o.zapDeclenchees) {
      s = zapOn(s, { signalId: sigId, zoneId });
    }
  }
  if (o.eapAnnulation) {
    for (const sigId of o.eapAnnulation) {
      s = annulationEap(s, sigId);
    }
  }
  if (o.epaAnnulation) {
    for (const sigId of o.epaAnnulation) {
      s = annulationEpa(s, sigId);
    }
  }
  // Note : Gessie n'appelle PAS updateTransit ici (contrairement à ce qu'on
  // pourrait lire ; vérifié dans le bundle) — les zones aval ne sont mises à
  // jour qu'au moment du sendTransit ou du leaveZone.
  return s;
}

// ===== leaveZone =====

export function leaveZone(
  state: PlayerData,
  payload: { direction: Direction; zoneId: string },
): PlayerData {
  const { direction, zoneId } = payload;
  const i = state.affectations[zoneId];
  if (!i) return state;
  // Reproduction fidèle : si disturbance présente, on bail tôt (LEAVE_ZONE
  // ne s'applique pas, et tout le reste non plus).
  if (i.disturbances.length !== 0) return state;
  let s = leaveZoneMutation(state, zoneId);
  const post = s.affectations[zoneId];
  if (post?.observers) s = informObservers(s, post.observers);
  if (post?.zapRetirees) {
    for (const sigId of post.zapRetirees) {
      s = zapOff(s, sigId);
    }
  }
  // Gessie : updateTransit sans unlockLever (= unlockLever undefined → false)
  s = updateTransit(s, { direction, zoneId });
  return s;
}

// ===== annulationEap =====
//
// Cherche l'annulation dont le levier est en minus. Si trouvée, et qu'aucune
// condition bloquante (FA en O, pédale non pressée, zone non occupée), on
// commit SET_EAP_OFF.

export function annulationEap(state: PlayerData, signalId: string): PlayerData {
  const o = state.affectations[signalId];
  if (!o || !o.eap) return state;
  const annulList = Object.values(o.eap.annulation ?? {});
  const r = annulList.find((e) => {
    const lever = e.lever ? state.levers[e.lever] : undefined;
    return lever && lever.position === 'minus';
  });
  if (!r) return state;
  // r.fa && o.position === 'O' → bloque
  if (r.fa && o.position === 'O') return state;
  // r.pedale && pedale EAP non pressée → bloque
  if (r.pedale && !o.pedales?.EAP?.pressed) return state;
  // r.zone définie → la zone doit être en circulation
  if (r.zone) {
    const z = state.affectations[r.zone];
    if (!z?.circulation) return state;
  }
  return setEAPOff(state, signalId);
}

// ===== annulationEpa =====
//
// Idem annulationEap mais sur l'EPA.

export function annulationEpa(state: PlayerData, signalId: string): PlayerData {
  const o = state.affectations[signalId];
  if (!o || !o.epa) return state;
  const annulList = Object.values(o.epa.annulation ?? {});
  const r = annulList.find((e) => {
    const lever = e.lever ? state.levers[e.lever] : undefined;
    return lever && lever.position === 'minus';
  });
  if (!r) return state;
  if (r.fa && o.position === 'O') return state;
  if (r.pedale && !o.pedales?.EPA?.pressed) return state;
  if (r.zone) {
    const z = state.affectations[r.zone];
    if (!z?.circulation) return state;
  }
  return setEPAOff(state, signalId);
}

// ===== pedaleEAP / pedaleEPA =====
//
// Action déclenchée quand un train passe sur une pédale EAP/EPA.
// Reproduit l'effet "pressPedale" pour ces deux types : marque la pédale
// pressed puis dispatche annulationEap / annulationEpa.

export function pedaleEAP(state: PlayerData, signalId: string): PlayerData {
  let s = setPedalePressedMutation(state, signalId, 'EAP', true);
  s = annulationEap(s, signalId);
  return s;
}

export function pedaleEPA(state: PlayerData, signalId: string): PlayerData {
  let s = setPedalePressedMutation(state, signalId, 'EPA', true);
  s = annulationEpa(s, signalId);
  return s;
}

// ===== releasePedale =====
//
// Handler de l'event programmé par moveTrainIn quand le train passe sur une
// pédale (FA / EAP / EPA / Proxi). Toggle simple pressed:false.

export function releasePedale(
  state: PlayerData,
  payload: { signalId: string; pedaleId: string },
): PlayerData {
  const { signalId, pedaleId } = payload;
  const a = state.affectations[signalId];
  if (!a || !a.pedales) return state;
  const ped = a.pedales[pedaleId];
  if (!ped || !ped.pressed) return state;
  return setPedalePressedMutation(state, signalId, pedaleId, false);
}

// ===== pressPedale (helper interne pour moveTrainIn) =====
//
// Marque la pédale pressed puis déclenche le side-effect attendu :
//   - FA → closeWithFA
//   - EPA → annulationEpa
//   - EAP → annulationEap
//   - Proxi : pas de side-effect (juste presse)

function pressPedale(
  state: PlayerData,
  signalId: string,
  pedaleId: string,
): PlayerData {
  const a = state.affectations[signalId];
  if (!a || !a.pedales || !a.pedales[pedaleId]) return state;
  if (a.pedales[pedaleId].pressed) return state;
  let s = setPedalePressedMutation(state, signalId, pedaleId, true);
  if (pedaleId === 'FA') s = closeWithFA(s, signalId);
  else if (pedaleId === 'EPA') s = annulationEpa(s, signalId);
  else if (pedaleId === 'EAP') s = annulationEap(s, signalId);
  return s;
}

// ===== toggleDisturbance =====
//
// Ajoute ou retire une disturbance + side-effects :
//   - ajout :
//     - FORCAGE_OCCUPATION → enterZone direction:pair (bizarre mais Gessie)
//     - ABSENCE_CONTROLE_* → updateAffectationPosition (re-applique pour
//       provoquer le passage en lower-case via applyDisturbances)
//     - NON_LIBERATION_ZAP/EAP/EPA → force le flag visible directement
//       (eap.zap/eap.eap/epa.epa = true). Divergence volontaire avec Gessie
//       qui n'allume rien à l'ajout — on rend l'avarie immédiatement visible
//       pour l'opérateur en formation.
//   - retrait :
//     - FORCAGE_OCCUPATION / MAINTIEN_OCCUPATION : si pas de moveTrainOut
//       en cours sur cette zone → leaveZone pair + leaveZone impair
//     - NON_LIBERATION_ZAP/EAP/EPA → éteint le flag directement (Gessie
//       passe par zapOff/annulationEap/Epa qui ont des gardes train —
//       inopérantes ici puisqu'on a forcé l'avarie hors passage).
//     - ABSENCE_CONTROLE_* → updateAffectationPosition (idem)
//     - RATE_OUVERTURE/FERMETURE → updateAffectationPosition avec
//       requestedPosition (divergence : Gessie laisse le carré dans son
//       état figé jusqu'au prochain mouvement de levier).
//
// Pour les blocs : add/remove uniquement (pas de side-effect dans Gessie).

export function toggleDisturbance(
  state: PlayerData,
  payload: {
    affectationId?: string;
    blocId?: string;
    disturbance: string;
    runningEvents?: SimEvent[];
  },
): PlayerData {
  const { affectationId, blocId, disturbance, runningEvents = [] } = payload;
  if (affectationId !== undefined) {
    const s0 = state.affectations[affectationId];
    if (!s0) return state;
    const wasPresent = s0.disturbances.indexOf(disturbance) !== -1;
    if (!wasPresent) {
      let s = addDisturbanceMutation(state, affectationId, undefined, disturbance);
      if (disturbance === 'FORCAGE_OCCUPATION') {
        s = enterZone(s, { zoneId: affectationId, direction: 'pair' });
      } else if (disturbance.indexOf('ABSENCE_CONTROLE_') !== -1) {
        s = updateAffectationPosition(s, {
          affectationId,
          position: (s0.position ?? '').toUpperCase(),
        });
      } else if (disturbance === 'NON_LIBERATION_ZAP' && s0.eap) {
        // Divergence Gessie volontaire : Gessie n'allume pas la ZAP à l'ajout,
        // donc l'avarie reste invisible jusqu'au prochain passage train. Pour
        // qu'un opérateur en formation voie immédiatement le symptôme on force
        // `eap.zap = true` (= ZAP active visuellement). Le retrait passe par
        // zapOff qui no-op si NON_LIBERATION_ZAP est encore présent ; ici on
        // l'a déjà retiré, donc le retrait éteindra la ZAP normalement.
        s = patchAffectation(s, affectationId, { eap: { ...s0.eap, zap: true } });
      } else if (disturbance === 'NON_LIBERATION_EAP' && s0.eap) {
        // Idem ZAP : on force `eap.eap = true` pour rendre l'avarie visible.
        s = patchAffectation(s, affectationId, { eap: { ...s0.eap, eap: true } });
      } else if (disturbance === 'NON_LIBERATION_EPA' && s0.epa) {
        // Idem : on force `epa.epa = true` pour rendre l'avarie visible.
        s = patchAffectation(s, affectationId, { epa: { ...s0.epa, epa: true } });
      }
      return s;
    }
    // Retrait
    let s = removeDisturbanceMutation(state, affectationId, undefined, disturbance);
    if (disturbance === 'FORCAGE_OCCUPATION' || disturbance === 'MAINTIEN_OCCUPATION') {
      const blocked = runningEvents.find(
        (e) => e.type === 'moveTrainOut' && e.target === affectationId,
      );
      if (!blocked) {
        s = leaveZone(s, { zoneId: affectationId, direction: 'pair' });
        s = leaveZone(s, { zoneId: affectationId, direction: 'impair' });
      }
    } else if (disturbance === 'NON_LIBERATION_ZAP') {
      // Divergence Gessie : Gessie passe par zapOff qui bloque si aucune zone
      // de la consistance n'est en circulation (= cas usuel hors passage train).
      // Comme l'ajout forçait `eap.zap=true` sans train, on doit pouvoir le
      // libérer dans les mêmes conditions. On éteint directement (la disturbance
      // est déjà retirée donc setZapOffMutation passerait, mais le wrapper
      // zapOff la bloque). On réplique aussi sa cascade EAP→false.
      const cur = s.affectations[affectationId];
      if (cur?.eap) {
        const newEap = { ...cur.eap, zap: false };
        if (cur.disturbances.indexOf('NON_LIBERATION_EAP') === -1) newEap.eap = false;
        s = patchAffectation(s, affectationId, { eap: newEap });
      }
    } else if (disturbance === 'NON_LIBERATION_EAP') {
      // Idem : annulationEap a 4 gardes (levier minus, pédale pressée, zone
      // occupée, FA…) qui bloquent hors passage train. On éteint directement.
      const cur = s.affectations[affectationId];
      if (cur?.eap) {
        s = patchAffectation(s, affectationId, { eap: { ...cur.eap, eap: false } });
      }
    } else if (disturbance === 'NON_LIBERATION_EPA') {
      // Idem annulationEpa.
      const cur = s.affectations[affectationId];
      if (cur?.epa) {
        s = patchAffectation(s, affectationId, { epa: { ...cur.epa, epa: false } });
      }
    } else if (disturbance.indexOf('ABSENCE_CONTROLE_') === 0) {
      s = updateAffectationPosition(s, {
        affectationId,
        position: (s0.position ?? '').toUpperCase(),
      });
    } else if (disturbance === 'RATE_OUVERTURE' || disturbance === 'RATE_FERMETURE') {
      // Divergence Gessie volontaire : Gessie ne re-évalue pas la position
      // au retrait du raté, donc un carré ouvert via levier reste fermé tant
      // qu'on ne rebascule pas le levier. On force la ré-application de
      // `requestedPosition` (= ce que demandait le levier au moment du raté)
      // pour que le signal reflète l'état réel des enclenchements.
      const req = s0.requestedPosition;
      if (req) {
        s = updateAffectationPosition(s, { affectationId, position: req });
      }
    }
    return s;
  }
  if (blocId !== undefined) {
    // Note : Gessie résout aussi blocId par gareLabel si non trouvé numérique.
    let resolvedId: string | undefined = blocId;
    if (!state.blocs.find((b) => b.id === blocId)) {
      const byLabel = state.blocs.find((b) => b.gareLabel === blocId);
      if (byLabel) resolvedId = byLabel.id;
    }
    if (!resolvedId) return state;
    const bloc = state.blocs.find((b) => b.id === resolvedId);
    if (!bloc) return state;
    if (bloc.disturbances.indexOf(disturbance) === -1) {
      return addDisturbanceMutation(state, undefined, resolvedId, disturbance);
    }
    return removeDisturbanceMutation(state, undefined, resolvedId, disturbance);
  }
  return state;
}

// ===== moveTrainIn =====
//
// La grosse action. Reproduit le module Vuex Player.moveTrainIn (renderer.js
// @230311+).
//
// Étapes :
//   1. Si un moveTrainOut existe déjà sur la cible : pause tous les events
//      du train (collision avec le train précédent) → return.
//   2. Si scenarioTargets[target][train.name] existe → toggleDisturbance.
//   3. Branchement selon le préfixe/forme de `target` :
//      - "X-pédale Y" : presse la pédale Y de X, programme un releasePedale
//        à `time + 1000*sizeTable[size]/speed`. r = pedales[Y].nextEncounter[dir].
//        Cas spécial : X est un nom de gare (gareLabel) → pressBlocPedale.
//      - préfixe "gare-" : logique cantonnement (annonce/voie libre/reddition
//        selon parité de la direction et position du bloc). r = aff.nextEncounter[dir].
//      - autre :
//        - si type === "zone" → enterZone (avant la 2e switch)
//        - puis selon type :
//          - aiguille : r = nextEncounter[dir][position.toUpperCase()]
//          - controle : si "O" ou forcePassage → r = nextEncounter[dir]
//                       sinon → phoneIsRinging:true, pause tous events train,
//                       LINK_EVENTS_TO_CONTROL → return
//          - zone : si pas de ARRET_TRAIN ou forcePassage → r = nextEncounter[dir]
//                   sinon → pause tous events train → return
//          - default : r = nextEncounter[dir]
//        - aff.events[train.name] : dispatch type/options spécifié
//        - si type ∈ {zone, controle} → programme moveTrainOut à
//          `time + 1000*sizeTable[size]/speed`
//   4. Si r défini → programme moveTrainIn(target=r.id) à
//      `time + 1000*r.timeDistance/speed`.

interface MoveTrainInContext {
  /** events.concat(pausedEvents) : pour détecter collision moveTrainOut. */
  allRunningEvents: SimEvent[];
  /** events seulement (running) : pour pause d'events du train. */
  runningEvents: SimEvent[];
}

export function moveTrainIn(
  state: PlayerData,
  payload: {
    train: Train;
    target: string;
    time: number;
    forcePassage?: boolean;
  },
  ctx: MoveTrainInContext,
): TrainActionResult {
  const { train, target, time, forcePassage } = payload;
  const { allRunningEvents, runningEvents } = ctx;
  const events: SimEvent[] = [];

  // 1. Collision : un moveTrainOut existe déjà sur cette cible → pause.
  if (
    !forcePassage &&
    allRunningEvents.find((e) => e.type === 'moveTrainOut' && e.target === target)
  ) {
    const pauseUids = runningEvents
      .filter((e) => e.train && e.train.name === train.name)
      .map((e) => e.uid);
    return { state, pauseEventUids: pauseUids };
  }

  // 2. Avarie scénarisée.
  let s = state;
  const sceneTargets = s.scenarioTargets[target];
  if (sceneTargets) {
    const dist = sceneTargets[train.name];
    if (dist) {
      // Gessie passe l'objet { affectationId/blocId, disturbance } directement.
      // On accepte une string seule (formattedType) — Gessie passe un OBJET ;
      // ici on est lax et on accepte aussi une string.
      if (typeof dist === 'string') {
        s = toggleDisturbance(s, {
          affectationId: target,
          disturbance: dist,
          runningEvents: allRunningEvents,
        });
      } else {
        s = toggleDisturbance(s, {
          ...(dist as { affectationId?: string; blocId?: string; disturbance: string }),
          runningEvents: allRunningEvents,
        });
      }
    }
  }

  // 3. Branchement par cible.
  // 3a. "X-pédale Y" — string Gessie utilise le caractère é (\xE9).
  if (target.indexOf('-pédale') !== -1) {
    const [x, y] = target.split('-pédale ');
    const sigOrItem = s.affectations[x];
    let nextEncounter:
      | { id: string; timeDistance: number }
      | undefined;
    if (sigOrItem) {
      s = pressPedale(s, x, y);
      if (['FA', 'EAP', 'EPA', 'Proxi'].indexOf(y) !== -1) {
        events.push({
          uid: '',
          time: time + (1000 * SIZE_TABLE[train.size]) / train.speed,
          type: 'releasePedale',
          train,
          signalId: x,
          pedaleId: y,
        } as SimEvent);
      }
      nextEncounter = sigOrItem.pedales?.[y]?.nextEncounter?.[train.direction];
    } else {
      // Pédale de bloc (cantonnement)
      const bloc = s.blocs.find((b) => b.gareLabel === x);
      if (bloc) {
        s = setBlocPedalePressedMutation(s, x, y, true);
        const ped = (
          bloc.pedales as unknown as Record<
            string,
            { pressed?: boolean; nextEncounter?: Record<Direction, { id: string; timeDistance: number }> } | undefined
          >
        )[y];
        nextEncounter = ped?.nextEncounter?.[train.direction];
      }
    }
    return scheduleNextMoveIn(s, train, time, nextEncounter, events);
  }

  // 3b. "gare-X" : cantonnement.
  if (target.indexOf('gare-') !== -1) {
    const aff = s.affectations[target];
    const k = target.slice(5); // après "gare-"
    const blocIdx = s.blocs.findIndex((b) => b.gareLabel === k);
    if (blocIdx !== -1) {
      const bloc = s.blocs[blocIdx];
      // Logique parité Gessie :
      // - bloc côté droite + train impair OU bloc côté gauche + train pair :
      //   "ANCIEN BLOC" (annonce → voie libre)
      //   - si annonce==='A' && pas NON_RECEPTION_VOIE_LIBRE :
      //     → voieLibre='A', annonce='E'
      // - sinon :
      //   - si pas NON_RECEPTION_ANNONCE → reddition='A'
      const isAncien =
        (bloc.position === 'droite' && train.direction === 'impair') ||
        (bloc.position === 'gauche' && train.direction === 'pair');
      if (isAncien) {
        if (bloc.annonce === 'A' && bloc.disturbances.indexOf('NON_RECEPTION_VOIE_LIBRE') === -1) {
          s = patchBloc(s, blocIdx, { voieLibre: 'A', annonce: 'E' });
        }
      } else {
        if (bloc.disturbances.indexOf('NON_RECEPTION_ANNONCE') === -1) {
          s = patchBloc(s, blocIdx, { reddition: 'A' });
        }
      }
    }
    const nextEncounter = aff?.nextEncounter?.[train.direction] as
      | { id: string; timeDistance: number }
      | undefined;
    return scheduleNextMoveIn(s, train, time, nextEncounter, events);
  }

  // 3c. Cas générique : aiguille / controle / zone.
  const aff = s.affectations[target];
  if (!aff) {
    // Cible inconnue : on ne reschedule rien (échec silencieux).
    return { state: s, events };
  }
  // Si zone → enterZone AVANT la décision (Gessie : switch ouvert sans break).
  if (aff.type === 'zone') {
    s = enterZone(s, { direction: train.direction, zoneId: target });
  }

  let r: { id: string; timeDistance: number } | undefined;
  const blocked = false;

  // Re-lookup après enterZone (l'aff peut avoir changé via mutations).
  const aff2 = s.affectations[target] ?? aff;
  switch (aff2.type) {
    case 'aiguille': {
      const pos = (aff2.position ?? '').toUpperCase() as 'G' | 'D';
      const ne = aff2.nextEncounter?.[train.direction] as
        | { G?: { id: string; timeDistance: number }; D?: { id: string; timeDistance: number } }
        | undefined;
      r = ne?.[pos];
      break;
    }
    case 'controle': {
      if (aff2.position === 'O' || forcePassage) {
        r = aff2.nextEncounter?.[train.direction] as
          | { id: string; timeDistance: number }
          | undefined;
      } else {
        // Train arrêté au signal : phone ringing + pause + link.
        s = setPhoneRingingMutation(s, true);
        const trainEventUids = runningEvents
          .filter((e) => e.train && e.train.name === train.name)
          .map((e) => e.uid);
        s = linkEventsToControlMutation(s, target, trainEventUids);
        return { state: s, events, pauseEventUids: trainEventUids };
      }
      break;
    }
    case 'zone': {
      if (aff2.disturbances.indexOf('ARRET_TRAIN') === -1 || forcePassage) {
        r = aff2.nextEncounter?.[train.direction] as
          | { id: string; timeDistance: number }
          | undefined;
      } else {
        const trainEventUids = runningEvents
          .filter((e) => e.train && e.train.name === train.name)
          .map((e) => e.uid);
        return { state: s, events, pauseEventUids: trainEventUids };
      }
      break;
    }
    default: {
      r = aff2.nextEncounter?.[train.direction] as
        | { id: string; timeDistance: number }
        | undefined;
      break;
    }
  }
  void blocked;

  // aff.events[train.name] : action scénarisée. Gessie (renderer.js @232298) :
  //   if (l.events && l.events[train.name])
  //     dispatch(l.events[train.name].type, l.events[train.name].options);
  // On émet l'action comme un SimEvent immédiat (time = currentTime) — il
  // sera dispatché au prochain processCheckEvents. Le type doit matcher un
  // handler de dispatchPlayerEvent (toggleDisturbance, closeWithFA, etc.).
  const scenarizedEvent = aff2.events?.[train.name];
  if (scenarizedEvent) {
    events.push({
      uid: '',
      time,
      type: scenarizedEvent.type,
      ...(scenarizedEvent.options ?? {}),
    } as SimEvent);
  }

  // Programme un moveTrainOut si type ∈ {zone, controle}.
  if (aff2.type === 'zone' || aff2.type === 'controle') {
    events.push({
      uid: '',
      time: time + (1000 * SIZE_TABLE[train.size]) / train.speed,
      type: 'moveTrainOut',
      train,
      target,
    } as SimEvent);
  }

  return scheduleNextMoveIn(s, train, time, r, events);
}

/**
 * Helper : si nextEncounter défini, programme un nouveau moveTrainIn.
 */
function scheduleNextMoveIn(
  state: PlayerData,
  train: Train,
  time: number,
  nextEncounter: { id: string; timeDistance: number } | undefined,
  events: SimEvent[],
): TrainActionResult {
  if (nextEncounter) {
    events.push({
      uid: '',
      time: time + (1000 * nextEncounter.timeDistance) / train.speed,
      type: 'moveTrainIn',
      train,
      target: nextEncounter.id,
    } as SimEvent);
  }
  return { state, events };
}
