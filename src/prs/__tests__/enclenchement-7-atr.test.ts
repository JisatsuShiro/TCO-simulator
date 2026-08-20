// § 4.7 — A.T.R. : portée de destruction d'une annulation de transit.
//
// Référence : `enclenchement.md` § 4.7 et les fonctions `dtri()`, `dtrz()`,
// `dtre()` de `PRS/construc/gaestro.js`. L'annulateur ne balaie pas tout ce qui
// croise son périmètre : il ne défait qu'un transit **attardé**.

import { describe, expect, it } from 'vitest';
import { depuisRepos, T } from './helpers';
import { annulAtr, armAtr, pressRoute } from '../engine';
import type { PrsState } from '../engine';
import type { RouteId } from '../topology';

/** Forme un itinéraire, met éventuellement son bouton dans un autre état, annule. */
const scenario = (route: RouteId, bouton: number | null, n: 1 | 2 | 3, occupee?: 'z81') =>
  depuisRepos(
    (s) => pressRoute(s, route, T),
    (s) => {
      if (bouton !== null) s.b[route] = bouton as PrsState['b'][RouteId];
      if (occupee) s.zones[occupee] = 2;
      return annulAtr(armAtr(s, n), n, T + 1_000);
    },
  );

describe("§4.7 l'annulateur épargne les itinéraires vivants", () => {
  it("bouton en état 1 : l'itinéraire n'est pas détruit", () => {
    expect(scenario('amni', null, 1).established.amni).toBe(true);
  });

  it('bouton retombé : le transit attardé est détruit', () => {
    expect(scenario('amni', 0, 1).established.amni).toBe(false);
  });

  it("ATR 1 épargne aussi l'état 2, destruction déjà commandée", () => {
    // `dtri()` : `(bamni!=1)&&(bamni!=2)`, condition que n'ont ni dtrz ni dtre.
    expect(scenario('amni', 2, 1).established.amni).toBe(true);
  });
});

describe("§4.7 l'autorisation Au.M n'est jamais détruite", () => {
  it("l'ATR 1 la laisse en place malgré son périmètre sur la zone 89", () => {
    // `dtri()` ne cite que amni, amnu et nuam ; `daum()` n'est appelée que par
    // son propre bouton ou par le moteur de trafic.
    expect(scenario('aum', 0, 1).established.aum).toBe(true);
  });
});

describe("§4.7 l'ATR 2 n'agit que sur zone occupée", () => {
  it('zones libres : rien à défaire', () => {
    // `dtrz()` enveloppe chaque bloc dans `if (z81==2)`, `if (z81b==2)`,
    // `if (z83b==2)` — sans occupation, la fonction ne fait rien.
    expect(scenario('agnida', 0, 2).established.agnida).toBe(true);
  });

  it('une zone du périmètre occupée : le transit attardé tombe', () => {
    expect(scenario('agnida', 0, 2, 'z81').established.agnida).toBe(false);
  });
});

describe("§4.7 les ATR 1 et 3 agissent sans condition d'occupation", () => {
  it("ATR 1 défait le transit AM-N1 attardé, zone 89 libre", () => {
    const s = scenario('amni', 0, 1);
    expect(s.zones.z89).toBe(0);
    expect(s.established.amni).toBe(false);
  });

  it('ATR 3 défait le transit NZ-DG attardé, zone 82a libre', () => {
    expect(scenario('nzdgda', 0, 3).established.nzdgda).toBe(false);
  });
});

describe('§4.7 périmètre : seuls les itinéraires qui verrouillent la zone', () => {
  it("l'ATR 3 ne touche pas un itinéraire de la voie 1", () => {
    // AG-N1 ne verrouille pas z82a.
    expect(scenario('agnida', 0, 3).established.agnida).toBe(true);
  });

  it("l'ATR 1 ne touche pas un itinéraire qui ignore la zone 89", () => {
    expect(scenario('nzdgda', 0, 1).established.nzdgda).toBe(true);
  });
});
