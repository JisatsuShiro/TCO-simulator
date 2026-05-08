// Actions sur les clés (locks, groups, centralLocks, holdedKey) — étape 6.
//
// Reproduit les mutations Vuex Player TAKE_KEY/PUT_KEY/TAKE_CENTRAL_KEY/
// PUT_CENTRAL_KEY (renderer.js @246800-@251950). En Vuex, ces opérations
// sont des mutations directes ; ici on retourne un nouveau PlayerData.
//
// Concepts :
//   - holdedKey: string | undefined  — la clé courante en main (au plus une)
//   - locks{}: KeyHole indexé par keyId  — cadenas individuels
//   - groups{}: KeyGroup indexé par groupId — boîte avec plusieurs keyholes
//   - centralLocks{}: CentralLock indexé par uid — verrou central
//   - levers[id].keyholes{} — keyholes attachés à un levier (annexeI)

import type { KeyHole, PlayerData } from './types';

// ===== Helpers =====

interface ContainerInfo {
  /**
   * Position courante du contenant — undefined pour groups/locks
   * (qui n'ont pas de position globale), 'plus'/'minus' pour les leviers.
   */
  position?: 'plus' | 'minus';
  /** keyholes du contenant, indexés par keyId. */
  keyholes: Record<string, KeyHole>;
}

/**
 * Résout le contenant d'une clé selon le payload :
 *  - si `lock:true` → state.locks[keyId] est traité comme un keyhole direct
 *    (le bundle code `s = e.locks[o]; r = s.keyhole` qui semble buggy car
 *    e.locks[k] est lui-même un keyhole sans propriété `.keyhole`). On
 *    reproduit la sémantique attendue : le lock IS le keyhole, et on lui
 *    fabrique un container virtuel à un seul keyhole.
 *  - si `leverId` → state.levers[leverId] (avec .position et .keyholes)
 *  - si `groupId` → state.groups[groupId] (sans position, .keyholes)
 *
 * Retourne aussi le keyhole cible (par keyId) et un setter pour appliquer
 * une modification immutable (utilisé par TAKE/PUT pour patcher l'état).
 */
function resolveContainer(
  state: PlayerData,
  payload: { lock?: boolean; groupId?: string; leverId?: string; keyId: string },
):
  | {
      info: ContainerInfo;
      keyhole: KeyHole;
      apply: (newKeyhole: KeyHole) => PlayerData;
    }
  | undefined {
  const { lock, groupId, leverId, keyId } = payload;
  if (lock) {
    const k = state.locks[keyId];
    if (!k) return undefined;
    // Container virtuel à un seul keyhole.
    return {
      info: { position: undefined, keyholes: { [keyId]: k } },
      keyhole: k,
      apply: (newKeyhole) => ({
        ...state,
        locks: { ...state.locks, [keyId]: newKeyhole },
      }),
    };
  }
  if (leverId) {
    const lev = state.levers[leverId];
    if (!lev || !lev.keyholes) return undefined;
    const k = lev.keyholes[keyId];
    if (!k) return undefined;
    return {
      info: { position: lev.position, keyholes: lev.keyholes },
      keyhole: k,
      apply: (newKeyhole) => ({
        ...state,
        levers: {
          ...state.levers,
          [leverId]: {
            ...lev,
            keyholes: { ...lev.keyholes, [keyId]: newKeyhole },
          },
        },
      }),
    };
  }
  if (groupId) {
    const grp = state.groups[groupId];
    if (!grp) return undefined;
    const k = grp.keyholes[keyId];
    if (!k) return undefined;
    return {
      info: { position: undefined, keyholes: grp.keyholes },
      keyhole: k,
      apply: (newKeyhole) => ({
        ...state,
        groups: {
          ...state.groups,
          [groupId]: {
            ...grp,
            keyholes: { ...grp.keyholes, [keyId]: newKeyhole },
          },
        },
      }),
    };
  }
  return undefined;
}

// ===== takeKey =====
//
// Bundle @250500 (TAKE_KEY mutation) :
//   if (!holdedKey && keyhole.presence) {
//     if (!container.position) {
//       // Pas de position courante : check qu'aucun autre keyhole vide
//       // n'aurait une position différente de la nôtre.
//       // BUG bundle : `e.position !== r.positioin` (typo, lit toujours
//       // undefined). Donc en pratique : refuse si un autre keyhole vide
//       // a une `position` définie.
//       const blocking = keyholes.findIndex(e => e.position !== r.positioin && !e.presence);
//       if (blocking !== -1) return;
//     } else if (container.position !== keyhole.position) return;
//     holdedKey = keyhole.presence; keyhole.presence = false;
//   }
//
// On porte fidèlement, y compris le typo (commenté).

export function takeKey(
  state: PlayerData,
  payload: { lock?: boolean; groupId?: string; leverId?: string; keyId: string },
): PlayerData {
  const ctx = resolveContainer(state, payload);
  if (!ctx) return state;
  const { info, keyhole, apply } = ctx;

  // holdedKey doit être undefined
  if (state.holdedKey !== undefined) return state;
  // keyhole doit avoir une présence
  if (!keyhole.presence) return state;

  if (info.position === undefined) {
    // Bundle : `e.position !== r.positioin && !e.presence` — typo intentionnel.
    // `r.positioin` est undefined → la condition est `e.position !== undefined && !presence`.
    // C'est une bizarrerie reproduite à l'identique. Concrètement, pour les
    // groupes/locks, on refuse la prise s'il existe un autre keyhole vide
    // avec une position définie. Pour les locks à clé unique (clelles), il
    // n'y a qu'un keyhole donc la garde passe.
    const others = Object.values(info.keyholes);
    const blocking = others.findIndex(
      (e) => e.position !== undefined && !e.presence,
    );
    if (blocking !== -1) return state;
  } else if (info.position !== keyhole.position) {
    return state;
  }

  const heldId = keyhole.presence as string;
  const newKeyhole: KeyHole = { ...keyhole, presence: false };
  const next = apply(newKeyhole);
  return { ...next, holdedKey: heldId };
}

// ===== putKey =====
//
// Bundle @251100 (PUT_KEY mutation) :
//   if (holdedKey && keyId.indexOf(holdedKey) !== -1 && !keyhole.presence) {
//     keyhole.presence = holdedKey; holdedKey = undefined;
//   }
// Note : pas de check de container.position ici (différent de takeKey).

export function putKey(
  state: PlayerData,
  payload: { lock?: boolean; groupId?: string; leverId?: string; keyId: string },
): PlayerData {
  const ctx = resolveContainer(state, payload);
  if (!ctx) return state;
  const { keyhole, apply } = ctx;

  if (state.holdedKey === undefined) return state;
  if (keyhole.presence) return state;
  // Test d'inclusion exact à la mutation Gessie : keyId.indexOf(holdedKey) !== -1
  if (payload.keyId.indexOf(state.holdedKey) === -1) return state;

  const newKeyhole: KeyHole = { ...keyhole, presence: state.holdedKey };
  const next = apply(newKeyhole);
  return { ...next, holdedKey: undefined };
}

// ===== takeCentralKey =====
//
// Bundle @251400 (TAKE_CENTRAL_KEY mutation) :
//   if (!holdedKey && centralLock.presence) {
//     // Pour chaque "groupe" g d'incompatibilities : g peut être string ou string[].
//     // Si pour TOUS les éléments t de g, AUCUNE clé absente avec keyId===t
//     // n'existe (i.e. toutes les clés t sont posées dans leurs centralLocks),
//     // alors le groupe BLOQUE la prise.
//     // takeCentralKey refuse si au moins un groupe bloque.
//   }

export function takeCentralKey(state: PlayerData, uid: string): PlayerData {
  const central = state.centralLocks[uid];
  if (!central) return state;
  if (state.holdedKey !== undefined) return state;
  if (!central.presence) return state;

  const incs = central.incompatibilities ?? [];
  const blocking = incs.find((entry) => {
    const arr = Array.isArray(entry) ? entry : [entry];
    // Pour chaque élément du groupe : on cherche un centralLock absent
    // (presence === false) avec keyId === élément. Si aucun trouvé → cet
    // élément ne fournit pas la garantie. Si TOUS les éléments du groupe
    // n'en fournissent pas, le groupe bloque.
    const idx = arr.findIndex((t) => {
      const found = Object.values(state.centralLocks).find(
        (cl) => cl.presence === false && cl.keyId === t,
      );
      return !found;
    });
    return idx === -1; // tous les éléments fournissent garantie → groupe bloque
  });
  if (blocking) return state;

  const heldId = central.presence as string;
  return {
    ...state,
    centralLocks: {
      ...state.centralLocks,
      [uid]: { ...central, presence: false },
    },
    holdedKey: heldId,
  };
}

// ===== putCentralKey =====
//
// Bundle @251800 :
//   if (holdedKey && !centralLock.presence) {
//     if (centralLock.keyId === holdedKey) {
//       centralLock.presence = holdedKey; holdedKey = undefined;
//     }
//   }
// Note : opérateur `!==` utilisé avec `||` dans le bundle, mais l'effet net
// est : on n'agit QUE si keyId === holdedKey.

// ===== toggleLock =====
//
// Bascule la position d'un cadenas (entrée de `state.locks`) entre 'plus' (N)
// et 'minus' (R). Repro Gessie (renderer.js) :
//   toggleLock(e, t) {
//     var n = v.locks[t], a = "N" === n.position ? "R" : "N";
//     ("N" != a || n.keyhole.presence) && e.commit("CHANGE_LOCK_POSITION", { keyId: t, newPosition: a });
//   }
//
// Sémantique des positions (annexe Ibis Gessie) :
//   - 'plus'  ≡ "N" (Normal / au repos)
//   - 'minus' ≡ "R" (Renversé / verrouillé)
//
// Garde : R→N (minus → plus) refusé si la clé n'est pas présente. N→R toujours
// autorisé.
//
// Note : le bundle lit `n.keyhole.presence` (sur ce qu'il prend pour un objet
// "lock" avec un nested keyhole), mais dans le port `state.locks[k]` EST le
// keyhole — on lit donc directement `lock.presence` (cohérent avec keys.ts:53,
// resolveContainer pour `lock:true`).

export function toggleLock(state: PlayerData, keyId: string): PlayerData {
  const lock = state.locks[keyId];
  if (!lock) return state;

  const newPos: 'plus' | 'minus' = lock.position === 'plus' ? 'minus' : 'plus';

  // R→N (minus→plus) : refusé sans clé présente.
  if (newPos === 'plus' && !lock.presence) return state;

  return {
    ...state,
    locks: {
      ...state.locks,
      [keyId]: { ...lock, position: newPos },
    },
  };
}

export function putCentralKey(state: PlayerData, uid: string): PlayerData {
  const central = state.centralLocks[uid];
  if (!central) return state;
  if (state.holdedKey === undefined) return state;
  if (central.presence) return state;
  if (central.keyId !== state.holdedKey) return state;

  return {
    ...state,
    centralLocks: {
      ...state.centralLocks,
      [uid]: { ...central, presence: state.holdedKey },
    },
    holdedKey: undefined,
  };
}
