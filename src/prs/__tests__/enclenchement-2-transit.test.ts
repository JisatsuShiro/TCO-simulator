// § 4.2 — Enclenchement de transit : la condition qui pose le transit.
//
// Référence : `enclenchement.md` § 4.2. Chaque `ffX()` se termine par un test
// des **contrôles** d'aiguille, formulé négativement, suivi soit de la pose du
// transit soit de `bX = 3` (enregistrement).

import { describe, expect, it } from 'vitest';
import { contraire, depuisRepos, occupe, T } from './helpers';
import { createInitialState, pressRoute, setRouteFault } from '../engine';
import type { PrsState } from '../engine';
import { ROUTES, TRANSIT_SUBSTITUTES } from '../topology';

describe('§4.2 formulation négative — `aig81a != "g"` et non `aig81a == "d"`', () => {
  it('un contrôle perdu ne fait pas échouer la formation', () => {
    const s = depuisRepos((x) => {
      x.aig.aig81a = 0; // contrôle absent, commande inchangée
      return pressRoute(x, 'agnida', T);
    });
    expect(s.established.agnida).toBe(true);
    expect(s.b.agnida).toBe(1);
  });

  it("mais il interdit l'ouverture du signal — c'est là que se joue le refus", () => {
    const s = depuisRepos((x) => {
      x.aig.aig81a = 0;
      return pressRoute(x, 'agnida', T);
    });
    expect(s.signals.c81).toBe(1); // 1 = fermé
  });

  it('un contrôle franchement contraire enregistre au lieu de former', () => {
    // Zone de garde prise : le groupe 81 ne bouge pas, il reste à droite
    // alors que DG-N1 le veut à gauche.
    const s = depuisRepos(occupe('z81b'), (x) => pressRoute(x, 'dgni', T));
    expect(s.established.dgni).toBe(false);
    expect(s.b.dgni).toBe(3);
  });
});

describe('§4.2 positions exigées, itinéraire par itinéraire', () => {
  // Relevé des douze conditions de `ffX()` : la position requise est
  // l'opposée de celle que le test rejette.
  const ATTENDU: Record<string, Record<string, 'g' | 'd'>> = {
    aum: { aig85a: 'g', aig85b: 'g' },
    agnida: { aig85a: 'g', aig85b: 'g', aig81a: 'd', aig81b: 'd', aig83a: 'g', aig83b: 'g' },
    agnitp: { aig85a: 'g', aig85b: 'g', aig81a: 'd', aig81b: 'd', aig83a: 'g', aig83b: 'g' },
    agnu: { aig85a: 'g', aig85b: 'g', aig81a: 'd', aig81b: 'd', aig83a: 'd', aig83b: 'd' },
    amni: { aig85a: 'd', aig85b: 'd', aig81a: 'd', aig81b: 'd', aig83a: 'g', aig83b: 'g' },
    amnu: { aig85a: 'd', aig85b: 'd', aig81a: 'd', aig81b: 'd', aig83a: 'd', aig83b: 'd' },
    nuam: { aig85a: 'd', aig85b: 'd', aig81a: 'd', aig81b: 'd', aig83a: 'd', aig83b: 'd' },
    dgni: { aig81a: 'g', aig81b: 'g', aig83a: 'g', aig83b: 'g' },
    nzdgda: { aig81a: 'd', aig81b: 'd', aig82: 'd' },
    nzdgtp: { aig81a: 'd', aig81b: 'd', aig82: 'd' },
    nudgvi: { aig81a: 'g', aig81b: 'g', aig83a: 'd', aig83b: 'd' },
    nudgvz: { aig81a: 'd', aig81b: 'd', aig83a: 'g', aig83b: 'g', aig82: 'g' },
  };

  it.each(ROUTES.map((r) => r.id))('%s commande les aiguilles du source', (id) => {
    expect(ROUTES.find((r) => r.id === id)!.switches).toEqual(ATTENDU[id]);
  });
});

describe("§4.2 dergmti — le dérangement de non-formation d'itinéraire", () => {
  it('bloque le transit et pousse le bouton en enregistrement', () => {
    const s = depuisRepos(
      (x) => setRouteFault(x, { id: 'agnida', kind: 'formation' }),
      (x) => pressRoute(x, 'agnida', T),
    );
    expect(s.established.agnida).toBe(false);
    expect(s.b.agnida).toBe(3);
  });

  it("s'applique par famille : `agnif` couvre AG-N1 et sa variante T.P.", () => {
    const s = depuisRepos(
      (x) => setRouteFault(x, { id: 'agnida', kind: 'formation' }),
      (x) => pressRoute(x, 'agnitp', T),
    );
    expect(s.established.agnitp).toBe(false);
  });

  it("ne déborde pas sur une autre famille", () => {
    const s = depuisRepos(
      (x) => setRouteFault(x, { id: 'agnida', kind: 'formation' }),
      (x) => pressRoute(x, 'nzdgda', T),
    );
    expect(s.established.nzdgda).toBe(true);
  });
});

describe("§4.2 clause `aum != 1` de ffnuam", () => {
  it("une autorisation EP MOE en cours interdit le transit NU-AM", () => {
    const s = depuisRepos(
      (x) => {
        x.established.aum = true;
        return x;
      },
      (x) => pressRoute(x, 'nuam', T),
    );
    expect(s.established.nuam).toBe(false);
    expect(s.b.nuam).toBe(3);
  });

  it("sans autorisation, le même appui forme l'itinéraire", () => {
    expect(depuisRepos((x) => pressRoute(x, 'nuam', T)).established.nuam).toBe(true);
  });
});

describe("§4.2 clause de groupe de ffnudgvz — (z82b==0 ‖ bannul3 ‖ nudgvz==1)", () => {
  it("re-teste la garde du groupe 82 même sans manœuvre à faire", () => {
    const s = depuisRepos(
      contraire('aig82'), // 82 déjà à gauche : aucune manœuvre requise
      occupe('z82b'), // mais la zone de garde est prise
      (x) => pressRoute(x, 'nudgvz', T),
    );
    expect(s.established.nudgvz).toBe(false);
    expect(s.b.nudgvz).toBe(3);
  });

  it('zone libre : le transit se pose', () => {
    const s = depuisRepos(contraire('aig82'), (x) => pressRoute(x, 'nudgvz', T));
    expect(s.established.nudgvz).toBe(true);
  });
});

describe('§4.2 substitution de transit', () => {
  /** Transit posé, bouton retombé, zones de garde rendues. */
  const transitAttarde = (route: 'amni' | 'agnu') => (s: PrsState) => {
    const x = pressRoute(s, route, T);
    x.b[route] = 0;
    x.zones.z81 = 0;
    x.zones.z89 = 0;
    return x;
  };

  it("AG-N1 chasse le transit attardé d'AM-N1", () => {
    const s = depuisRepos(transitAttarde('amni'), (x) => pressRoute(x, 'agnida', T + 1000));
    expect(s.established.agnida).toBe(true);
    expect(s.established.amni).toBe(false);
  });

  it("AM-NU chasse le transit attardé d'AG-NU", () => {
    const s = depuisRepos(transitAttarde('agnu'), (x) => pressRoute(x, 'amnu', T + 1000));
    expect(s.established.amnu).toBe(true);
    expect(s.established.agnu).toBe(false);
  });

  it('la table de substitution est symétrique', () => {
    for (const [a, cibles] of Object.entries(TRANSIT_SUBSTITUTES)) {
      for (const b of cibles ?? []) {
        expect(TRANSIT_SUBSTITUTES[b as keyof typeof TRANSIT_SUBSTITUTES]).toContain(a);
      }
    }
  });
});

describe("§4.2 effets de la pose du transit", () => {
  it('les zones de parcours passent à 1, sauf celles déjà occupées', () => {
    const s = depuisRepos(occupe('z85'), (x) => pressRoute(x, 'agnida', T));
    expect(s.zones.z81).toBe(1);
    expect(s.zones.z85).toBe(2); // occupée : elle le reste
  });

  it("l'annulateur qui a permis la manœuvre est consommé", () => {
    const s = createInitialState();
    s.zones.z81 = 2;
    s.atrArmed[1] = true;
    const apres = depuisRepos(
      () => s,
      (x) => {
        x.atrAnnul[1] = true;
        x.atrArmed[1] = false;
        return pressRoute(x, 'amni', T);
      },
    );
    expect(apres.atrAnnul[1]).toBe(false);
  });
});
