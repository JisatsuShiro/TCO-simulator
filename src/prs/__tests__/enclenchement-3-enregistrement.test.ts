// § 4.3 — Incompatibilité : enregistrement, surenregistrement et rejeu.
//
// Référence : `enclenchement.md` § 4.3. Un itinéraire refusé n'est pas perdu :
// il prend l'état 3 (enregistré) ou 5 (surenregistré) et sera rejoué à la
// destruction de celui qui le bloque. La liste de rejeu est câblée en dur à la
// fin de chaque `dX()`, et **son ordre fixe la priorité**.

import { describe, expect, it } from 'vitest';
import { depuisRepos, T } from './helpers';
import { pressRoute } from '../engine';
import { REPLAY_ON_DESTROY } from '../topology';
import type { RouteId } from '../topology';

describe('§4.3 enregistrement', () => {
  it("un itinéraire refusé prend l'état 3", () => {
    const s = depuisRepos(
      (x) => pressRoute(x, 'agnida', T),
      (x) => pressRoute(x, 'agnu', T + 1_000),
    );
    expect(s.b.agnida).toBe(1);
    expect(s.b.agnu).toBe(3);
  });

  it("la commande enregistrée survit à la destruction d'un tiers", () => {
    // Tous les `dX()` gardent leur remise à zéro par `if (bX != 3)`.
    const s = depuisRepos(
      (x) => pressRoute(x, 'agnida', T),
      (x) => pressRoute(x, 'nzdgda', T + 500),
      (x) => pressRoute(x, 'agnu', T + 1_000),
      (x) => pressRoute(x, 'nzdgda', T + 1_500), // destruction sans rapport
    );
    expect(s.b.agnu).toBe(3);
  });
});

describe('§4.3 surenregistrement du tracé permanent', () => {
  it("le T.P. passe à 5 quand une commande attend déjà", () => {
    // `agnitpa()` : `if ((bagnitp==1)&&((bagnu==3)||…)) {bagnitp=5;}`
    const s = depuisRepos(
      (x) => pressRoute(x, 'agnida', T),
      (x) => pressRoute(x, 'agnu', T + 1_000), // → 3
      (x) => pressRoute(x, 'agnitp', T + 2_000),
    );
    expect(s.b.agnu).toBe(3);
    expect(s.b.agnitp).toBe(5);
  });

  it("sans file d'attente, il s'enregistre simplement à 3", () => {
    const s = depuisRepos(
      (x) => pressRoute(x, 'agnu', T),
      (x) => pressRoute(x, 'agnitp', T + 1_000),
    );
    expect(s.b.agnitp).toBe(3);
  });
});

describe('§4.3 rejeu à la destruction', () => {
  it('la destruction du bloqueur relance la commande enregistrée', () => {
    const s = depuisRepos(
      (x) => pressRoute(x, 'agnida', T),
      (x) => pressRoute(x, 'agnu', T + 1_000),
      (x) => pressRoute(x, 'agnida', T + 2_000),
    );
    expect(s.b.agnu).toBe(1);
    expect(s.established.agnu).toBe(true);
  });
});

describe('§4.3 les listes de rejeu transcrivent les dX()', () => {
  // Relevé littéral des queues de `PRS/construc/gaestro.js`. L'ordre compte :
  // c'est la priorité entre commandes en attente.
  const SOURCE: Record<RouteId, string[]> = {
    aum: ['amnu', 'nuam', 'amni', 'agnitp', 'nzdgtp'],
    agnida: ['agnu', 'dgni', 'amni', 'nudgvi', 'amnu', 'nuam', 'agnitp', 'nzdgtp'],
    agnitp: ['agnu', 'dgni', 'amni', 'nudgvi', 'amnu', 'nuam'],
    agnu: ['agnida', 'nudgvi', 'nuam', 'amnu', 'nudgvz', 'amni', 'dgni', 'agnitp', 'nzdgtp'],
    amni: ['aum', 'agnida', 'dgni', 'amnu', 'nuam', 'nudgvi', 'agnu', 'agnitp', 'nzdgtp'],
    amnu: ['aum', 'nuam', 'agnu', 'amni', 'nudgvi', 'nudgvz', 'agnida', 'dgni', 'agnitp', 'nzdgtp'],
    nuam: ['aum', 'amnu', 'agnu', 'amni', 'nudgvi', 'nudgvz', 'agnida', 'dgni', 'agnitp', 'nzdgtp'],
    dgni: ['agnida', 'nudgvi', 'nzdgda', 'amnu', 'nuam', 'amni', 'agnu', 'nudgvz', 'agnitp', 'nzdgtp'],
    nzdgda: ['dgni', 'nudgvz', 'nudgvi', 'nzdgtp', 'agnitp'],
    nzdgtp: ['dgni', 'nudgvz', 'nudgvi'],
    nudgvi: ['agnu', 'dgni', 'nzdgda', 'amni', 'amnu', 'nuam', 'agnida', 'nudgvz', 'agnitp', 'nzdgtp'],
    nudgvz: ['nzdgda', 'dgni', 'agnu', 'nudgvi', 'amnu', 'nuam', 'agnitp', 'nzdgtp'],
  };

  it.each(Object.keys(SOURCE) as RouteId[])('%s rejoue dans l\'ordre du source', (id) => {
    expect(REPLAY_ON_DESTROY[id].map((e) => e.id)).toEqual(SOURCE[id]);
  });

  it("seuls les T.P. portent une condition d'état restreinte", () => {
    const only5 = Object.entries(REPLAY_ON_DESTROY).flatMap(([de, l]) =>
      l.filter((e) => e.only5).map((e) => `${de}→${e.id}`),
    );
    // `dagnida()` : `if (bagnitp==5)` et `if ((bnzdgtp==5)&&(nzdgda==0))`.
    // `dnzdgda()` : `if (bnzdgtp==5)`.
    expect(only5.sort()).toEqual(['agnida→agnitp', 'agnida→nzdgtp', 'nzdgda→nzdgtp']);
  });

  it("l'inhibition `unless` n'existe que pour nzdgtp derrière son D.A.", () => {
    const unless = Object.entries(REPLAY_ON_DESTROY).flatMap(([de, l]) =>
      l.filter((e) => e.unless).map((e) => `${de}→${e.id} sauf si ${e.unless}`),
    );
    expect(unless).toEqual(['agnida→nzdgtp sauf si nzdgda']);
  });

  it("la reformation depuis l'état 1 ne concerne que deux couples", () => {
    // `if ((bnudgvi==3)||(bnudgvi==1))` dans `dagnu()`,
    // `if ((bdgni==3)||(bdgni==1))` dans `dnudgvi()`.
    const from1 = Object.entries(REPLAY_ON_DESTROY).flatMap(([de, l]) =>
      l.filter((e) => e.alsoFrom1).map((e) => `${de}→${e.id}`),
    );
    expect(from1.sort()).toEqual(['agnu→nudgvi', 'nudgvi→dgni']);
  });
});

describe("§4.3 reformation d'un itinéraire déjà établi", () => {
  /**
   * Transit AG-NU attardé par-dessus un NU-DG-VI établi dont les aiguilles ont
   * été reprises — la seule situation où `if ((bnudgvi==3)||(bnudgvi==1))`
   * de `dagnu()` a un sens. Montée à la main : elle n'est pas atteignable par
   * la seule commande des boutons.
   */
  const situation = depuisRepos(
    (x) => pressRoute(x, 'nudgvi', T),
    (x) => {
      x.established.agnu = true;
      x.b.agnu = 1;
      for (const a of ['aig81a', 'aig81b'] as const) {
        x.cag[a] = 'd';
        x.lev[a] = 'd';
        x.aig[a] = 'd';
      }
      return pressRoute(x, 'agnu', T + 1_000); // destruction
    },
  );

  it("la destruction rejoue NU-DG-VI bien qu'il soit à l'état 1", () => {
    expect(situation.log.some((l) => /NU-DG V1 — commande enregistrée rejouée/.test(l.text))).toBe(
      true,
    );
  });

  it("le rejeu se solde par un enregistrement, faute de pouvoir reprendre l'aiguille", () => {
    // `ffnudgvi()` exige `z82a==0`, or NU-DG-VI verrouille lui-même cette
    // zone : la reformation échoue aussi dans l'original. Le bouton retombe
    // donc en attente pendant que son transit se maintient.
    expect(situation.b.nudgvi).toBe(3);
    expect(situation.established.nudgvi).toBe(true);
  });
});
