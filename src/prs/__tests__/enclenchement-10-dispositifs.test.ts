// § 4.10 — Dispositifs D.A / D.R.
//
// Référence : `enclenchement.md` § 4.10, et `dispda()`, `tfX()`, `mX()`,
// `rX()`, `verifda()` / `verifdr()` du source.

import { describe, expect, it } from 'vitest';
import { depuisRepos, T } from './helpers';
import { DISPOSITIF_MAX, changeDispositif, pressRoute, setDispositifMode } from '../engine';
import type { PrsState } from '../engine';

const pose = (kind: 'da' | 'dr') => (s: PrsState) => setDispositifMode(s, { kind, delta: 1 });
const retrait = (kind: 'da' | 'dr') => (s: PrsState) => setDispositifMode(s, { kind, delta: -1 });
const clic = (id: 'agnida' | 'nzdgda') => (s: PrsState) => pressRoute(s, id, T);

describe('§4.10 les compteurs ne gardent rien', () => {
  it("un itinéraire porteur de dispositifs se commande normalement", () => {
    // `tfagnida()` : `if ((da==0)&&(dr==0)) {coagnida=1;fagnida();}` — sans
    // aucun test des compteurs. Hors des branches d'affichage, `disp1` et
    // `dispr1` ne gardent rien dans tout le source.
    const s = depuisRepos(
      (x) => changeDispositif(x, 'agnida', 'da', 1),
      (x) => changeDispositif(x, 'agnida', 'dr', 1),
      clic('agnida'),
    );
    expect(s.da.agnida).toBe(1);
    expect(s.dr.agnida).toBe(1);
    expect(s.established.agnida).toBe(true);
  });
});

describe('§4.10 mode pose', () => {
  it("le clic ajoute un dispositif et ne commande pas", () => {
    const s = depuisRepos(pose('da'), clic('agnida'));
    expect(s.da.agnida).toBe(1);
    expect(s.established.agnida).toBe(false);
  });

  it('le total des deux natures plafonne à 4', () => {
    // `magnida()` : `dar1=(disp1+dispr1); if (dar1>4) {disp1--;}`
    let s = depuisRepos(pose('da'));
    for (let i = 0; i < 6; i += 1) s = pressRoute(s, 'agnida', T);
    expect(s.da.agnida).toBe(DISPOSITIF_MAX);

    s = setDispositifMode(s, { kind: 'dr', delta: 1 });
    s = pressRoute(s, 'agnida', T);
    expect(s.dr.agnida).toBe(0); // le plafond est atteint
  });

  it('chaque bouton a son propre compte', () => {
    const s = depuisRepos(pose('da'), clic('agnida'), clic('nzdgda'), clic('nzdgda'));
    expect(s.da.agnida).toBe(1);
    expect(s.da.nzdgda).toBe(2);
  });
});

describe('§4.10 mode retrait', () => {
  it('le clic retire un dispositif', () => {
    const s = depuisRepos(
      (x) => changeDispositif(x, 'agnida', 'da', 1),
      retrait('da'),
      clic('agnida'),
    );
    expect(s.da.agnida).toBe(0);
  });

  it("un bouton sans dispositif se commande normalement", () => {
    // `if (da==2) { if ((disp1==0)&&(dispr1==0)){coagnida=1;fagnida();}
    //   else {ragnida();} }`
    // Un autre bouton porte encore un dispositif : le mode reste actif.
    const s = depuisRepos(
      (x) => changeDispositif(x, 'nzdgda', 'da', 1),
      retrait('da'),
      clic('agnida'),
    );
    expect(s.dispMode).not.toBeNull();
    expect(s.established.agnida).toBe(true);
    expect(s.da.nzdgda).toBe(1); // intact
  });
});

describe('§4.10 retour automatique à la marche normale', () => {
  it("le mode se rend quand tous les compteurs sont revenus à zéro", () => {
    // `verifda()` : quand les douze compteurs valent 0, le bulletin repasse à
    // « aucun » et `dispda()` remet `da = dr = 0`.
    const s = depuisRepos(
      pose('da'),
      clic('agnida'),
      clic('nzdgda'),
      retrait('da'),
      clic('agnida'),
      clic('nzdgda'),
    );
    expect(s.da.agnida).toBe(0);
    expect(s.da.nzdgda).toBe(0);
    expect(s.dispMode).toBeNull();
  });

  it("il ne se rend pas tant qu'un compteur subsiste ailleurs", () => {
    const s = depuisRepos(
      pose('da'),
      clic('agnida'),
      clic('nzdgda'),
      retrait('da'),
      clic('agnida'),
    );
    expect(s.dispMode).not.toBeNull();
  });
});
