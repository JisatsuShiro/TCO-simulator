// § 4.1 — Enclenchement d'itinéraire : le verrouillage des aiguilles par les zones.
//
// Référence : `enclenchement.md` § 4.1, et les fonctions `ffX()` de
// `PRS/construc/gaestro.js`. Chaque groupe d'aiguilles porte une garde,
// identique dans tous les `ffX()`, qu'un annulateur de transit peut lever.

import { describe, expect, it } from 'vitest';
import { atr, contraire, depuisRepos, et, manoeuvre, occupe, T } from './helpers';
import { pressRoute } from '../engine';
import type { PrsState } from '../engine';

describe('§4.1 groupe 85 — (z81==0 ‖ bannul2) && (z89==0 ‖ bannul1)', () => {
  it('zone 81 prise : la manœuvre est refusée', () => {
    expect(manoeuvre(occupe('z81'), 'amni', 'aig85a')).toBe(false);
  });

  it("zone 81 prise mais annulateur 2 actionné : la manœuvre passe", () => {
    expect(manoeuvre(et(occupe('z81'), atr(2)), 'amni', 'aig85a')).toBe(true);
  });

  it('zone 89 prise : la manœuvre est refusée', () => {
    expect(manoeuvre(occupe('z89'), 'amni', 'aig85a')).toBe(false);
  });

  it("zone 89 prise mais annulateur 1 actionné : la manœuvre passe", () => {
    expect(manoeuvre(et(occupe('z89'), atr(1)), 'amni', 'aig85a')).toBe(true);
  });

  it("un annulateur hors périmètre ne lève pas la garde", () => {
    expect(manoeuvre(et(occupe('z81'), atr(1)), 'amni', 'aig85a')).toBe(false);
  });
});

describe("§4.1 clause Au.M — (z89==0) ‖ (bannul1 && tannzii && aum!=1)", () => {
  // `ffaum()` pose déjà `z89 = 1` : une autorisation en cours bloque de toute
  // façon ces itinéraires par la garde ordinaire. La clause ne sert qu'à
  // fermer l'échappatoire par l'annulateur 1. On pose donc l'autorisation
  // directement — la former manœuvrerait les aiguilles 85.
  const auMoe = (s: PrsState): PrsState => {
    s.established.aum = true;
    return s;
  };
  const situation = et(occupe('z89'), atr(1), auMoe);

  it.each(['amni', 'amnu', 'nuam'] as const)(
    "%s ramène les 85 vers la voie mère : l'annulateur 1 ne lève plus la garde",
    (route) => {
      expect(manoeuvre(situation, route, 'aig85a')).toBe(false);
    },
  );

  it("AG-N1 ne porte pas la clause : l'annulateur 1 lève la garde", () => {
    expect(
      manoeuvre(et(contraire('aig85a', 'aig85b'), occupe('z89'), atr(1), auMoe), 'agnida', 'aig85a'),
    ).toBe(true);
  });

  it("autorisation seule, zone 89 libre : c'est la prise de z89 qui bloque", () => {
    // Vérifie le mécanisme sous-jacent : `ffaum()` enclenche la zone 89.
    const s = depuisRepos((x) => pressRoute(x, 'aum', T));
    expect(s.established.aum).toBe(true);
    expect(s.zones.z89).toBe(1);
  });
});

describe('§4.1 groupe 81 — (z81b==0 ‖ bannul2) && (z82a==0 ‖ bannul3)', () => {
  const inverse = contraire('aig81a', 'aig81b');

  it('zone 81b prise : la manœuvre est refusée', () => {
    expect(manoeuvre(occupe('z81b'), 'agnida', 'aig81a')).toBe(false);
  });

  it('zone 81b prise mais annulateur 2 actionné : la manœuvre passe', () => {
    expect(manoeuvre(et(inverse, occupe('z81b'), atr(2)), 'agnida', 'aig81a')).toBe(true);
  });

  it('zone 82a prise : la manœuvre est refusée', () => {
    expect(manoeuvre(occupe('z82a'), 'agnida', 'aig81a')).toBe(false);
  });

  it('zone 82a prise mais annulateur 3 actionné : la manœuvre passe', () => {
    expect(manoeuvre(et(inverse, occupe('z82a'), atr(3)), 'agnida', 'aig81a')).toBe(true);
  });

  it("l'annulateur 2 ne couvre pas la zone 82a", () => {
    expect(manoeuvre(et(inverse, occupe('z82a'), atr(2)), 'agnida', 'aig81a')).toBe(false);
  });
});

describe('§4.1 groupe 83 — ((z81b==0 && z83b==0) ‖ bannul2)', () => {
  it('zone 83b prise : la manœuvre est refusée', () => {
    expect(manoeuvre(occupe('z83b'), 'agnu', 'aig83a')).toBe(false);
  });

  it('les deux zones prises mais annulateur 2 actionné : la manœuvre passe', () => {
    // Le port exprime la garde en deux termes indépendants. Avec un
    // annulateur unique, `(a‖x)&&(b‖x)` ≡ `(a&&b)‖x` : c'est équivalent.
    expect(manoeuvre(et(occupe('z81b', 'z83b'), atr(2)), 'agnu', 'aig83a')).toBe(true);
  });
});

describe('§4.1 groupe 82 — (z82b==0 ‖ bannul3)', () => {
  it('zone 82b prise : la manœuvre est refusée', () => {
    expect(manoeuvre(occupe('z82b'), 'nzdgda', 'aig82')).toBe(false);
  });

  it('zone 82b prise mais annulateur 3 actionné : la manœuvre passe', () => {
    expect(manoeuvre(et(contraire('aig82'), occupe('z82b'), atr(3)), 'nzdgda', 'aig82')).toBe(true);
  });
});

describe('§4.1 clause (amni==0 ‖ z81==0) sur les groupes 81 et 83', () => {
  const amEtabli = (s: PrsState): PrsState => pressRoute(s, 'amni', T);

  it("un transit AM-N1 en cours interdit de reprendre le groupe 81", () => {
    expect(manoeuvre(amEtabli, 'dgni', 'aig81a')).toBe(false);
  });

  it("un transit AM-N1 en cours interdit de reprendre le groupe 83", () => {
    expect(manoeuvre(amEtabli, 'nudgvi', 'aig83a')).toBe(false);
  });
});
