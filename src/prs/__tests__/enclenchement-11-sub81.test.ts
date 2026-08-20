// § 4.11 — Sub 81 : ouverture de substitution du carré 81.
//
// Référence : `enclenchement.md` § 4.11 et `fsub()` du source. Le bouton ouvre
// le C 81 hors des conditions normales, mais sous des conditions à lui — dont
// la présence d'un train en approche.

import { describe, expect, it } from 'vitest';
import { annonce, depuisRepos, occupe, T } from './helpers';
import { pressRoute, pressS81, setSignalFault, toggleCarreClose } from '../engine';
import type { PrsState } from '../engine';

/** AG-NU formé, destination occupée — le C 81 est donc fermé normalement. */
const agnuBloque = (s: PrsState) => {
  const x = pressRoute(s, 'agnu', T);
  x.zones.z84 = 2;
  return x;
};


describe('§4.11 conditions de la substitution', () => {
  it('ouvre le C 81 alors que les conditions normales ne le permettent pas', () => {
    const s = depuisRepos(agnuBloque, annonce('annv1'), pressS81);
    expect(s.bs81).toBe(true);
    expect(s.signals.c81).toBe(0);
  });

  it("exige un train en approche", () => {
    // `((annv1==1)||(z79==2))` — sans quoi la substitution n'a pas d'objet.
    const s = depuisRepos(agnuBloque, pressS81);
    expect(s.bs81).toBe(false);
  });

  it("l'occupation de la zone 79 vaut annonce", () => {
    const s = depuisRepos(agnuBloque, occupe('z79'), pressS81);
    expect(s.bs81).toBe(true);
  });

  it('exige le transit AG-NU, et lui seul', () => {
    // `agnu==1` : c'est le transit qui compte, pas le bouton.
    const s = depuisRepos((x) => pressRoute(x, 'agnida', T), annonce('annv1'), pressS81);
    expect(s.bs81).toBe(false);
  });

  it('refuse si le bouton de fermeture du carré est maintenu', () => {
    const s = depuisRepos(agnuBloque, annonce('annv1'), (x) => toggleCarreClose(x, 'c81'), pressS81);
    expect(s.bs81).toBe(false);
  });

  it("refuse si une zone du parcours est occupée", () => {
    const s = depuisRepos(agnuBloque, annonce('annv1'), occupe('z81b'), pressS81);
    expect(s.bs81).toBe(false);
  });
});

describe("§4.11 la substitution compte comme une ouverture", () => {
  it("elle pose la mémoire `kit81`", () => {
    // `fsub()` : `{bs81=1;c81=0;kit81=1;}` — l'enclenchement d'approche la
    // traitera donc comme une vraie ouverture.
    const s = depuisRepos(agnuBloque, annonce('annv1'), pressS81);
    expect(s.kit['81']).toBe(1);
  });
});

describe('§4.11 un dérangement de signal annule la substitution', () => {
  const sousDerangement = depuisRepos(agnuBloque, annonce('annv1'), pressS81, (x) =>
    setSignalFault(x, { id: 'c81', kind: 'ro' }),
  );

  it('`bs81` retombe', () => {
    // `fsub()` : `if ((dergmts=="roc81")||(dergmts=="exc81")) {c81=1;bs81=0;}`
    expect(sousDerangement.bs81).toBe(false);
  });

  it('et le tableau ment comme pour un signal ordinaire', () => {
    expect(sousDerangement.signals.c81).toBe(1); // terrain : fermé
    expect(sousDerangement.signalsDisplay.c81).toBe(0); // tableau : ouvert
  });
});

describe("§4.11 la substitution retombe d'elle-même", () => {
  it("dès qu'une condition disparaît", () => {
    // Le port relâche `bs81` à chaque recalcul ; l'original l'aurait laissé à
    // 1 jusqu'au prochain `fsub()`, mais le C 81 se serait refermé au premier
    // `feagnu()`. Le résultat visible est le même.
    const s = depuisRepos(agnuBloque, annonce('annv1'), pressS81, occupe('z81b'), (x) =>
      toggleCarreClose(toggleCarreClose(x, 'c82'), 'c82'),
    );
    expect(s.bs81).toBe(false);
    expect(s.signals.c81).toBe(1);
  });
});
