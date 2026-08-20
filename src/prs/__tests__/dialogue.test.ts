// Répliques composées des conducteurs — `dial()`, `dialv()`, `dialj()`,
// `dialok()` et `dialokz()`.
//
// Le poste d'origine compose ses appels radio au lieu de les réciter : huit
// ouvertures, sept suites, quatre politesses, quatre collationnements, et deux
// bascules horaires. Ces essais vérifient que le portage tire bien dans toutes
// ces tables, qu'il respecte les deux règles de politesse du source — l'heure,
// et le fait qu'on ne salue pas deux fois — et qu'il reste **reproductible**,
// ce que l'original n'est pas.

import { describe, expect, it } from 'vitest';
import {
  appelDepartVoieCentrale,
  appelSignal,
  collationnement,
  salutation,
  tirage,
} from '../dialogue';
import { createInitialState, tick } from '../engine';
import type { PrsState } from '../engine';
import { startTraffic } from '../traffic';
import { T } from './helpers';

/** Un échantillon de numéros de circulation du poste. */
const NUMS = [
  135_357, 135_359, 135_361, 135_363, 135_365, 135_872, 135_874, 135_876, 135_002, 135_004,
  403_002, 403_527, 403_529, 135_579, 135_581, 135_193, 135_198, 135_200, 558_801, 135_719,
];

const appelC81 = (num: number, heure = 10) =>
  appelSignal({ num, signal: 'c81', motif: 'ferme', heure, cle: 'arret' });

describe('le tirage est reproductible', () => {
  it('la même situation redonne toujours la même phrase', () => {
    // L'original tire à `Math.random()` ; ici le tirage dérive de la graine,
    // sans quoi le moteur cesserait d'être une fonction de son état.
    for (const n of NUMS) expect(appelC81(n)).toBe(appelC81(n));
  });

  it('mais deux trains ne s’expriment pas pareil', () => {
    const dites = new Set(NUMS.map((n) => appelC81(n)));
    expect(dites.size).toBeGreaterThan(NUMS.length / 2);
  });

  it('et un même train ne dit pas la même chose à deux signaux', () => {
    const c81 = appelSignal({ num: 135_357, signal: 'c81', motif: 'ferme', heure: 10, cle: 'a' });
    const c82 = appelSignal({ num: 135_357, signal: 'c82', motif: 'ferme', heure: 10, cle: 'a' });
    expect(c81.replace('81', '')).not.toBe(c82.replace('82', ''));
  });

  it('le brassage couvre bien toutes les entrées des tables', () => {
    // Sans brassage final, des numéros voisins retombent sur la même réplique.
    const ouvertures = new Set<string>();
    const suites = new Set<string>();
    for (let n = 135_000; n < 135_400; n += 2) {
      const p = appelC81(n);
      ouvertures.add(p.slice(0, p.indexOf(String(n))));
      suites.add(p.slice(p.indexOf(String(n)) + 6));
    }
    expect(ouvertures.size).toBe(8);
    // Sept suites, dont une qui a deux formes selon que l'ouverture a déjà
    // salué ou non : huit fins de phrase distinctes.
    expect(suites.size).toBe(8);
  });
});

describe('la politesse suit l’heure', () => {
  /**
   * Seules les deux premières ouvertures de la table changent avec l'heure.
   * On les reconnaît à cela — « Salut, le », d'indice 6, salue aussi mais ne
   * bouge pas.
   */
  const ouverture = (n: number, sig: 'c81' | 'cv85', heure: number) => {
    const p = appelSignal({ num: n, signal: sig, motif: 'ferme', heure, cle: 'arret' });
    return p.slice(0, p.indexOf(String(n)));
  };
  const ouvertureHoraire = (n: number, sig: 'c81' | 'cv85' = 'c81') =>
    ouverture(n, sig, 8) !== ouverture(n, sig, 22);

  it('« bonjour » avant 18 h, « bonsoir » après — carré', () => {
    // `dial()` : `if (hh<18){dphra="Salut, le conducteur du ";} else {…Bonsoir…}`
    const n = NUMS.find((x) => ouvertureHoraire(x))!;
    expect(appelC81(n, 17)).toMatch(/^(Salut, le conducteur|Bonjour, conducteur)/);
    expect(appelC81(n, 18)).toMatch(/^Bonsoir/);
  });

  it('le carré violet bascule à 19 h, pas à 18 h', () => {
    // `dialv()` reprend `dial()` en décalant la bascule d'une heure : une
    // incohérence du source, reprise telle quelle.
    const violet = (num: number, heure: number) =>
      appelSignal({ num, signal: 'cv85', motif: 'ferme', heure, cle: 'arret' });
    const n = NUMS.find((x) => ouvertureHoraire(x, 'cv85'))!;
    expect(violet(n, 18)).toMatch(/^(Salut, le conducteur|Bonjour, conducteur)/);
    expect(violet(n, 19)).toMatch(/^Bonsoir/);
  });

  it('une ouverture qui a déjà salué ne fait pas redire bonjour à la suite', () => {
    // `if ((diald==0)||(diald==1)){fphra=" pour le PRS de Springfiel, …"}`
    for (let n = 135_000; n < 136_000; n += 2) {
      if (!ouvertureHoraire(n)) continue;
      const p = appelC81(n, 10);
      expect(p, p).not.toMatch(/Springfield bonjour/);
    }
  });

  it("« Salut, le », lui, salue bel et bien deux fois — comme dans l'original", () => {
    // La garde du source ne porte que sur les indices 0 et 1 : l'ouverture
    // d'indice 6 salue sans que la suite le sache. On garde le travers.
    let vu = false;
    for (let n = 135_000; n < 136_000; n += 2) {
      const p = appelC81(n, 10);
      if (/^Salut, le \d/.test(p) && /Springfield bonjour/.test(p)) vu = true;
    }
    expect(vu).toBe(true);
  });
});

describe('chaque signal a sa nomenclature', () => {
  it('le carré violet ne s’annonce jamais comme un carré ordinaire', () => {
    for (const n of NUMS) {
      const p = appelSignal({ num: n, signal: 'cv85', motif: 'ferme', heure: 10, cle: 'a' });
      expect(p, p).toMatch(/Cv 85|Carré violet 85|carré violet 85/);
    }
  });

  it('l’œilleton n’est mentionné que pour un carré', () => {
    // `dial()` : « éteint ainsi que son oeilleton » ; `dialv()` : « éteint ».
    const carre = appelSignal({ num: 135_357, signal: 'c81', motif: 'eteint', heure: 10, cle: 'a' });
    const violet = appelSignal({ num: 135_357, signal: 'cv85', motif: 'eteint', heure: 10, cle: 'a' });
    expect(carre).toMatch(/éteint ainsi que son œilleton/);
    expect(violet).toMatch(/85 éteint,/);
    expect(violet).not.toMatch(/œilleton/);
  });

  it('le départ de la voie centrale a ses trois annonces', () => {
    const dites = new Set<string>();
    for (let n = 135_000; n < 135_200; n += 2) {
      const p = appelDepartVoieCentrale(n, 12, 'depart');
      dites.add(p.slice(p.indexOf(String(n)) + 6));
    }
    expect(dites.size).toBe(3);
  });
});

describe('collationnement et formule finale', () => {
  it('les quatre accusés de réception sortent', () => {
    const vus = new Set(NUMS.map((n) => collationnement(`${n}-ordre-11`)));
    expect([...vus].sort()).toEqual(['bien compris', 'bien reçu', 'compris', 'entendu']);
  });

  it('la formule de journée suit l’heure', () => {
    // `dialj()` : matinée / journée / appétit / après-midi / soirée.
    const journee = (heure: number) => {
      for (let n = 135_000; n < 136_000; n += 2) {
        const p = salutation(String(n), heure);
        if (p && !['bon courage', 'bonne continuation'].includes(p)) return p;
      }
      throw new Error('aucune formule de journée tirée');
    };
    expect(journee(7)).toBe('bonne matinée');
    expect(journee(10)).toBe('bonne journée');
    expect(journee(12)).toBe('bon appétit');
    expect(journee(14)).toBe('bon après-midi');
    expect(journee(20)).toBe('bonne soirée');
  });

  it('le conducteur ne prend pas toujours la peine de saluer', () => {
    // `if (dialjz==3){phraj="";}` — une fois sur quatre.
    const vides = NUMS.filter((n) => salutation(String(n), 10) === '').length;
    expect(vides).toBeGreaterThan(0);
    expect(vides).toBeLessThan(NUMS.length);
  });

  it('le tirage reste dans les bornes', () => {
    for (let i = 0; i < 500; i += 1) {
      const v = tirage(`graine-${i}`, 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });
});

describe('dans le trafic', () => {
  const journal = (s: PrsState) => s.log.map((e) => e.text).join('\n');

  it("l'arrêt au C 81 est un appel composé, pas une phrase toute faite", () => {
    let s = createInitialState();
    startTraffic(s, T);
    for (let now = T; now <= T + 60_000; now += 1_000) s = tick(s, now);
    const appel = s.log.map((e) => e.text).find((x) => /81 fermé, à toi !$/.test(x));
    expect(appel, journal(s)).toBeDefined();
    // La réplique s'ouvre sur la formule du conducteur, pas sur un préfixe.
    expect(appel).not.toMatch(/^Conducteur du \d+ —/);
    expect(appel).toMatch(/13\d{4}/);
  });

  it('le collationnement du bulletin Cba est rendu', () => {
    let s = createInitialState();
    startTraffic(s, T);
    for (let now = T; now <= T + 40_000; now += 1_000) s = tick(s, now);
    const train = s.trains.find((x) => x.thread === 'A')!;
    s = {
      ...s,
      cba: { ...s.cba, pending: true, forCv88: false, train: train.num, signal: 81, carre: true, trans: 'transmis par radio' },
    };
    for (let now = T + 41_000; now <= T + 90_000; now += 1_000) s = tick(s, now);
    expect(journal(s)).toMatch(/C'est (compris|bien reçu|entendu|bien compris) Springfield/);
  });
});
