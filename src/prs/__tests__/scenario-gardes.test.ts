// Gardes de phase — le graphique attend le poste.
//
// Une phase de scénario ne s'engage pas « à l'heure » mais **au plus tôt à
// l'heure**. Chaque `scaph*()` de l'original est bâtie sur le même moule :
//
//   function scaphab() {
//     if ((document.saat.case2.value=="")&&(dtrainv2==135436)) { traficb(); }
//     else { scapha2 = setTimeout("scaphab()", 10000); phab = 2; }
//   }
//
// C'est ce qui empêche les circulations de s'empiler quand l'aiguilleur prend
// du retard : tant que la voie n'est pas prête à recevoir la suivante, le
// graphique patiente. 246 des 249 phases en portent une.

import { describe, expect, it } from 'vitest';
import { startScenario, tick } from '../engine';
import type { PrsState } from '../engine';
import { SCENARIOS } from '../scenarios';
import { T } from './helpers';

/** Fait tourner l'horloge du poste sans que personne ne touche au pupitre. */
function marche(s: PrsState, minutes: number): PrsState {
  let x = s;
  for (let now = T; now <= T + minutes * 60_000; now += 2_000) x = tick(x, now);
  return x;
}

const engages = (s: PrsState) => s.trains.length;
const phasesJouees = (s: PrsState) => Object.keys(s.scenario?.fired ?? {}).length;
const phasesArmees = (s: PrsState) => Object.keys(s.scenario?.armed ?? {}).length;

describe('la table porte bien ses gardes', () => {
  it('246 phases sur 249 en ont une', () => {
    const toutes = SCENARIOS.flatMap((sc) => sc.phases);
    expect(toutes).toHaveLength(249);
    expect(toutes.filter((p) => p.attend)).toHaveLength(246);
  });

  it('vingt-sept prévoient un rattrapage de vingt secondes', () => {
    // `if (phaX==2) {scapha = setTimeout("traficaa()", 20000);}`
    expect(SCENARIOS.flatMap((sc) => sc.phases).filter((p) => p.rattrapage)).toHaveLength(27);
  });

  it('chaque scénario sait quelle circulation avait dégagé à la prise de poste', () => {
    // `scenarN()` : `dtrainv1 = …; dtrainv2 = …;`
    for (const sc of SCENARIOS) expect(sc.degage, sc.label).toBeDefined();
    expect(startScenario('1', T).dtrain).toEqual({ v1: 135_517, v2: 135_436 });
  });
});

describe('sans personne au pupitre, le graphique se fige', () => {
  /**
   * Scénario 1 laissé tourner une demi-heure simulée, pupitre à l'abandon :
   * les deux premiers trains arrivent, se heurtent aux carrés fermés, et plus
   * rien ne part derrière eux.
   */
  const abandonne = marche(startScenario('1', T), 30);

  it('les deux premières phases partent — elles n’attendent rien de fait', () => {
    // `08h13/ac` n'a aucune garde ; `08h14/b` attend `dtrainv2 == 135436`,
    // que `scenar1()` a justement posé au départ.
    expect(phasesJouees(abandonne)).toBe(2);
    expect(engages(abandonne)).toBe(2);
  });

  it('toutes les suivantes sont armées et attendent', () => {
    const def = SCENARIOS.find((x) => x.id === '1')!;
    expect(phasesArmees(abandonne)).toBe(def.phases.length);
    expect(phasesJouees(abandonne)).toBeLessThan(def.phases.length);
  });

  it('les trains ne s’empilent pas derrière ceux qui sont bloqués', () => {
    // C'est tout l'objet de la garde : sans elle, une phase par minute
    // engageait un train quoi qu'il arrive.
    expect(engages(abandonne)).toBeLessThanOrEqual(2);
  });
});

describe('la garde levée, la phase part — même en retard', () => {
  it('une phase armée depuis longtemps s’engage dès que la voie se libère', () => {
    let s = marche(startScenario('1', T), 30);
    const avant = phasesJouees(s);
    expect(avant).toBe(2);

    // L'aiguilleur rattrape : la voie 1 est dégagée et sa case d'annonce vidée.
    // La phase `08h16/aa` attend `dtrainv1 == 135161`.
    s = { ...s, dtrain: { ...s.dtrain, v1: 135_161 }, saat: { ...s.saat, v1ag: '' } };
    s = tick(s, T + 30 * 60_000 + 2_000);

    expect(phasesJouees(s)).toBe(avant + 1);
    expect(s.trains.some((t) => t.num === 135_519)).toBe(true);
  });

  it('une phase dont la garde n’a jamais refusé part sans retard', () => {
    // Les deux premières du scénario 1 s'engagent à l'heure : leur garde est
    // vraie dès la prise de poste.
    const s = marche(startScenario('1', T), 3);
    expect(s.scenario?.retarde['0']).toBeUndefined();
    expect(s.scenario?.retarde['1']).toBeUndefined();
  });

  it('une phase qui a dû attendre est marquée comme telle', () => {
    // `phaX = 2` dans la branche `else` : c'est ce qui vaudra le départ
    // différé aux vingt-sept phases qui le prévoient.
    const s = marche(startScenario('1', T), 30);
    expect(Object.keys(s.scenario?.retarde ?? {}).length).toBeGreaterThan(10);
  });
});

describe('les formes de garde relevées au source', () => {
  const toutes = SCENARIOS.flatMap((sc) => sc.phases).map((p) => p.attend).filter(Boolean);

  it('la circulation précédente dégagée, la case d’annonce libre', () => {
    // La forme de loin la plus fréquente.
    const n = toutes.filter((g) => g!.degage && g!.libre).length;
    expect(n).toBeGreaterThan(180);
  });

  it('un train garé voie centrale, parfois nommément', () => {
    expect(toutes.filter((g) => g!.voieCentrale).length).toBeGreaterThan(15);
    expect(toutes.filter((g) => g!.present?.cell === 'nu').length).toBeGreaterThan(5);
  });

  it("l'autorisation de mouvement saisie par l'EP MOE", () => {
    // Une seule phase l'exige : `scaphsnaf()`, `… && (vaum==2)`.
    expect(toutes.filter((g) => g!.aumSaisie)).toHaveLength(1);
  });

  it('aucune garde ne vise une case ou un compteur inconnus', () => {
    const cases = ['vm', 'v1ag', 'v1n1', 'nu', 'v2dg', 'v2n2'];
    const compteurs = ['v1a', 'v1c', 'v2', 'vcb', 'vcm', 'vm'];
    for (const g of toutes) {
      if (g!.libre) expect(cases).toContain(g!.libre);
      if (g!.present) expect(cases).toContain(g!.present.cell);
      if (g!.compteur) expect(compteurs).toContain(g!.compteur.cle);
      if (g!.degage) expect(['v1', 'v2']).toContain(g!.degage.fil);
    }
  });
});
