// § 4.12 — EP MOE : autorisation de mouvement (Au.M) et d'accès (Au.Ac).
//
// Référence : `enclenchement.md` § 4.12, et `faum()`, `ffaum()`, `daum()`,
// `autoauac()` du source. Deux voyants indépendants : l'un commande la voie
// mère, l'autre conditionne l'ouverture du C 84 vers AM.

import { describe, expect, it } from 'vitest';
import { depuisRepos, T } from './helpers';
import { annulAtr, armAtr, pressRoute, tick } from '../engine';
import type { PrsState } from '../engine';

describe("§4.12 Au.M — l'autorisation de mouvement", () => {
  const posee = depuisRepos((x) => pressRoute(x, 'aum', T));

  it('verrouille la zone 89', () => {
    // `ffaum()` : `if ((aum==1)&&(z89!=2)) {z89=1;}`
    expect(posee.established.aum).toBe(true);
    expect(posee.zones.z89).toBe(1);
  });

  it('ramène le couple 85 à gauche', () => {
    expect(posee.cag.aig85a).toBe('g');
    expect(posee.cag.aig85b).toBe('g');
  });

  it("n'ouvre aucun signal : ce n'est pas un itinéraire", () => {
    expect(Object.values(posee.signals).every((v) => v === 1)).toBe(true);
  });
});

describe("§4.12 Au.M refusée ou enregistrée", () => {
  it("s'enregistre devant un transit NU-AM", () => {
    // `if ((nuam==1)||…) {baum=3;synchro();}`
    const s = depuisRepos(
      (x) => pressRoute(x, 'nuam', T),
      (x) => pressRoute(x, 'aum', T + 1_000),
    );
    expect(s.b.aum).toBe(3);
  });

  it("l'annulateur 1 actionné lève ce blocage", () => {
    // La garde du source est `(bannul1==0)`. Pour que la levée se voie, il
    // faut que la formation puisse ensuite aboutir : transit NU-AM attardé,
    // zones de garde déjà rendues. Sans l'annulateur, la commande serait mise
    // en attente alors même que les aiguilles pourraient bouger.
    const attarde = (x: PrsState) => {
      const y = pressRoute(x, 'nuam', T);
      y.b.nuam = 0;
      y.zones.z81 = 0;
      y.zones.z89 = 0;
      return y;
    };

    const sans = depuisRepos(attarde, (x) => pressRoute(x, 'aum', T + 1_000));
    expect(sans.b.aum).toBe(3);
    expect(sans.log[0].text).toMatch(/sens contraire/);

    const avec = depuisRepos(
      attarde,
      (x) => annulAtr(armAtr(x, 1), 1, T + 500),
      (x) => pressRoute(x, 'aum', T + 1_000),
    );
    expect(avec.established.aum).toBe(true);
  });

  it("le voyant éteint refuse sans enregistrer", () => {
    // `if (baum==1) { if (vaum==1){…} else{baum=0;} }` — pas de `baum=3`.
    const s = depuisRepos(
      (x) => {
        x.vaum = 2;
        return pressRoute(x, 'aum', T);
      },
    );
    expect(s.b.aum).toBe(0);
    expect(s.established.aum).toBe(false);
  });

  it("le blocage par AM-N1 exige que la zone 81 soit prise", () => {
    // `(((amnu==1)||(amni==1))&&(z81!=0)&&(aum!=1))`. Zone rendue, la garde
    // propre à `faum()` ne joue plus — l'enregistrement qui suit vient alors
    // de la formation elle-même, la zone 89 restant tenue par AM-N1.
    const avecZ81 = depuisRepos(
      (x) => pressRoute(x, 'amni', T),
      (x) => pressRoute(x, 'aum', T + 1_000),
    );
    expect(avecZ81.log[0].text).toMatch(/sens contraire/);

    const sansZ81 = depuisRepos(
      (x) => pressRoute(x, 'amni', T),
      (x) => {
        x.zones.z81 = 0;
        return pressRoute(x, 'aum', T + 1_000);
      },
    );
    expect(sansZ81.log[0].text).not.toMatch(/sens contraire/);
  });
});

describe("§4.12 Au.Ac — l'autorisation d'accès", () => {
  const nuam = (s: PrsState) => pressRoute(s, 'nuam', T);

  it("n'est pas accordée d'emblée : le C 84 reste fermé", () => {
    // `fenuam()` : `… && (vauac==1)`.
    const s = depuisRepos(nuam);
    expect(s.vauac).toBe(0);
    expect(s.signals.c84).toBe(1);
  });

  it('est accordée dix secondes après la formation, et ouvre le C 84', () => {
    // `ffnuam()` : `if (vauac==0){vauac1=setTimeout("autoauac()",10000);}`
    const s = tick(depuisRepos(nuam), T + 10_001);
    expect(s.vauac).toBe(1);
    expect(s.signals.c84).toBe(0);
  });

  it('retombe à la destruction de NU-AM', () => {
    const s = depuisRepos(
      nuam,
      (x) => tick(x, T + 10_001),
      (x) => pressRoute(x, 'nuam', T + 11_000),
    );
    expect(s.established.nuam).toBe(false);
    expect(s.vauac).toBe(0);
  });

  it("n'est pas accordée si NU-AM a disparu entre-temps", () => {
    const s = depuisRepos(
      nuam,
      (x) => pressRoute(x, 'nuam', T + 1_000), // destruction avant l'échéance
      (x) => tick(x, T + 10_001),
    );
    expect(s.vauac).toBe(0);
  });
});
