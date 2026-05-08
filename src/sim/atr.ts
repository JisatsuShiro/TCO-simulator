// Actions ATR (annulateur de transit) — étape 6 du portage Gessie.
//
// Reproduit les actions Vuex Player liées aux ATR (renderer.js @251900-@258400).
// Chaque ATR `{id, leviers, zones, on, pressed, autorisation, terrain}` permet
// d'annuler un transit verrouillé. Quand `terrain` est true, la presse opère
// l'autorisation ; sinon, elle déclenche directement l'annulation (avec
// `cancelATr` qui repasse `on:false` à +30s).
//
// Note importante : la sémantique du bundle est légèrement différente de ce
// que la mission décrit. Mission : pressATRBouton fait pressed:true, et si
// terrain && on switch terrain. Bundle : action `pressATr` qui (a) vérifie
// que tous les leviers sont à la bonne position, (b) si terrain met
// autorisation:false, sinon pressed:true + addEvent cancelATr, (c) puis on:true
// + iter sur zones pour updateTransit.
//
// J'ai porté fidèlement le comportement bundle pour pressATRBouton, et ajouté
// des helpers releaseATRBouton / giveATRAutorisation / removeATRAutorisation
// avec une sémantique simple (set des champs au valeur attendue).

import type { ActionResult } from './actions';
import { informObservers, updateTransit } from './actions';
import type { PlayerData, SimEvent, TransitAnnulator } from './types';

// ===== Helpers =====

function findAtr(state: PlayerData, atrId: string): { idx: number; atr?: TransitAnnulator } {
  const idx = state.transitAnnulateurs.findIndex((a) => a.id === atrId);
  if (idx < 0) return { idx };
  return { idx, atr: state.transitAnnulateurs[idx] };
}

function patchAtr(
  state: PlayerData,
  idx: number,
  patch: Partial<TransitAnnulator>,
): PlayerData {
  if (idx < 0) return state;
  const atrs = state.transitAnnulateurs.slice();
  atrs[idx] = { ...atrs[idx], ...patch };
  return { ...state, transitAnnulateurs: atrs };
}

/**
 * SET_ATR_STATUS du bundle : met `on:isOn` et propage sur toutes les zones
 * couvertes (`affectations[zoneId].atr = isOn ? id : false`).
 */
function setAtrStatus(state: PlayerData, atrId: string, isOn: boolean): PlayerData {
  const { idx, atr } = findAtr(state, atrId);
  if (!atr) return state;
  let s = patchAtr(state, idx, { on: isOn });
  const affectations = { ...s.affectations };
  for (const zoneId of atr.zones) {
    const z = affectations[zoneId];
    if (z) affectations[zoneId] = { ...z, atr: isOn ? atrId : false };
  }
  s = { ...s, affectations };
  return s;
}

// ===== pressATRBouton (action Gessie : pressATr) =====
//
// Bundle @256700-@257700 :
//   1. vérifie que tous les leviers de l'ATR sont à la position requise
//      (chaque entrée de `leviers` est "id +" ou "id -")
//   2. si `atr.terrain` : SET_ATR_AUTHORIZATION_STATUS isAuthorized:false
//      sinon : SET_ATR_PRESSED_STATUS isPressed:true + addEvent cancelATr +30s
//   3. SET_ATR_STATUS isOn:true
//   4. pour chaque zone, pour chaque direction : si nextZone, dispatch updateTransit

export function pressATRBouton(
  state: PlayerData,
  payload: { atrId: string; currentTime: number },
): ActionResult {
  const { atr, idx } = findAtr(state, payload.atrId);
  if (!atr || idx < 0) return { state };

  // 1. Garde levers
  for (const entry of atr.leviers) {
    const parts = entry.trim().split(/\s+/);
    const leverId = parts[0];
    const sign = parts[1] === '+' ? 'plus' : 'minus';
    const lev = state.levers[leverId];
    if (!lev || lev.position !== sign) return { state };
  }

  // 2. terrain → autorisation false ; sinon pressed=true + event cancelATr
  let s = state;
  const events: SimEvent[] = [];
  if (atr.terrain) {
    s = patchAtr(s, idx, { autorisation: false });
  } else {
    s = patchAtr(s, idx, { pressed: true });
    events.push({
      uid: '',
      time: payload.currentTime + 30000,
      type: 'cancelATr',
      atrId: payload.atrId,
    });
  }

  // 3. on:true + propage atr=id sur les zones
  s = setAtrStatus(s, payload.atrId, true);

  // 4. Pour chaque zone couverte, pour chaque direction où la zone a un nextZone,
  //    re-dispatcher updateTransit (qui propage en cascade).
  for (const zoneId of atr.zones) {
    const z = s.affectations[zoneId];
    if (!z || !z.transit) continue;
    for (const direction of ['pair', 'impair'] as const) {
      if (z.transit[direction]?.nextZone) {
        s = updateTransit(s, { direction, zoneId });
      }
    }
    // observers (cohérent avec les autres handlers Gessie qui re-informent
    // après mutation transit). Le bundle ne le fait pas explicitement ici
    // mais updateTransit en interne le fait via informObservers.
    if (z.observers) s = informObservers(s, z.observers);
  }

  return { state: s, events };
}

// ===== cancelATr (handler de l'event programmé) =====
//
// Bundle @257700 : SET_ATR_STATUS isOn:false.
// Le `pressed` reste à `true` côté bundle (à la presse suivante on remet
// pressed:true qui est idempotent). À la libération manuelle, il faudra
// utiliser releaseATRBouton.

export function cancelATr(state: PlayerData, atrId: string): PlayerData {
  return setAtrStatus(state, atrId, false);
}

// ===== releaseATRBouton =====
//
// Pas dans le bundle tel quel — la mission demande : set pressed:false ; si
// tous les autres ATR du même groupe sont relâchés, on:true repasse. Comme
// la notion de "groupe" n'existe pas dans le schema (transitAnnulateurs est
// une liste plate), j'interprète "groupe" comme "tous les ATR" (tous doivent
// être relâchés pour qu'aucun ne soit "actif"). En pratique, ce n'est pas
// utilisé directement par le bundle ; le panel UI peut s'en servir.

export function releaseATRBouton(state: PlayerData, atrId: string): PlayerData {
  const { atr, idx } = findAtr(state, atrId);
  if (!atr || idx < 0) return state;
  let s = patchAtr(state, idx, { pressed: false });
  // Si tous les ATR sont maintenant non-pressés, et que cet ATR est `terrain`,
  // on le repasse en `on:true`. Cohérent avec la sémantique mission.
  const allReleased = s.transitAnnulateurs.every((a) => !a.pressed);
  if (allReleased && atr.terrain) {
    s = setAtrStatus(s, atrId, true);
  }
  return s;
}

// ===== giveATRAutorisation (action — opérateur brise la cassette "Au ATr") =====
//
// Reproduit `pressAuATr` du bundle (@258200) : commit pressed:true +
// autorisation:true. C'est le "click sur cassette à briser" pour terrain :
// un seul geste arme l'auatr (LED clignote) ET met la cassette en état brisé.

export function giveATRAutorisation(state: PlayerData, atrId: string): PlayerData {
  const { idx } = findAtr(state, atrId);
  if (idx < 0) return state;
  return patchAtr(state, idx, { pressed: true, autorisation: true });
}

// ===== removeATRAutorisation =====

export function removeATRAutorisation(state: PlayerData, atrId: string): PlayerData {
  const { idx } = findAtr(state, atrId);
  if (idx < 0) return state;
  return patchAtr(state, idx, { autorisation: false });
}
