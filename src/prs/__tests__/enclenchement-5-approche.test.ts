// § 4.5 — Enclenchement d'approche : `zapNN`, `kitNN`, D.M.T.
//
// Référence : `enclenchement.md` § 4.5, et `refreshza()` / `refreshzb()` /
// `refreshzc()`, `dtX()`, `libX()` du source.

import { describe, expect, it } from 'vitest';
import { depuisRepos, occupe, T } from './helpers';
import {
  createInitialState,
  destroyRoute,
  pressRoute,
  refreshState,
  setGeneration,
  tick,
  toggleCarreClose,
} from '../engine';
import type { PrsState } from '../engine';
import { ROUTES, ROUTE_BY_ID } from '../topology';

/** Copie de travail : `destroyRoute` et `refreshState` opèrent en place. */
const copie = (s: PrsState): PrsState => structuredClone(s);

describe("§4.5 armement de l'enclenchement d'approche", () => {
  it("sans train en approche, le zap reste à 0", () => {
    const s = depuisRepos((x) => pressRoute(x, 'agnida', T));
    expect(s.signals.c81).toBe(0);
    expect(s.zap.zap81).toBe(0);
  });

  it('signal ouvert et train en approche : le zap est armé', () => {
    const s = depuisRepos((x) => pressRoute(x, 'agnida', T), occupe('z79'));
    refreshState(s);
    expect(s.zap.zap81).toBe(1);
  });
});

describe("§4.5 kitNN, la mémoire d'ouverture", () => {
  it("est posée à l'ouverture du carré", () => {
    expect(depuisRepos((x) => pressRoute(x, 'agnida', T)).kit['81']).toBe(1);
  });

  it("refermer le carré à la main ne purge pas l'enclenchement", () => {
    // `refreshza()` : `if (kit81==0){zap81=2;} else{zap81=1;}`. Sans cette
    // mémoire, il suffirait de refermer le carré avant l'arrivée du train.
    const s = depuisRepos(
      (x) => pressRoute(x, 'agnida', T),
      occupe('z79'),
      (x) => toggleCarreClose(x, 'c81'),
    );
    expect(s.signals.c81).toBe(1);
    expect(s.kit['81']).toBe(1);
    expect(s.zap.zap81).toBe(1);
  });

  it("un carré jamais ouvert laisse purger", () => {
    // Itinéraire formé mais signal resté fermé (zone de parcours occupée) :
    // `kit81 == 0`, donc `zap81 = 2`.
    const s = depuisRepos(occupe('z81'), (x) => pressRoute(x, 'agnida', T), occupe('z79'));
    refreshState(s);
    expect(s.kit['81']).toBe(0);
    expect(s.zap.zap81).toBe(2);
  });
});

describe('§4.5 la pédale purge', () => {
  it("`pedNN == 2` purge l'enclenchement même armé", () => {
    // `refreshza()` : `if (((zap81!=1)||(ped81==2)) && approche) {zap81=2;}`
    const s = copie(depuisRepos((x) => pressRoute(x, 'agnida', T), occupe('z79')));
    refreshState(s);
    expect(s.zap.zap81).toBe(1);

    s.zones.z81b = 2; // le transit va s'attarder
    destroyRoute(s, ROUTE_BY_ID.agnida, T + 1_000, 'passage du train', true);
    refreshState(s);
    expect(s.ped['81']).toBe(2);
    expect(s.zap.zap81).toBe(2);
  });

  it("la pédale s'arme à l'ouverture du signal", () => {
    expect(depuisRepos((x) => pressRoute(x, 'agnida', T)).ped['81']).toBe(1);
  });
});

describe('§4.5 destruction sous enclenchement', () => {
  it("est refusée : il faut passer par la D.M.T.", () => {
    const s = depuisRepos(
      (x) => pressRoute(x, 'agnida', T),
      occupe('z79'),
      (x) => {
        refreshState(x);
        return pressRoute(x, 'agnida', T + 1_000);
      },
    );
    expect(s.established.agnida).toBe(true);
  });
});

describe('§4.5 la D.M.T.', () => {
  it("n'existe que sur les six itinéraires qui ont un dtX()", () => {
    const avec = ROUTES.filter((r) => r.dmtMs).map((r) => `${r.id}=${r.dmtMs! / 1_000}`);
    expect(avec).toEqual([
      'agnida=30',
      'agnu=30',
      'nuam=10',
      'nzdgda=30',
      'nudgvi=15',
      'nudgvz=15',
    ]);
  });

  it("les tracés permanents n'en ont pas", () => {
    // Le source ne définit ni `dtagnitp` ni `dtnzdgtp` : sous enclenchement
    // d'approche, c'est le bouton de l'itinéraire simple qui la porte.
    expect(ROUTE_BY_ID.agnitp.dmtMs).toBeUndefined();
    expect(ROUTE_BY_ID.nzdgtp.dmtMs).toBeUndefined();
  });

  /** Itinéraire établi, train en approche, bouton de fermeture maintenu. */
  const sousEnclenchement = (fermeture: boolean) =>
    depuisRepos(
      (x) => pressRoute(x, 'agnida', T),
      occupe('z79'),
      (x) => {
        refreshState(x);
        return fermeture ? toggleCarreClose(x, 'c81') : x;
      },
      (x) => pressRoute(x, 'agnida', T + 1_000),
    );

  it('ne démarre pas sans le bouton de fermeture maintenu', () => {
    // `dtagnida()` : `if ((zap81==1)&&(bfc81==1)&&…)`.
    const s = sousEnclenchement(false);
    expect(s.dmt).toBeNull();
    expect(s.b.agnida).not.toBe(6);
  });

  it('démarre avec le bouton maintenu, et le bouton passe à 6', () => {
    const s = sousEnclenchement(true);
    expect(s.dmt?.route).toBe('agnida');
    expect(s.b.agnida).toBe(6);
  });
});

describe("§4.5 échéance de la D.M.T. selon la génération", () => {
  const echue = (gen: 0 | 1) => {
    const s = depuisRepos(
      (x) => setGeneration(x, gen),
      (x) => pressRoute(x, 'agnida', T),
      occupe('z79'),
      (x) => {
        refreshState(x);
        return toggleCarreClose(x, 'c81');
      },
      (x) => pressRoute(x, 'agnida', T + 1_000),
    );
    return tick(s, T + 1_000 + 30_000 + 1);
  };

  it('PRS 2ᵉ génération : le bouton se rallume, il faut réappuyer', () => {
    const s = echue(0);
    expect(s.established.agnida).toBe(true);
    expect(s.b.agnida).toBe(1);
  });

  it("PRS 1ʳᵉ génération : la destruction est automatique", () => {
    const s = echue(1);
    expect(s.established.agnida).toBe(false);
  });
});

describe('§4.5 état initial', () => {
  it('les quatre pédales sont au repos', () => {
    // Le Cv 85 a une pédale (`ped85`, posée par `feamni()` / `feamnu()`)
    // mais pas de mémoire d'ouverture `kitNN` : les deux tables diffèrent.
    expect(createInitialState().ped).toEqual({ '81': 0, '82': 0, '84': 0, '85': 0 });
  });
});
