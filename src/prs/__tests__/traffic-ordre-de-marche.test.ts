// L'ordre de marche, relu à chaque étape.
//
// « De ne pas se remettre en marche jusqu'à nouvel avis » est la première des
// quatre propositions de l'imprimé Ordre / Avis. Une fois collationné, il pose
// `aamarche = 0` et **trente-trois étapes** du moteur de trafic le relisent
// avant de laisser le train avancer.
//
// Trois de ces étapes ont une forme à part : celles où le train est déjà
// engagé **sur** l'aiguille (`taquatreat()`, `tacquatreat()`, `tbsixat()`).
// Le source y lie la position de l'appareil et l'ordre de marche dans une
// seule garde :
//
//   if ((lev85b=="g")&&(aamarche==1)) {…avancer…} else {…dérailler…}
//
// Hors marche au pas le train patiente ; **sous** marche au pas il déraille —
// on n'arrête pas un train à cheval sur une aiguille.

import { describe, expect, it } from 'vitest';
import { createInitialState, pressRoute, sendOrdre } from '../engine';
import type { PrsState } from '../engine';
import { advanceTraffic, nextTrafficDue, startTraffic, trainStatus } from '../traffic';
import type { Train } from '../traffic';
import { T } from './helpers';

const a = (s: PrsState, etape: string): Train | undefined =>
  s.trains.find((t) => {
    const st = trainStatus(t);
    return st.endsWith(`— ${etape}`) || st.endsWith(`(${etape})`);
  });

/** Fait tourner le trafic jusqu'à ce qu'un train soit sur le point de jouer l'étape. */
function jusquA(s: PrsState, etape: string, limite = 400): Train {
  let now = T;
  for (let i = 0; i < limite; i += 1) {
    const t = a(s, etape);
    if (t) return t;
    const due = nextTrafficDue(s);
    if (due == null) break;
    now = Math.max(now, due);
    advanceTraffic(s, now);
  }
  throw new Error(
    `étape « ${etape} » jamais atteinte — trains : ${s.trains.map(trainStatus).join(', ')}`,
  );
}

/** Joue les `n` étapes suivantes de ce train. */
function joue(s: PrsState, t: Train, n = 1): void {
  for (let i = 0; i < n; i += 1) advanceTraffic(s, t.dueAt);
}

/** AG-N1 formé, trafic souple lancé. */
function poste(): PrsState {
  const s = pressRoute(createInitialState(), 'agnida', T);
  startTraffic(s, T);
  return s;
}

/** Remet à un train l'ordre « ne pas se remettre en marche ». */
function ordreDArret(s: PrsState, t: Train): PrsState {
  return sendOrdre(s, { train: String(t.num), checked: [true, false, false, false], aigpas: null });
}

/** Remet l'ordre « franchir l'aiguille … au pas ». */
function ordreAuPas(s: PrsState, t: Train, aig: 'aig85b' | 'aig81b'): PrsState {
  return sendOrdre(s, { train: String(t.num), checked: [false, false, true, false], aigpas: aig });
}

const journal = (s: PrsState) => s.log.map((e) => e.text).join('\n');

describe("un train engagé sur l'aiguille respecte l'ordre d'arrêt", () => {
  it('il patiente au lieu de poursuivre', () => {
    // `taquatreat()` : `if (aamarche==1){…taquatren()…} else{…taquatreat()…}`
    const s = poste();
    const t = jusquA(s, 'taquatreat');
    const x = ordreDArret(s, t);
    Object.assign(s, x, { trains: s.trains });
    joue(s, t, 6);

    expect(t.marche).toBe(false);
    expect(trainStatus(t)).toMatch(/taquatreat/);
    expect(s.traffic).toBe(true);
  });

  it('et repart dès que l’ordre est levé', () => {
    const s = poste();
    const t = jusquA(s, 'taquatreat');
    Object.assign(s, ordreDArret(s, t), { trains: s.trains });
    joue(s, t, 3);
    expect(trainStatus(t)).toMatch(/taquatreat/);

    // « Vous pouvez vous remettre en marche » — la quatrième proposition.
    const reprise = sendOrdre(s, {
      train: String(t.num),
      checked: [false, false, false, true],
      aigpas: null,
    });
    Object.assign(s, reprise, { trains: s.trains });
    joue(s, t, 3);

    expect(t.marche).toBe(true);
    expect(trainStatus(t)).not.toMatch(/taquatreat/);
  });
});

describe('sous marche au pas, le même ordre fait dérailler', () => {
  it("le train à cheval sur l'aiguille ne peut plus s'arrêter", () => {
    // `if ((lev85b=="g")&&(aamarche==1)) {…} else {dérailler}` : au pas, les
    // deux conditions partagent la même garde. C'est un travers du source,
    // mais il dit quelque chose de juste — on n'immobilise pas un train
    // engagé sur un appareil de voie.
    const s = poste();
    // L'ordre de marche au pas est remis pendant l'approche…
    const t = jusquA(s, 'attvi');
    Object.assign(s, ordreAuPas(s, t, 'aig85b'), { trains: s.trains });
    joue(s, t, 1);
    expect(t.auPas).toBe('aig85b');

    // … et l'ordre d'arrêt tombe alors que le train est sur l'aiguille.
    const u = jusquA(s, 'taquatreat');
    Object.assign(s, ordreDArret(s, u), { trains: s.trains });
    joue(s, u, 2);

    expect(journal(s)).toMatch(/a déraillé sur l'aiguille 85b/);
    expect(s.traffic).toBe(false);
  });
});

describe('la marche au pas ralentit le franchissement', () => {
  /**
   * Délai que le train se donne pour franchir l'étape nommée, avec ou sans
   * ordre de marche au pas. Celui-ci lui est remis pendant l'approche, avant
   * qu'il n'aborde l'aiguille : une étape franchie ne se rejoue pas.
   */
  function delai(
    depart: () => PrsState,
    approche: string,
    etape: string,
    aig: 'aig85b' | 'aig81b' | null,
  ): number {
    const s = depart();
    if (aig) {
      const t = jusquA(s, approche);
      Object.assign(s, ordreAuPas(s, t, aig), { trains: s.trains });
      joue(s, t, 1);
    }
    const u = jusquA(s, etape);
    const avant = u.dueAt;
    advanceTraffic(s, u.dueAt);
    return u.dueAt - avant;
  }

  const posteB = () => {
    const s = pressRoute(createInitialState(), 'nzdgda', T);
    startTraffic(s, T);
    return s;
  };

  it('`taquatreat` : 8 s au pas contre 1 s en marche normale', () => {
    expect(delai(poste, 'attvi', 'taquatreat', null)).toBe(1_000);
    expect(delai(poste, 'attvi', 'taquatreat', 'aig85b')).toBe(8_000);
  });

  it('`tbsixat` : 12 s au pas contre 4 s en marche normale', () => {
    // Le fil B : `if ((lev81b=="d")&&(bbmarche==1)){…tbsix()…,12000}`.
    expect(delai(posteB, 'attvz', 'tbsixat', null)).toBe(4_000);
    expect(delai(posteB, 'attvz', 'tbsixat', 'aig81b')).toBe(12_000);
  });
});
