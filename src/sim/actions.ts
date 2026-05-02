// Actions métier de la simulation Gessie.
//
// Reproduction fidèle des actions Vuex du module Player (renderer.js).
// Chaque action prend `state: PlayerData` (immutable, on retourne le nouveau
// state) et son payload, et applique des gardes-clauses + mutations.
//
// Conventions Gessie :
//   - Échec silencieux : si une garde n'est pas satisfaite, on `return state`
//     sans rien changer (pas de feedback UX au refus, pas de file d'attente).
//   - Side-effects : certaines actions chaînent vers d'autres actions
//     (sendTransit, zapOn, etc.). On reproduit ce graphe.
//   - Cascade d'actions : on enchaîne en passant l'état par les fonctions ;
//     pas de récursion infinie possible car les conditions de re-dispatch
//     (`position === 'O' || requestedPosition === 'O'`) ne se déclenchent
//     que si l'observer veut s'ouvrir.
//
// Le `addEvent` programmé par `cancelEPA` est retourné dans la valeur de
// retour (ActionResult) ; le store l'ajoute à la file Clock.

import type {
  Affectation,
  Bloc,
  Lever,
  PlayerData,
  SignalDirection,
  SimEvent,
} from './types';

// ===== Helpers internes =====

/**
 * Itère les valeurs de `levers` indexée par leverId.
 */
function getLever(state: PlayerData, leverId: string): Lever | undefined {
  return state.levers[leverId];
}

/**
 * Renvoie un nouvel état avec une affectation modifiée.
 */
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

/**
 * Renvoie un nouvel état avec un bloc modifié (lookup par id, no-op si absent).
 */
function patchBloc(
  state: PlayerData,
  blocId: string,
  patch: Partial<Bloc>,
): PlayerData {
  const idx = state.blocs.findIndex((b) => b.id === blocId);
  if (idx < 0) return state;
  const blocs = state.blocs.slice();
  blocs[idx] = { ...blocs[idx], ...patch };
  return { ...state, blocs };
}

/**
 * Récupère la zone par ID en testant aussi le préfixe "z " (les itinéraires
 * Gessie peuvent référencer "1" ou "z 1" indistinctement selon les annexes).
 */
function getZoneAffect(state: PlayerData, zoneId: string): Affectation | undefined {
  return state.affectations[zoneId] ?? state.affectations['z ' + zoneId];
}

/**
 * Trouve la direction "active" d'une affectation signal/contrôle : celle dont
 * tous les leviers sont en position "plus" (au repos).
 */
function findActiveDirection(
  state: PlayerData,
  affect: Affectation,
): SignalDirection | undefined {
  if (!affect.directions || affect.directions.length === 0) return undefined;
  return affect.directions.find(
    (d) =>
      d.leverList.findIndex((l) => state.levers[l]?.position === 'plus') === -1,
  );
}

// ===== Result type =====
//
// Certaines actions (cancelEPA notamment) doivent programmer des events Clock.
// Le store les récupère dans `events` après l'appel.

export interface ActionResult {
  state: PlayerData;
  events?: SimEvent[];
  /**
   * Predicate identifiant les events Clock à retirer (ex: toggleCommutFC qui
   * débloque un signal annule un setEPAOff en attente). Le store filtre
   * `clock.events.concat(pausedEvents)` avec ce prédicat.
   */
  removeEvents?: (event: SimEvent) => boolean;
}

// ===== updateLeverPosition (mutation simple) =====

export function updateLeverPosition(
  state: PlayerData,
  leverId: string,
  newPosition: 'plus' | 'minus',
): PlayerData {
  const lever = state.levers[leverId];
  if (!lever) return state;
  return {
    ...state,
    levers: {
      ...state.levers,
      [leverId]: { ...lever, position: newPosition },
    },
  };
}

// ===== UPDATE_AFFECTATION_POSITION mutation =====
//
// Applique les disturbances ABSENCE_CONTROLE_*, RATE_OUVERTURE/FERMETURE
// (transformation O↔F ou G/D → g/d). Cas spécial des aiguilles fusionnées.

function applyDisturbances(affect: Affectation, position: string): string {
  const dist = affect.disturbances;
  if (dist.indexOf('RATE_OUVERTURE') !== -1 && position === 'O') return 'F';
  if (dist.indexOf('RATE_FERMETURE') !== -1 && position === 'F') return 'O';
  if (dist.indexOf('ABSENCE_CONTROLE_GAUCHE') !== -1 && position === 'G') return 'g';
  if (dist.indexOf('ABSENCE_CONTROLE_DROITE') !== -1 && position === 'D') return 'd';
  if (dist.indexOf('ABSENCE_CONTROLE_COMPLET') !== -1) return position.toLowerCase();
  return position;
}

/** UPDATE_AFFECTATION_POSITION (mutation Gessie). */
export function updateAffectationPositionMutation(
  state: PlayerData,
  affectationId: string,
  position: string,
  requestedPosition?: string,
): PlayerData {
  const req = requestedPosition ?? position;

  // Cas spécial : aiguilles fusionnées "Ag1_2" → on update les deux
  let ids: string[];
  if (affectationId.startsWith('Ag') && affectationId.indexOf('_') !== -1) {
    const tail = affectationId.slice(2);
    const [a, b] = tail.split('_');
    ids = [`Ag${a}`, `Ag${b}`];
  } else {
    ids = [affectationId];
  }

  const affectations = { ...state.affectations };
  for (const id of ids) {
    const a = affectations[id];
    if (!a) continue;
    const finalPos = applyDisturbances(a, position);
    affectations[id] = { ...a, position: finalPos, requestedPosition: req };
  }
  return { ...state, affectations };
}

// ===== Mutations Transit / EAP / EPA / Zap =====

function sendTransitMutation(
  state: PlayerData,
  direction: 'pair' | 'impair',
  itineraire: string[],
): PlayerData {
  const affectations = { ...state.affectations };
  let prev: string | false = false;
  for (const p of itineraire) {
    const u = affectations[p];
    if (!u || !u.transit) continue;
    if (prev) {
      const prevA = affectations[prev];
      if (prevA && prevA.transit) {
        affectations[prev] = {
          ...prevA,
          transit: {
            ...prevA.transit,
            [direction]: { ...prevA.transit[direction], nextZone: p },
          },
        };
      }
    }
    affectations[p] = {
      ...u,
      transit: {
        ...u.transit,
        [direction]: {
          ...u.transit[direction],
          lockedByLever: true,
          haveTransit: true,
          prevZone: prev,
        },
      },
    };
    prev = p;
  }
  return { ...state, affectations };
}

function updateTransitMutation(
  state: PlayerData,
  direction: 'pair' | 'impair',
  zoneId: string,
  unlockLever: boolean,
): PlayerData {
  const s = state.affectations[zoneId];
  if (!s || !s.transit) return state;
  const prevId = s.transit[direction].prevZone;
  const r = prevId ? state.affectations[prevId] : undefined;
  const newLocked = unlockLever ? false : s.transit[direction].lockedByLever;
  const newHaveTransit =
    (!unlockLever && s.transit[direction].lockedByLever) ||
    (!s.atr && !!s.circulation) ||
    (r && r.transit ? !!r.transit[direction].haveTransit : false);
  return {
    ...state,
    affectations: {
      ...state.affectations,
      [zoneId]: {
        ...s,
        transit: {
          ...s.transit,
          [direction]: {
            ...s.transit[direction],
            lockedByLever: newLocked,
            haveTransit: newHaveTransit,
          },
        },
      },
    },
  };
}

function setZapOnMutation(state: PlayerData, signalId: string): PlayerData {
  const a = state.affectations[signalId];
  if (!a || !a.eap) return state;
  return patchAffectation(state, signalId, { eap: { ...a.eap, zap: true } });
}

function setZapOffMutation(state: PlayerData, signalId: string): PlayerData {
  const a = state.affectations[signalId];
  if (!a || !a.eap) return state;
  if (a.disturbances.indexOf('NON_LIBERATION_ZAP') !== -1) return state;
  const newEap = { ...a.eap, zap: false };
  if (a.disturbances.indexOf('NON_LIBERATION_EAP') === -1) newEap.eap = false;
  return patchAffectation(state, signalId, { eap: newEap });
}

function setEAPOnMutation(state: PlayerData, signalId: string): PlayerData {
  const a = state.affectations[signalId];
  if (!a || !a.eap) return state;
  return patchAffectation(state, signalId, { eap: { ...a.eap, eap: true } });
}

function setEAPOffMutation(state: PlayerData, signalId: string): PlayerData {
  const a = state.affectations[signalId];
  if (!a || !a.eap) return state;
  if (a.disturbances.indexOf('NON_LIBERATION_EAP') !== -1) return state;
  return patchAffectation(state, signalId, { eap: { ...a.eap, eap: false } });
}

function setEPAOnMutation(state: PlayerData, signalId: string): PlayerData {
  const a = state.affectations[signalId];
  if (!a || !a.epa) return state;
  return patchAffectation(state, signalId, { epa: { ...a.epa, epa: true } });
}

function setEPAOffMutation(state: PlayerData, signalId: string): PlayerData {
  const a = state.affectations[signalId];
  if (!a || !a.epa) return state;
  const newEpa = { ...a.epa, canceled: false };
  if (a.disturbances.indexOf('NON_LIBERATION_EPA') === -1) newEpa.epa = false;
  return patchAffectation(state, signalId, { epa: newEpa });
}

function setEPACancelOnMutation(state: PlayerData, signalId: string): PlayerData {
  const a = state.affectations[signalId];
  if (!a || !a.epa) return state;
  return patchAffectation(state, signalId, { epa: { ...a.epa, canceled: true } });
}

function addZapLockMutation(
  state: PlayerData,
  leverId: string,
  args: { signalId: string; zoneId: string },
): PlayerData {
  const lever = state.levers[leverId];
  if (!lever) return state;
  const zapLock = [...(lever.zapLock ?? []), args];
  return { ...state, levers: { ...state.levers, [leverId]: { ...lever, zapLock } } };
}

// ===== updateAffectationPosition (action — la grosse) =====
//
// Reproduction fidèle de l'action Vuex `updateAffectationPosition` (renderer.js
// @238500-@241500). Pour les contrôles signaux, applique ~15 gardes avant
// d'autoriser une ouverture. Si une garde refuse :
//   - commit position="F", requestedPosition=demandée (le signal "veut" s'ouvrir
//     mais ne peut pas — informObservers le réessaiera plus tard)
//   - re-dispatche informObservers si la position effective a changé.
//
// Pour les non-contrôles : commit + gestion discordances g/d ↔ G/D.

export function updateAffectationPosition(
  state: PlayerData,
  payload: { affectationId: string; position?: string; requestedPosition?: string },
): PlayerData {
  const { affectationId } = payload;
  const r = state.affectations[affectationId];
  if (!r) return state;

  if (r.type === 'controle') {
    let s = state;
    const position = payload.position ?? r.requestedPosition ?? '';

    if (position === 'O') {
      // ===== Hardcoded Gessie original (clelles ?) =====
      // Branche cabriste : si ES en plus, alors D1 et D2 ont des gardes
      // supplémentaires sur des leviers spécifiques.
      if (s.levers.ES && s.levers.ES.position === 'plus') {
        if (r.name === 'D1') {
          if (
            s.levers[12]?.position === 'minus' &&
            s.levers.D?.position === 'plus' &&
            s.levers[2]?.position === 'plus'
          ) {
            return s;
          }
        } else if (r.name === 'D2') {
          if (
            s.levers[6]?.position === 'minus' &&
            s.levers[2]?.position === 'plus' &&
            s.levers.D?.position === 'plus'
          ) {
            return s;
          }
        }
      }
      // ===== Hardcoded Gessie original (A1/S1, A2/S2 enchaînement carré/avertisseur) =====
      if (r.name === 'A1') {
        if (s.affectations.S1 && s.affectations.S1.position === 'F') {
          return updateAffectationPositionMutation(s, affectationId, 'F', position);
        }
      } else if (r.name === 'A2') {
        if (s.affectations.S2 && s.affectations.S2.position === 'F') {
          return updateAffectationPositionMutation(s, affectationId, 'F', position);
        }
      }
    }

    const activeDir = findActiveDirection(s, r);

    // 1. positionFC active : signal verrouillé fermé.
    if (r.positionFC) {
      return updateAffectationPositionMutation(s, affectationId, 'F', position);
    }

    // 2. Demande de fermeture : commit direct + cascades.
    if (position === 'F') {
      s = updateAffectationPositionMutation(s, affectationId, position);
      if (r.name === 'S1') s = updateAffectationPosition(s, { affectationId: 'A1' });
      else if (r.name === 'S2') s = updateAffectationPosition(s, { affectationId: 'A2' });
      if (position !== r.requestedPosition && r.observers) {
        s = informObservers(s, r.observers);
      }
      // Lever les ZAP des zones de protection déclenchées.
      const lookupAff = s.affectations[affectationId];
      const zapDecl = (lookupAff as Affectation & { zapDeclenchees?: string[] })
        .zapDeclenchees;
      if (zapDecl) {
        for (const z of zapDecl) s = setZapOffMutation(s, z);
      }
      return s;
    }

    if (position === 'O') {
      // ===== Hardcoded Gessie original (clelles : circulation z 1/z 2 vs leviers D/2) =====
      if (r.name === 'D1') {
        if (
          s.affectations['z 2']?.circulation &&
          s.levers.D?.position === 'plus'
        ) {
          return updateAffectationPositionMutation(s, affectationId, 'F', 'O');
        }
      } else if (r.name === 'D2') {
        if (
          s.affectations['z 1']?.circulation &&
          s.levers[2]?.position === 'plus'
        ) {
          return updateAffectationPositionMutation(s, affectationId, 'F', 'O');
        }
      }

      if (r.directions && r.directions.length > 0 && activeDir) {
        // 3. Aiguilles : toutes les "droite" doivent être en D, "gauche" en G.
        const badAg =
          activeDir.aiguille?.droite?.find(
            (e) => s.affectations[e] && s.affectations[e].position !== 'D',
          ) ||
          activeDir.aiguille?.gauche?.find(
            (e) => s.affectations[e] && s.affectations[e].position !== 'G',
          );
        if (badAg) {
          s = updateAffectationPositionMutation(s, affectationId, 'F', 'O');
          if (position !== r.requestedPosition && r.observers) {
            s = informObservers(s, r.observers);
          }
          return s;
        }

        // 4. Zones de protection : aucune en circulation (sauf si annulSubstitution pressée).
        if (!r.annulSubstitution || !r.annulSubstitution.pressed) {
          const occZP = activeDir.zonesDeProtections?.find((e) => {
            const z = getZoneAffect(s, e);
            return !!z?.circulation;
          });
          if (occZP) {
            s = updateAffectationPositionMutation(s, affectationId, 'F', 'O');
            if (position !== r.requestedPosition && r.observers) {
              s = informObservers(s, r.observers);
            }
            return s;
          }
        }

        // 5. Espacement auto + protection non-annulable : aucune zone occupée.
        const occEspProt = (activeDir.zonesEspacementAuto ?? [])
          .concat(activeDir.zonesProtectionNonAnn ?? [])
          .find((e) => {
            const z = getZoneAffect(s, e);
            return !!z?.circulation;
          });
        if (occEspProt) {
          s = updateAffectationPositionMutation(s, affectationId, 'F', 'O');
          if (position !== r.requestedPosition && r.observers) {
            s = informObservers(s, r.observers);
          }
          return s;
        }

        // 6. Sens contraire : si une zone "annulation_condition" est occupée,
        // alors les annulables sont neutralisés ; sinon on les ajoute aussi.
        const sensContraireAnnulCond = (activeDir.sensContraireAnnulationCondition ?? []) as string[];
        const x = sensContraireAnnulCond.find(
          (e) => !!s.affectations[e]?.circulation,
        );
        let y: string[] = [...(activeDir.sensContraireTransitNonAnnulable ?? [])];
        let b: string[] = [...(activeDir.sensContraireZoneNonAnnulable ?? [])];
        if (!x) {
          y = y.concat(activeDir.sensContraireTransitAnnulable ?? []);
          b = b.concat(activeDir.sensContraireZoneAnnulable ?? []);
        }
        // 6a. Zones contraires : occupées → bloque.
        const occContraireZone = b.find(
          (e) => s.affectations[e] && !!s.affectations[e].circulation,
        );
        if (occContraireZone) {
          s = updateAffectationPositionMutation(s, affectationId, 'F', 'O');
          if (position !== r.requestedPosition && r.observers) {
            s = informObservers(s, r.observers);
          }
          return s;
        }
        // 6b. Transits contraires : verrouillés → bloque.
        const occContraireTransit = y.find((entry) => {
          const parts = entry.trim().split(' ');
          const aId = 'z ' + parts[0];
          const dir = parts[1] === 'I' ? 'impair' : 'pair';
          const z = s.affectations[aId];
          return z?.transit && !!z.transit[dir]?.haveTransit;
        });
        if (occContraireTransit) {
          s = updateAffectationPositionMutation(s, affectationId, 'F', 'O');
          if (position !== r.requestedPosition && r.observers) {
            s = informObservers(s, r.observers);
          }
          return s;
        }
      }

      // ===== Toutes les gardes passent : on ouvre =====
      if (r.eap && r.eap.zap) s = setEAPOnMutation(s, affectationId);
      else if (r.epa) s = setEPAOnMutation(s, affectationId);
      s = updateAffectationPositionMutation(s, affectationId, 'O');
      if (r.name === 'S1') s = updateAffectationPosition(s, { affectationId: 'A1' });
      else if (r.name === 'S2') s = updateAffectationPosition(s, { affectationId: 'A2' });

      const lookupAff = s.affectations[affectationId];
      const zapDecl = (lookupAff as Affectation & { zapDeclenchees?: string[] })
        .zapDeclenchees;
      if (zapDecl) {
        for (const z of zapDecl) s = setZapOnMutation(s, z);
      }
      // resumeEvent linkedEvents : géré dans le wrapper toggleLever du store
      // (useGessieStore.ts) — qui détecte les transitions F→O avec linkedEvents
      // et reprend les events Clock en pause. updateAffectationPosition reste
      // pur (pas d'accès au Clock).

      if (position !== r.requestedPosition && r.observers) {
        s = informObservers(s, r.observers);
      }
      return s;
    }

    // Position autre que O/F (cas non-prévu) : on commit tel quel.
    return updateAffectationPositionMutation(s, affectationId, position);
  }

  // ===== Cas non-controle (aiguille, taquet, zone, signal "I") =====
  const oldPos = r.position ?? '';
  const wasLower = oldPos === 'g' || oldPos === 'd';
  let s = updateAffectationPositionMutation(
    state,
    affectationId,
    payload.position ?? oldPos,
    payload.requestedPosition,
  );
  const newPos = s.affectations[affectationId]?.position ?? '';
  // Discordances : si on passe de g/d → G/D, retire ; sinon si G/D → g/d, ajoute.
  if (wasLower && (newPos === 'G' || newPos === 'D')) {
    s = { ...s, discordances_count: Math.max(0, s.discordances_count - 1) };
  } else if (!wasLower && (newPos === 'g' || newPos === 'd')) {
    s = { ...s, discordances_count: s.discordances_count + 1 };
  }
  if (r.observers) s = informObservers(s, r.observers);
  return s;
}

// ===== informObservers =====
//
// Pour chaque observer, si position ou requestedPosition est "O", re-dispatche
// updateAffectationPosition (qui retentera l'ouverture). La récursion infinie
// est impossible : les non-controles ne demandent jamais d'ouverture, et les
// controles bloqués retombent en "F" sans toucher leurs observers (sauf si la
// position a effectivement changé, auquel cas la chaîne se termine).

export function informObservers(state: PlayerData, observers: string[]): PlayerData {
  let s = state;
  for (const l of observers) {
    const d = s.affectations[l];
    if (!d) continue;
    if (d.position === 'O' || d.requestedPosition === 'O') {
      s = updateAffectationPosition(s, { affectationId: l });
    }
  }
  return s;
}

// ===== sendTransit =====

export function sendTransit(
  state: PlayerData,
  payload: { direction: 'pair' | 'impair'; itineraire: string[] },
): PlayerData {
  const { direction, itineraire } = payload;
  let s = sendTransitMutation(state, direction, itineraire);
  for (const t of itineraire) {
    const n = s.affectations[t];
    if (!n) continue;
    if (n.observers) s = informObservers(s, n.observers);
    if (n.atr) {
      const atrIdx = s.transitAnnulateurs.findIndex((x) => x.id === n.atr);
      const atrEntry = atrIdx !== -1 ? s.transitAnnulateurs[atrIdx] : undefined;
      if (atrEntry && atrEntry.terrain && atrEntry.on) {
        // SET_ATR_STATUS isOn:false + retire `atr` sur toutes les zones associées.
        const atrId = atrEntry.id;
        const zones = atrEntry.zones;
        const newAtrs = [...s.transitAnnulateurs];
        newAtrs[atrIdx] = { ...atrEntry, on: false };
        const affectations = { ...s.affectations };
        for (const zid of zones) {
          const zaff = affectations[zid];
          if (zaff) affectations[zid] = { ...zaff, atr: false };
        }
        s = { ...s, transitAnnulateurs: newAtrs, affectations };
        void atrId;
      }
    }
  }
  return s;
}

// ===== updateTransit =====

export function updateTransit(
  state: PlayerData,
  payload: {
    direction: 'pair' | 'impair';
    zoneId: string;
    unlockLever?: boolean;
  },
): PlayerData {
  const { direction } = payload;
  const unlockLever = !!payload.unlockLever;
  let zoneId: string | false | undefined = payload.zoneId;
  let s = state;
  // Bornage : éviter une boucle infinie en cas de cycle de nextZone (peu
  // probable mais on se protège).
  let safety = 0;
  while (zoneId && safety++ < 200) {
    const o = s.affectations[zoneId];
    if (!o || !o.transit) break;
    s = updateTransitMutation(s, direction, zoneId, unlockLever);
    const post: Affectation | undefined = s.affectations[zoneId];
    if (post?.observers) s = informObservers(s, post.observers);
    zoneId = post?.transit?.[direction]?.nextZone;
  }
  return s;
}

// ===== zapOn / zapOff =====

export function zapOn(
  state: PlayerData,
  payload: { signalId: string; zoneId: string },
): PlayerData {
  const { signalId, zoneId } = payload;
  const r = state.affectations[signalId];
  const l = state.affectations[zoneId];
  if (!r || !l || !r.eap) return state;
  if (!l.circulation) return state;

  let s = state;
  for (const c of Object.keys(r.eap.origins)) {
    const p = r.eap.origins[c];
    const consZ = (typeof p.consistance_zone === 'string'
      ? p.consistance_zone.split(',')
      : (p.consistance_zone ?? [])) as string[];
    if (c !== zoneId && consZ.indexOf(zoneId) === -1) continue;

    // selection : tous ses leviers doivent être à la position requise (sinon dead-code)
    if (p.selection) {
      const sel = p.selection as string[] | string;
      const selArr = Array.isArray(sel) ? sel : (sel as string).trim().split(',');
      // Lecture seule : le bundle exécute la boucle sans condition d'arrêt
      // (dead-code apparent). On itère pour fidélité mais sans short-circuit.
      for (const h of selArr) {
        const parts = h.trim().split(' ');
        const y = parts[0];
        const sign = parts[1] === '-' ? 'minus' : 'plus';
        const I = s.levers[y];
        void I;
        void sign;
      }
    }

    // retention : si le levier est dans la position de rétention, on bloque.
    if (p.retention) {
      const retParts = (p.retention as string).trim().split(' ');
      const P = retParts[0];
      const sign: 'plus' | 'minus' = retParts[1] === '-' ? 'minus' : 'plus';
      const C = s.levers[P];
      if (C && C.position === sign) {
        s = addZapLockMutation(s, P, { signalId, zoneId });
        continue;
      }
    }

    s = setZapOnMutation(s, signalId);
  }
  // Si signal pas en F, on déclenche aussi l'EAP.
  const cur = s.affectations[signalId];
  if (cur && cur.position !== 'F') s = setEAPOnMutation(s, signalId);
  return s;
}

export function zapOff(state: PlayerData, signalId: string): PlayerData {
  const a = state.affectations[signalId];
  if (!a || !a.eap) return state;
  // Attention : reproduction fidèle d'une logique apparemment inversée du
  // bundle. Si `eap.consistance` est défini, on ne SET_ZAP_OFF que si au moins
  // une zone de la consistance est en circulation. Sinon on bail.
  if (a.eap.consistance) {
    let occupied = false;
    for (const p of a.eap.consistance) {
      if (state.affectations[p]?.circulation) {
        occupied = true;
        break;
      }
    }
    if (!occupied) return state;
  }
  return setZapOffMutation(state, signalId);
}

// ===== closeWithFA (Fermeture Automatique au passage train) =====

export function closeWithFA(state: PlayerData, signalId: string): PlayerData {
  const i = state.affectations[signalId];
  if (!i) return state;

  // Cas sémaphore (cantonnement) : fermeture + extinction lumière.
  if (i.blocId !== undefined && !isNaN(parseInt(String(i.blocId), 10))) {
    const patch: Partial<Bloc> = { commutSemaphoreLight: 'E' };
    if (i.position === 'O') patch.voieLibre = 'E';
    let s = patchBloc(state, String(i.blocId), patch);
    s = updateAffectationPosition(s, { affectationId: signalId, position: 'F' });
    return s;
  }

  if (!i.directions) return state;
  const sDir = i.directions.find(
    (e) => e.leverList.findIndex((l) => state.levers[l]?.position === 'plus') === -1,
  );
  if (!sDir || !sDir.fa) return state;
  if (sDir.fa.pedale && !i.pedales?.FA?.pressed) return state;
  if (sDir.fa.zone) {
    const r = state.affectations[sDir.fa.zone];
    if (!r?.circulation) return state;
  }
  let s = updateAffectationPosition(state, { affectationId: signalId, position: 'F' });
  if (sDir.fa.annulable && i.annulateurFA?.pressed) {
    s = updateAffectationPosition(s, { affectationId: signalId, position: 'O' });
  }
  return s;
}

// ===== toggleCommutFC (commutateur de Fermeture Carré) =====
//
// Reproduction fidèle de l'action Vuex `toggleCommutFC` (renderer.js @261000).
// Bascule le booléen `positionFC` du signal :
//   - false → true : le signal est verrouillé fermé (gate dans
//     updateAffectationPosition force la position à 'F').
//   - true → false : le signal est libéré, la position est ré-évaluée selon
//     les leviers + cascades.
// En complément, reset `epa.canceled` (cf. CHANGE_FC_STATUS) et, si on
// déverrouille, supprime un éventuel `setEPAOff` en attente dans la file
// Clock (signalé via ActionResult.removeEvents).

export function toggleCommutFC(state: PlayerData, signalId: string): ActionResult {
  const aff = state.affectations[signalId];
  if (!aff || aff.positionFC === undefined) return { state };

  const newPos = !aff.positionFC;

  // Mutation : positionFC inversé + epa.canceled remis à false.
  const patched: Partial<Affectation> = { positionFC: newPos };
  if (aff.epa) {
    patched.epa = { ...aff.epa, canceled: false };
  }
  let s = patchAffectation(state, signalId, patched);

  // Re-évalue la position selon le nouvel état (sans `position` : utilise
  // requestedPosition + gates).
  s = updateAffectationPosition(s, { affectationId: signalId });

  // Si on déverrouille (newPos === false), supprime un setEPAOff en attente.
  if (!newPos) {
    return {
      state: s,
      removeEvents: (e) => e.type === 'setEPAOff' && (e as { signalId?: string }).signalId === signalId,
    };
  }
  return { state: s };
}

// ===== cancelEPA (programme un setEPAOff) =====

export function cancelEPA(
  state: PlayerData,
  signalId: string,
  currentTime: number,
): ActionResult {
  const n = state.affectations[signalId];
  if (!n || !n.epa) return { state };
  if (!(n.epa.epa && !n.epa.canceled && n.positionFC)) return { state };
  // Trouver l'annulation dont le levier est en minus.
  const annulList = Object.values(n.epa.annulation ?? {});
  const a = annulList.find(
    (t) => t.lever !== undefined && state.levers[t.lever]?.position === 'minus',
  );
  if (!a) return { state };
  const s = setEPACancelOnMutation(state, signalId);
  const delay = a.delay ?? 0;
  const evt: SimEvent = {
    uid: '',
    time: currentTime + 60000 * delay,
    type: 'setEPAOff',
    signalId,
  };
  return { state: s, events: [evt] };
}

// ===== setEPAOff (handler de l'event programmé par cancelEPA) =====

export function setEPAOff(state: PlayerData, signalId: string): PlayerData {
  return setEPAOffMutation(state, signalId);
}

// ===== setEAPOff (déclenché par toggleLever ou pedaleEAP) =====

export function setEAPOff(state: PlayerData, signalId: string): PlayerData {
  return setEAPOffMutation(state, signalId);
}

// ===== toggleLever — l'action centrale =====
//
// Reproduction fidèle de l'action Vuex `toggleLever` (renderer.js @234500).
// Échec silencieux : si une des 9 gardes n'est pas satisfaite, on retourne
// `state` inchangé sans message d'erreur (cohérent avec Gessie).

export function toggleLever(state: PlayerData, leverId: string): PlayerData {
  const lever = getLever(state, leverId);
  if (!lever) return state;

  const aff = state.affectations;

  // 1. Position cible
  const currentPos = lever.position; // 'plus' | 'minus'
  const targetPos: 'plus' | 'minus' = currentPos === 'minus' ? 'plus' : 'minus';

  // 2. Direction active (signaux uniquement) — celle où tous les autres leviers
  // sont en plus (sauf le levier lui-même).
  let activeDirection: NonNullable<typeof lever.directions>[number] | undefined;
  if (lever.directions && lever.directions.length > 0) {
    activeDirection = lever.directions.find((dir) => {
      const conflict = dir.leverList.findIndex(
        (id) => state.levers[id]?.position === 'plus' && id !== lever.id,
      );
      return conflict === -1;
    });
  }

  // 3. Incompatibilités
  const restrictForTarget = lever.incompatibilities[targetPos];
  const moving = lever.incompatibilities.moving;
  const violatedPlus = [...restrictForTarget.plus, ...moving.plus].filter(
    (id) => state.levers[id]?.position === 'plus',
  );
  const violatedMinus = [...restrictForTarget.minus, ...moving.minus].filter(
    (id) => state.levers[id]?.position === 'minus',
  );
  const violatedGroups = [...restrictForTarget.groups, ...moving.groups].filter((grp) => {
    const onePlusInMinus = grp.plus.find((id) => state.levers[id]?.position === 'minus');
    if (onePlusInMinus) return false;
    const oneMinusInPlus = grp.minus.find((id) => state.levers[id]?.position === 'plus');
    return !oneMinusInPlus;
  });
  if (violatedPlus.length || violatedMinus.length || violatedGroups.length) {
    return state;
  }

  // 4. Keyholes
  if (lever.keyholes) {
    for (const k of Object.values(lever.keyholes)) {
      if (!k.presence) return state;
    }
  }

  // 5. Annulateur électrique
  if (lever.annulateurElec && lever.annulateurElec.enabled) return state;

  // 6. Bascule vers minus avec direction active
  if (targetPos === 'minus' && activeDirection) {
    const dir = activeDirection;
    if (dir.aiguille?.droite?.find((id) => aff[id]?.position !== 'D')) return state;
    if (dir.aiguille?.gauche?.find((id) => aff[id]?.position !== 'G')) return state;
    if (dir.taquetBas?.find((id) => aff[id]?.position !== 'B')) return state;
    const sf = (dir as { signalFerme?: string[] }).signalFerme;
    if (sf?.find((id) => aff[id]?.position !== 'F')) return state;
    if (dir.zonesDeProtections?.find((id) => aff[id]?.circulation)) return state;
    if (dir.pdProximite) {
      for (const affId of lever.affectations) {
        const a = aff[affId];
        if (!a) continue;
        const proxi = a.pedales?.Proxi;
        if (!proxi?.pressed || a.disturbances.indexOf('NON_LIBERATION_EP') !== -1) {
          return state;
        }
      }
    }
  }

  // 7. zonesIsolees.plus
  if (lever.zonesIsolees?.plus) {
    for (const zoneId of lever.zonesIsolees.plus) {
      const z = aff[zoneId];
      if (z?.circulation) {
        const atr = state.transitAnnulateurs.find(
          (at) => at.on && at.zones.indexOf(zoneId) !== -1,
        );
        if (!atr) return state;
      }
    }
  }

  // 8. zonesTransit[currentPos]
  const ztForCurrent = lever.zonesTransit?.[currentPos];
  if (ztForCurrent && ztForCurrent.length > 0) {
    for (let entry of ztForCurrent) {
      if (entry[0] !== 'z') entry = `z ${entry}`;
      const parts = entry.split(' ');
      const zoneIdLookup = `${parts[0]} ${parts[1]}`;
      const dir = parts[2] === 'I' ? 'impair' : 'pair';
      const z = aff[zoneIdLookup];
      if (!z) continue;
      if (!z.circulation && z.transit?.[dir]?.haveTransit) return state;
    }
  }

  // 9. Retour vers plus : continuite ne doit pas être en transit
  if (targetPos === 'plus') {
    for (const affId of lever.affectations) {
      const a = aff[affId];
      if (a?.continuite) {
        if (a.continuite.pair) {
          const cp = aff[a.continuite.pair];
          if (cp?.transit?.pair?.haveTransit) return state;
        }
        if (a.continuite.impair) {
          const ci = aff[a.continuite.impair];
          if (ci?.transit?.impair?.haveTransit) return state;
        }
      }
    }
  }

  // 10. Retour vers plus : EAP/EPA actifs → bloque
  if (targetPos === 'plus') {
    for (const affId of lever.affectations) {
      const a = aff[affId];
      if (a?.type === 'controle') {
        if (a.eap && (a.eap.eap || a.disturbances.indexOf('DERANGEMENT_EAP') !== -1)) {
          return state;
        }
        if (a.epa && (a.epa.epa || a.disturbances.indexOf('DERANGEMENT_EPA') !== -1)) {
          return state;
        }
      }
    }
  }

  // ===== Toutes les gardes passées : on commit =====
  let next = updateLeverPosition(state, leverId, targetPos);

  // ZAP locks accumulés sur ce levier — on les redéclenche en zapOn.
  const zapLockEntries = lever.zapLock ?? [];
  for (const zl of zapLockEntries) {
    next = zapOn(next, zl);
  }

  // Pour chaque affectation contrôlée
  for (let i = 0; i < lever.affectations.length; i++) {
    const affId = lever.affectations[i];
    const a = next.affectations[affId];
    const corresp = lever.correspondances[i];
    if (!corresp) continue;

    if (targetPos === 'plus' && a?.eap?.eap) {
      next = setEAPOffMutation(next, affId);
    }
    if (targetPos === 'plus' && a?.epa?.epa) {
      next = setEPAOffMutation(next, affId);
    }
    next = updateAffectationPosition(next, {
      affectationId: affId,
      position: corresp[targetPos],
    });

    // Itinéraire de transit
    if (activeDirection?.itineraireTransit) {
      const lastDigit = parseInt(affId.slice(-1), 10);
      const dir: 'pair' | 'impair' =
        !isNaN(lastDigit) && lastDigit % 2 === 0 ? 'pair' : 'impair';
      const itineraire = activeDirection.itineraireTransit[dir];
      if (itineraire && itineraire.length > 0) {
        if (targetPos === 'minus') {
          next = sendTransit(next, { direction: dir, itineraire });
        } else {
          for (const zoneId of itineraire) {
            next = updateTransit(next, { direction: dir, zoneId, unlockLever: true });
          }
        }
      }
    }
  }

  return next;
}
