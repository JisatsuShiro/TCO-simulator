// § 4.6 — Libération des zones à la destruction.
//
// Référence : `enclenchement.md` § 4.6. Les `dX()` rendent les zones **une par
// une**, dans le sens de la marche, chacune dès qu'elle est libre et que celles
// qui la précèdent le sont. Le transit, lui, ne tombe qu'au dégagement complet
// des zones de parcours.

import { describe, expect, it } from 'vitest';
import { depuisRepos, T } from './helpers';
import { pressRoute } from '../engine';
import { CORE_LOCKS, RELEASE_BLOCKERS, RELEASE_ORDER, ROUTES } from '../topology';

/** Forme AM-N1, occupe une zone du parcours, puis commande la destruction. */
const detruitAvec = (occupee: 'z81b' | 'z81') =>
  depuisRepos(
    (s) => pressRoute(s, 'amni', T),
    (s) => {
      s.zones[occupee] = 2;
      return pressRoute(s, 'amni', T + 1_000);
    },
  );

describe('§4.6 libération en cascade', () => {
  it("rend l'amont même quand une zone d'aval reste occupée", () => {
    const s = detruitAvec('z81b');
    expect(s.zones.z89).toBe(0); // rendue
    expect(s.zones.z81).toBe(0); // rendue
    expect(s.zones.z81b).toBe(2); // occupée
  });

  it("garde l'aval verrouillé tant que le transit ne tombe pas", () => {
    const s = detruitAvec('z81b');
    expect(s.established.amni).toBe(true);
    expect(s.zones.z85).toBe(1);
    expect(s.zones.z87).toBe(1);
  });

  it("s'arrête à la première zone de parcours occupée", () => {
    // z81 occupée : z89 la précède et se rend, z81b la suit et reste.
    const s = detruitAvec('z81');
    expect(s.zones.z89).toBe(0);
    expect(s.zones.z81).toBe(2);
    expect(s.zones.z81b).toBe(1);
  });

  it('tout se rend quand aucune zone de parcours ne retient', () => {
    const s = depuisRepos(
      (x) => pressRoute(x, 'amni', T),
      (x) => pressRoute(x, 'amni', T + 1_000),
    );
    expect(s.established.amni).toBe(false);
    expect(Object.values(s.zones).every((v) => v === 0)).toBe(true);
  });
});

describe('§4.6 un transit attardé ne bloque plus les aiguilles rendues', () => {
  it("AG-N1 se forme et chasse le transit attardé d'AM-N1", () => {
    // Le motif complet : la libération partielle rend le groupe 85, la
    // substitution de transit (§4.2) devient alors atteignable.
    const s = depuisRepos(
      () => detruitAvec('z81b'),
      (x) => pressRoute(x, 'agnida', T + 2_000),
    );
    expect(s.established.agnida).toBe(true);
    expect(s.cag.aig85a).toBe('g');
    expect(s.established.amni).toBe(false);
  });
});

describe('§4.6 rétention par un transit nommé', () => {
  /** Forme un itinéraire, pose un transit attardé, puis détruit le premier. */
  const detruitSous = (route: 'agnu' | 'agnida', attarde: 'dgni' | 'nuam' | 'amni') =>
    depuisRepos(
      (s) => pressRoute(s, route, T),
      (s) => {
        s.established[attarde] = true;
        return pressRoute(s, route, T + 1_000);
      },
    );

  it("dagnu() rend z81b malgré un transit DG-N1 attardé : il ne le cite pas", () => {
    // La zone est pourtant verrouillée par DG-N1. Une règle générique du type
    // « encore tenue par un autre » la retiendrait — le poste, non.
    expect(detruitSous('agnu', 'dgni').zones.z81b).toBe(0);
  });

  it('dagnu() retient z81 et z81b devant un transit NU-AM : il le cite', () => {
    const s = detruitSous('agnu', 'nuam');
    expect(s.zones.z81).toBe(1);
    expect(s.zones.z81b).toBe(1);
  });

  it('dagnida() retient z85 devant un transit AM-N1', () => {
    expect(detruitSous('agnida', 'amni').zones.z85).toBe(1);
  });
});

describe('§4.6 cohérence des tables', () => {
  it('aucun itinéraire ne se cite lui-même comme retenant une zone', () => {
    // Le transit de l'itinéraire détruit est traité par la position du cran,
    // pas par cette table.
    for (const [de, zones] of Object.entries(RELEASE_BLOCKERS)) {
      for (const l of Object.values(zones)) expect(l).not.toContain(de);
    }
  });

  it('les zones citées comme retenues sont bien des zones que le trajet rend', () => {
    for (const [de, zones] of Object.entries(RELEASE_BLOCKERS)) {
      const rendues = new Set(RELEASE_ORDER[de as keyof typeof RELEASE_ORDER].flat());
      for (const z of Object.keys(zones)) expect(rendues.has(z as never)).toBe(true);
    }
  });

  it('les zones de parcours sont rendues, à la seule exception du T.P.', () => {
    // Formulé comme un relevé plutôt que comme une règle : `dagnitp()` laisse
    // délibérément z81b verrouillée, et c'est le seul cas.
    const jamaisRendues = ROUTES.flatMap((r) => {
      const rendues = new Set(RELEASE_ORDER[r.id].flat());
      return CORE_LOCKS[r.id].filter((z) => !rendues.has(z)).map((z) => `${r.id}: ${z}`);
    });
    expect(jamaisRendues).toEqual(['agnitp: z81b']);
  });

  it("seul le T.P. de AG-N1 laisse des zones verrouillées, comme dagnitp()", () => {
    // `dagnitp()` ne rend pas z81b : le tracé permanent se dégrade en
    // itinéraire simple, qui la reprend aussitôt. Aucun autre itinéraire ne
    // doit présenter d'écart entre ses verrous et ce qu'il rend.
    const ecarts = ROUTES.flatMap((r) => {
      const rendues = new Set(RELEASE_ORDER[r.id].flat());
      const restantes = r.locks.filter((z) => !rendues.has(z));
      return restantes.length ? [`${r.id}: ${restantes.join(' ')}`] : [];
    });
    expect(ecarts).toEqual(['agnitp: z81a z81b z81c']);
  });

  it("et cet écart est sans conséquence : la destruction du T.P. reforme le simple", () => {
    const s = depuisRepos(
      (x) => pressRoute(x, 'agnitp', T),
      (x) => pressRoute(x, 'agnitp', T + 1_000),
    );
    expect(s.established.agnitp).toBe(false);
    expect(s.established.agnida).toBe(true);
    expect(s.zones.z81b).toBe(1); // reprise par l'itinéraire simple
  });
});
