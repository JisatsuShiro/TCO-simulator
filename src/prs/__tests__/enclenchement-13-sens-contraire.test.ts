// § 4.13 — Enclenchement de sens contraire : Cv 88 ↔ C 84 ↔ Cv 85.
//
// Référence : `enclenchement.md` § 4.13, et `fenuam()` / `feamnu()` du source.
// Le mouvement NU → AM traverse deux signaux en cascade ; le mouvement inverse
// AM → NU ne peut partir qu'une fois le premier entièrement retombé, mémoire
// d'ouverture comprise.

import { describe, expect, it } from 'vitest';
import { depuisRepos, T } from './helpers';
import { pressRoute, tick, toggleCarreClose } from '../engine';
import type { PrsState } from '../engine';

/** Appui-relâché sur un bouton sans rapport : force un recalcul des signaux. */
const recalcule = (s: PrsState): PrsState => toggleCarreClose(toggleCarreClose(s, 'c82'), 'c82');

const nuamOuvert = depuisRepos(
  (x) => pressRoute(x, 'nuam', T),
  (x) => tick(x, T + 10_001), // l'EP MOE accorde l'autorisation d'accès
);

describe('§4.13 cascade NU → AM', () => {
  it("le Cv 88 s'ouvre avant le C 84", () => {
    const s = depuisRepos((x) => pressRoute(x, 'nuam', T));
    expect(s.signals.cv88).toBe(0);
    expect(s.signals.c84).toBe(1); // l'autorisation d'accès manque encore
  });

  it("le C 84 exige que le Cv 88 soit ouvert", () => {
    // `fenuam()` : `if ((bfc84==0)&&(cv88==0)&& … &&(vauac==1)) {…c84=0;}`
    expect(nuamOuvert.signals.cv88).toBe(0);
    expect(nuamOuvert.signals.c84).toBe(0);
  });

  it("l'ouverture du C 84 pose la mémoire kit84", () => {
    expect(nuamOuvert.kit['84']).toBe(1);
  });
});

describe('§4.13 le Cv 85 attend que le sens contraire soit retombé', () => {
  /**
   * AM-NU commande exactement les mêmes aiguilles que NU-AM : seules les
   * zones les opposent. On pose donc son transit à la main pour éprouver la
   * clause `(cv88==1)&&(c84==1)&&(kit84!=1)` de `feamnu()` en isolation.
   */
  const avecAmnu = (prep: (s: PrsState) => PrsState) =>
    recalcule(
      prep({
        ...nuamOuvert,
        zones: { ...nuamOuvert.zones },
        signals: { ...nuamOuvert.signals },
        signalsDisplay: { ...nuamOuvert.signalsDisplay },
        kit: { ...nuamOuvert.kit },
        established: { ...nuamOuvert.established, amnu: true },
        b: { ...nuamOuvert.b, amnu: 1 },
        log: [...nuamOuvert.log],
      }),
    );

  it('Cv 88 ouvert : le Cv 85 reste fermé', () => {
    const s = avecAmnu((x) => x);
    expect(s.signals.cv88).toBe(0);
    expect(s.signals.cv85).toBe(1);
  });

  it('C 84 ouvert : le Cv 85 reste fermé', () => {
    const s = avecAmnu((x) => {
      x.signals.cv88 = 1;
      return x;
    });
    expect(s.signals.cv85).toBe(1);
  });

  it("mémoire kit84 posée : le Cv 85 reste fermé même les deux signaux refermés", () => {
    const s = avecAmnu((x) => {
      x.signals.cv88 = 1;
      x.signals.c84 = 1;
      x.established.nuam = false;
      return x;
    });
    expect(s.kit['84']).toBe(1);
    expect(s.signals.cv85).toBe(1);
  });

  it('les trois conditions levées : le Cv 85 peut ouvrir', () => {
    const s = avecAmnu((x) => {
      x.signals.cv88 = 1;
      x.signals.c84 = 1;
      x.kit['84'] = 0;
      x.established.nuam = false;
      return x;
    });
    expect(s.signals.cv85).toBe(0);
  });
});

describe('§4.13 la destruction de NU-AM rend la main', () => {
  it('referme les deux signaux et efface la mémoire', () => {
    // `dnuam()` : `if ((nuam==0)||…) {kit88=0;cv88=1;}` et `clearKit()`.
    const s = pressRoute(nuamOuvert, 'nuam', T + 11_000);
    expect(s.established.nuam).toBe(false);
    expect(s.signals.cv88).toBe(1);
    expect(s.signals.c84).toBe(1);
    expect(s.kit['84']).toBe(0);
  });
});

describe('§4.13 kit88 n’est pas porté', () => {
  it("la mémoire du Cv 88 n'existe pas : le source l'écrit sans jamais la lire", () => {
    expect(Object.keys(nuamOuvert.kit).sort()).toEqual(['81', '82', '84']);
  });
});
