// § 4.4 — Conditions d'ouverture des signaux.
//
// Référence : `enclenchement.md` § 4.4. Chaque `feX()` teste, dans l'ordre :
// bouton établi, transit posé, carré non fermé à la main, zones non occupées,
// contrôles d'aiguille **effectifs**. La formulation y est positive
// (`aig81a == "d"`), contrairement au test de transit du § 4.2.

import { describe, expect, it } from 'vitest';
import { depuisRepos, occupe, T } from './helpers';
import { createInitialState, pressRoute, toggleCarreClose } from '../engine';
import type { PrsState } from '../engine';
import { ROUTES } from '../topology';
import type { AigId, AigPos, RouteId, ZoneId } from '../topology';

/** Appui-relâché sur un bouton de fermeture sans rapport : force un recalcul. */
const recalcule = (s: PrsState): PrsState => toggleCarreClose(toggleCarreClose(s, 'c82'), 'c82');

const ouvert = (s: PrsState, sig: 'c81' | 'c82' | 'c84' | 'cv83' | 'cv85' | 'cv88') =>
  s.signals[sig] === 0;

describe('§4.4 les tables de conditions transcrivent les feX()', () => {
  // Relevé littéral des dix conditions de `PRS/construc/gaestro.js`.
  const SOURCE: Partial<
    Record<RouteId, { libres: ZoneId[]; aig: Partial<Record<AigId, AigPos>> }>
  > = {
    agnida: { libres: ['z81'], aig: { aig81a: 'd', aig83a: 'g', aig85a: 'g', aig85b: 'g' } },
    agnitp: { libres: ['z81'], aig: { aig81a: 'd', aig83a: 'g', aig85a: 'g', aig85b: 'g' } },
    agnu: {
      libres: ['z81', 'z81b', 'z83b', 'z84'],
      aig: { aig81a: 'd', aig83a: 'd', aig83b: 'd', aig85a: 'g', aig85b: 'g' },
    },
    amni: { libres: ['z89', 'z81'], aig: { aig85a: 'd', aig85b: 'd', aig81a: 'd', aig83a: 'g' } },
    amnu: {
      libres: ['z89', 'z81', 'z81b', 'z83b', 'z84'],
      aig: { aig85a: 'd', aig85b: 'd', aig81a: 'd', aig83a: 'd', aig83b: 'd' },
    },
    nuam: {
      libres: ['z83b', 'z89', 'z81', 'z81b'],
      aig: { aig81a: 'd', aig83a: 'd', aig83b: 'd', aig85a: 'd', aig85b: 'd' },
    },
    dgni: {
      libres: ['z82a', 'z81b', 'z85', 'z87'],
      aig: { aig81a: 'g', aig81b: 'g', aig83a: 'g' },
    },
    nzdgda: { libres: ['z82a'], aig: { aig81b: 'd', aig82: 'd' } },
    nzdgtp: { libres: ['z82a'], aig: { aig81b: 'd', aig82: 'd' } },
    nudgvi: { libres: ['z83b'], aig: { aig81a: 'g', aig81b: 'g', aig83a: 'd', aig83b: 'd' } },
    nudgvz: { libres: ['z83b'], aig: { aig81b: 'd', aig83b: 'g', aig82: 'g' } },
  };

  it.each(Object.keys(SOURCE) as RouteId[])('%s exige les mêmes zones et aiguilles', (id) => {
    const r = ROUTES.find((x) => x.id === id)!;
    expect([...r.openNeedsFree].sort()).toEqual([...SOURCE[id]!.libres].sort());
    expect(r.openNeedsSwitches).toEqual(SOURCE[id]!.aig);
  });
});

describe('§4.4 une zone occupée referme le signal', () => {
  it("z81 occupée : le C 81 reste fermé bien que l'itinéraire soit formé", () => {
    const s = depuisRepos(occupe('z81'), (x) => pressRoute(x, 'agnida', T));
    expect(s.established.agnida).toBe(true);
    expect(ouvert(s, 'c81')).toBe(false);
  });

  it('z84 occupée referme le C 81 de AG-NU, quatre zones en amont', () => {
    const s = depuisRepos(occupe('z84'), (x) => pressRoute(x, 'agnu', T));
    expect(ouvert(s, 'c81')).toBe(false);
  });

  it("z85 n'entre pas dans les conditions de AG-N1 mais bien dans celles de DG-N1", () => {
    expect(ouvert(depuisRepos(occupe('z85'), (x) => pressRoute(x, 'agnida', T)), 'c81')).toBe(true);
    expect(ouvert(depuisRepos(occupe('z85'), (x) => pressRoute(x, 'dgni', T)), 'cv83')).toBe(false);
  });
});

describe('§4.4 un contrôle perdu referme le signal', () => {
  it("formulation positive : `aig81a == \"d\"`, un contrôle absent ne suffit pas", () => {
    const s = depuisRepos(
      (x) => {
        x.aig.aig81a = 0;
        return pressRoute(x, 'agnida', T);
      },
    );
    expect(s.established.agnida).toBe(true); // le transit se pose (§4.2)
    expect(ouvert(s, 'c81')).toBe(false); // le signal, non
  });
});

describe('§4.4 le bouton de fermeture de carré', () => {
  it('maintenu, il referme le C 81', () => {
    const s = depuisRepos(
      (x) => pressRoute(x, 'agnida', T),
      (x) => toggleCarreClose(x, 'c81'),
    );
    expect(ouvert(s, 'c81')).toBe(false);
  });

  it("n'existe que pour les trois carrés, pas pour les carrés violets", () => {
    // `feamni()` et `fedgni()` ne testent aucun `bfc` : seuls C 81, C 82 et
    // C 84 en ont un au pupitre.
    expect(Object.keys(createInitialState().fc).sort()).toEqual(['c81', 'c82', 'c84']);
  });
});

describe('§4.4 enclenchement en cascade du mouvement NU → AM', () => {
  it("le Cv 88 s'ouvre sur NU-AM", () => {
    expect(ouvert(depuisRepos((x) => pressRoute(x, 'nuam', T)), 'cv88')).toBe(true);
  });

  it("le C 84 attend en plus l'autorisation d'accès EP MOE", () => {
    // `fenuam()` : `… && (cv88==0) && … && (vauac==1)`.
    const s = depuisRepos((x) => pressRoute(x, 'nuam', T));
    expect(s.vauac).not.toBe(1);
    expect(ouvert(s, 'c84')).toBe(false);
  });
});

describe('§4.4 le Cv 88 ne se recalcule pas comme les autres', () => {
  // `fenuam()` : `if (cv88==1) { …test d'ouverture… }`. Une fois ouvert, le
  // test n'est plus joué — le signal reste ouvert.
  const nuamOuvert = depuisRepos((x) => pressRoute(x, 'nuam', T));

  it('il reste ouvert quand z81b se libère', () => {
    const s = recalcule({ ...nuamOuvert, zones: { ...nuamOuvert.zones, z81b: 0 } });
    expect(ouvert(s, 'cv88')).toBe(true);
  });

  it('il se ferme quand le couple 85 quitte sa position', () => {
    const s = recalcule({ ...nuamOuvert, aig: { ...nuamOuvert.aig, aig85a: 'g' } });
    expect(ouvert(s, 'cv88')).toBe(false);
  });
});
