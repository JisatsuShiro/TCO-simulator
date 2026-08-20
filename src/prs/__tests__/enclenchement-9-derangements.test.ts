// § 4.9 — Dérangements : zone, aiguille, signal, itinéraire.
//
// Référence : `enclenchement.md` § 4.9, et `fimm()`, `ffX()`, `feX()`,
// `fderangmt*()` du source.

import { describe, expect, it } from 'vitest';
import { depuisRepos, T } from './helpers';
import {
  destroyRoute,
  pressRoute,
  setAigFault,
  setRouteFault,
  setSignalFault,
  setZoneFault,
  zonesForFault,
} from '../engine';
import { ROUTE_BY_ID } from '../topology';

describe('§4.9 dérangement de zone — fimm()', () => {
  it("occupe la zone et ses tronçons selon la position des aiguilles", () => {
    const s = depuisRepos((x) => setZoneFault(x, 'z81a'));
    expect(s.zones.z81).toBe(2);
    expect(s.zones.z81bis).toBe(2); // `if (cag85b=="g") {z81bis=2;}`
  });

  it('la propagation suit la commande, pas le contrôle', () => {
    // `fimm()` teste `cag81b`, `cag82`, `cag83b`, `cag81a`, `cag83a`.
    const s = depuisRepos((x) => setZoneFault(x, 'z82'));
    expect(zonesForFault(s, 'z82')).toEqual(['z82a', 'z82b', 'z82c']);
  });

  it("z8382 cumule les deux propagations", () => {
    const s = depuisRepos((x) => setZoneFault(x, 'z8382'));
    expect(zonesForFault(s, 'z8382')).toEqual(['z82a', 'z82b', 'z82c', 'z83b']);
  });

  it('une zone occupée referme le signal et bloque la manœuvre', () => {
    const s = depuisRepos(
      (x) => setZoneFault(x, 'z81a'), // occupe z81
      (x) => pressRoute(x, 'agnida', T),
    );
    expect(s.established.agnida).toBe(true);
    expect(s.signals.c81).toBe(1);
  });
});

describe("§4.9 dérangement d'aiguille", () => {
  it("la commande passe, le contrôle non, et le D.I s'allume", () => {
    // `ffX()` : `if (dergmta=="aig81ag"){aig81a=0;di=1;lev81a="g";}`
    const s = depuisRepos(
      (x) => setAigFault(x, { id: 'aig81a', kind: 'noCtrlD' }),
      (x) => pressRoute(x, 'agnida', T), // veut 81a à droite
    );
    expect(s.cag.aig81a).toBe('d');
    expect(s.aig.aig81a).toBe(0);
    expect(s.di).toBe(1);
    expect(s.signals.c81).toBe(1);
  });

  it("le dérangement électrique empêche l'aiguille de bouger au terrain", () => {
    // `elec` : la commande n'atteint pas le moteur, `levNN` reste où il était.
    const s = depuisRepos(
      (x) => setAigFault(x, { id: 'aig81a', kind: 'elec' }),
      (x) => pressRoute(x, 'dgni', T), // veut 81a à gauche
    );
    expect(s.cag.aig81a).toBe('g');
    expect(s.lev.aig81a).toBe('d'); // inchangé
    expect(s.aig.aig81a).toBe(0);
  });
});

describe('§4.9 dérangement de signal', () => {
  it("raté d'ouverture : fermé au terrain, ouvert au tableau", () => {
    // `if (((dergmts=="roc81")||(dergmts=="exc81"))&&(c81==0)) {kit81=1;c81=1;
    //   document.images["c81"].src="tco/c810.gif";}`
    // La variable dit fermé, l'image montre le carré ouvert — `c810.gif` n'a
    // aucun pixel rouge.
    const s = depuisRepos(
      (x) => pressRoute(x, 'agnida', T),
      (x) => setSignalFault(x, { id: 'c81', kind: 'ro' }),
    );
    expect(s.signals.c81).toBe(1); // terrain : fermé
    expect(s.signalsDisplay.c81).toBe(0); // tableau : ouvert
  });

  it("il pose quand même la mémoire d'ouverture", () => {
    const s = depuisRepos(
      (x) => pressRoute(x, 'agnida', T),
      (x) => setSignalFault(x, { id: 'c81', kind: 'ro' }),
    );
    expect(s.kit['81']).toBe(1);
  });

  it("l'extinction se comporte comme le raté d'ouverture", () => {
    const s = depuisRepos(
      (x) => pressRoute(x, 'agnida', T),
      (x) => setSignalFault(x, { id: 'c81', kind: 'ex' }),
    );
    expect(s.signals.c81).toBe(1);
    expect(s.signalsDisplay.c81).toBe(0);
  });

  it("n'agit pas sur un signal qui serait fermé de toute façon", () => {
    const s = depuisRepos((x) => setSignalFault(x, { id: 'c81', kind: 'ro' }));
    expect(s.signals.c81).toBe(1);
    expect(s.signalsDisplay.c81).toBe(1);
  });
});

describe("§4.9 dérangement d'itinéraire", () => {
  it('le raté de formation empêche le transit', () => {
    const s = depuisRepos(
      (x) => setRouteFault(x, { id: 'agnida', kind: 'formation' }),
      (x) => pressRoute(x, 'agnida', T),
    );
    expect(s.established.agnida).toBe(false);
    expect(s.b.agnida).toBe(3);
  });

  it("le raté de destruction ne joue qu'au passage du train", () => {
    // `dergmti` n'est testé que dans les étapes du moteur de trafic ; les
    // `dX()` ne le consultent jamais.
    const s = depuisRepos(
      (x) => pressRoute(x, 'agnida', T),
      (x) => setRouteFault(x, { id: 'agnida', kind: 'destruction' }),
      (x) => pressRoute(x, 'agnida', T + 1_000), // destruction au bouton
    );
    expect(s.established.agnida).toBe(false);
  });

  it("mais il bloque la destruction automatique", () => {
    const s = depuisRepos(
      (x) => pressRoute(x, 'agnida', T),
      (x) => setRouteFault(x, { id: 'agnida', kind: 'destruction' }),
    );
    destroyRoute(s, ROUTE_BY_ID.agnida, T + 1_000, 'passage du train', true);
    expect(s.established.agnida).toBe(true);
    expect(s.b.agnida).toBe(1);
  });
});
