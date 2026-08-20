// Fils de circulation C (voie centrale) et M (voie mère).
//
// Ces deux fils portent la moitié des fonctions de trafic de `gaestro.js` et,
// à eux deux, cinq des itinéraires du poste que personne ne parcourait —
// NU-DG V1, NU-DG V2, NU-AM, AM-N1, AM-NU.
//
// Ils diffèrent des fils A et B sur trois points que ces essais couvrent :
//
//   1. ils ne naissent pas du lancement du trafic mais d'un **garage** (un
//      train qui s'arrête voie centrale) ou de l'**EP MOE** (Au.M posée) ;
//   2. un train du graphique connaît sa destination et **refuse** l'itinéraire
//      qui ne l'y mène pas ;
//   3. ils rendent possibles les deux **nez-à-nez** du référentiel, en
//      occupant la voie centrale et la voie mère (`trpresvc` / `trpresvm`).

import { describe, expect, it } from 'vitest';
import { createInitialState, pressRoute, startScenario, tick } from '../engine';
import type { PrsState } from '../engine';
import { spawnTrain, startTraffic, trainStatus } from '../traffic';
import { SPAWN_TARGET } from '../scenarios';
import { T } from './helpers';

/** Fait tourner l'horloge du poste — trafic et minuteries — jusqu'à `fin`. */
function marche(s: PrsState, debut: number, fin: number): PrsState {
  let x = s;
  for (let now = debut; now <= fin; now += 1_000) x = tick(x, now);
  return x;
}

const journal = (s: PrsState) => s.log.map((e) => e.text).join('\n');
const etape = (s: PrsState, fil: 'A' | 'B' | 'C' | 'M') => {
  const t = s.trains.find((x) => x.thread === fil);
  return t ? trainStatus(t) : null;
};

/**
 * Trafic souple avec AG-NU tracé : le premier train voie 1 se gare voie
 * centrale, ce qui engendre une circulation du fil C.
 */
function garageVoieCentrale(): { s: PrsState; now: number } {
  let s = createInitialState();
  startTraffic(s, T);
  s = pressRoute(s, 'agnu', T);
  const now = T + 145_000;
  return { s: marche(s, T, now), now };
}

describe('le fil C naît du garage voie centrale', () => {
  it("un train garé y engendre une circulation, et occupe la voie", () => {
    // `tachuit()` : `trpresvc = 1` ; `tacneuf()` : `if (btrafic==1){…traficc();}`
    const { s } = garageVoieCentrale();
    expect(journal(s)).toMatch(/est garé voie NU/);
    expect(s.trpresvc).toBe(true);
    expect(etape(s, 'C')).not.toBeNull();
  });

  it("le numéro s'inscrit dans la case voie NU du graphique", () => {
    const { s } = garageVoieCentrale();
    const c = s.trains.find((x) => x.thread === 'C')!;
    expect(s.saat.nu).toBe(String(c.num));
  });

  it("le conducteur se déclare prêt au départ tant que le C 84 est fermé", () => {
    const { s } = garageVoieCentrale();
    expect(s.signals.c84).toBe(1);
    expect(journal(s)).toMatch(/prêt au départ de la voie centrale/);
  });
});

describe('les trois sorties de la voie centrale', () => {
  /** Trace l'itinéraire demandé et laisse le train du fil C le parcourir. */
  function sortie(route: 'nudgvi' | 'nudgvz' | 'nuam') {
    const { s, now } = garageVoieCentrale();
    const x = pressRoute(s, route, now);
    return marche(x, now, now + 400_000);
  }

  it('NU-DG V1 — 83b à droite, 81a à gauche', () => {
    const s = sortie('nudgvi');
    expect(journal(s)).toMatch(/a quitté Springfield vers DG/);
    expect(s.trpresvc).toBe(false);
  });

  it('NU-DG V2 — 83b à gauche', () => {
    const s = sortie('nudgvz');
    expect(journal(s)).toMatch(/a quitté Springfield vers DG/);
    expect(s.trpresvc).toBe(false);
  });

  it('NU-AM — 83b et 81a à droite, par le C 84 puis le Cv 88', () => {
    const s = sortie('nuam');
    expect(journal(s)).toMatch(/a quitté Springfield par la voie mère/);
    expect(s.trpresvc).toBe(false);
  });

  it("l'itinéraire vers DG tombe au passage du train", () => {
    // `tcasixb()` : `dnudgvi()` dès que la queue dégage les zones 83.
    const s = sortie('nudgvi');
    expect(s.established.nudgvi).toBe(false);
  });

  it("NU-AM reste tracé : le source ne le détruit que bouton éteint", () => {
    // `tcmsix()` : `if (bnuam!=1){dnuam();}` — établi (`b == 1`), il tient.
    const s = sortie('nuam');
    expect(s.established.nuam).toBe(true);
  });
});

describe('un train connaît sa destination et refuse le reste', () => {
  /** Engage un train du fil C avec la destination donnée, sur l'itinéraire donné. */
  function avecDestination(dest: 'dg' | 'vm', route: 'nudgvi' | 'nuam') {
    let s = createInitialState();
    startTraffic(s, T);
    s.trpresvc = true;
    spawnTrain(s, { thread: 'C', branch: 'c', counter: 'vcb', dest }, T);
    s = pressRoute(s, route, T);
    return marche(s, T, T + 120_000);
  }

  it("« pour DG », il refuse l'itinéraire de la voie mère", () => {
    // `cbattvc()` : « tu t'es trompé je vais sur Capital-city ».
    const s = avecDestination('dg', 'nuam');
    expect(journal(s)).toMatch(/tu t'es trompé, je vais sur Capital-city/);
    expect(etape(s, 'C')).not.toBeNull(); // il est resté au pied du C 84
  });

  it("« pour la voie mère », il refuse l'itinéraire de DG", () => {
    // `cmattvc()` : « tu t'es trompé je vais sur l'EP MOE ».
    const s = avecDestination('vm', 'nudgvi');
    expect(journal(s)).toMatch(/tu t'es trompé, je vais sur l'EP MOE/);
  });

  it("il ne le redit pas, il confirme la fermeture du signal", () => {
    // `if ((eritivc==1)&&(c84==1)&&(ccmess7==0)&&(conf84==1))` : la
    // confirmation ne vient qu'une fois le signal effectivement refermé.
    const s = avecDestination('dg', 'nuam');
    const x = marche(pressRoute(s, 'nuam', T + 130_000), T + 130_000, T + 160_000);
    expect(x.signals.c84).toBe(1);
    expect(journal(x)).toMatch(/je te confirme la fermeture du C 84/);
  });
});

describe("le fil M naît de l'EP MOE", () => {
  /** Au.M posée sous trafic souple : `ffaum()` arme `traficautom()`. */
  function voieMereAutomatique(fin: number): PrsState {
    let s = createInitialState();
    startTraffic(s, T);
    s = pressRoute(s, 'aum', T);
    return marche(s, T, fin);
  }

  it("l'autorisation est saisie dix secondes après sa pose", () => {
    // `ffaum()` : `vaum1 = setTimeout("traficautom()", 10000)`.
    const s = voieMereAutomatique(T + 11_000);
    expect(s.vaum).toBe(2);
    expect(journal(s)).toMatch(/autorisation de mouvement saisie/);
  });

  it('une circulation voie mère est engagée, et occupe la voie', () => {
    const s = voieMereAutomatique(T + 20_000);
    expect(etape(s, 'M')).not.toBeNull();
    expect(s.trpresvm).toBe(true);
    const m = s.trains.find((x) => x.thread === 'M')!;
    expect(s.saat.vm).toBe(String(m.num));
  });

  it("le voyant revient et l'autorisation tombe douze secondes plus tard", () => {
    // `traficautomd()` : `vaum = 1; daum();`
    const s = voieMereAutomatique(T + 30_000);
    expect(s.vaum).toBe(1);
    expect(s.established.aum).toBe(false);
    expect(journal(s)).toMatch(/autorisation rendue par l’EP MOE/);
  });

  it("rien ne s'engage si la voie mère est déjà occupée", () => {
    // `traficmoe()` : `if (… && (document.saat.case0.value=="") && (aum==1))`.
    let s = createInitialState();
    startTraffic(s, T);
    s = pressRoute(s, 'aum', T);
    s.saat.vm = '403999';
    s = marche(s, T, T + 20_000);
    expect(etape(s, 'M')).toBeNull();
  });
});

describe('les deux sorties de la voie mère', () => {
  /** Un train voie mère à l'arrêt devant le Cv 85. */
  function trainVoieMere(): { s: PrsState; now: number } {
    const s = createInitialState();
    startTraffic(s, T);
    spawnTrain(s, { thread: 'M', branch: 'm', counter: 'vm' }, T);
    s.trpresvm = true;
    const now = T + 30_000;
    return { s: marche(s, T, now), now };
  }

  it("le couple 85 non renversé : « c'est tracé vers le butoir »", () => {
    // `attvm()` : `if ((cag85a=="g")||((cag85a=="d")&&(lev85a=="g")))`.
    // Au repos les 85 sont à gauche : l'itinéraire mène au tiroir.
    const { s, now } = trainVoieMere();
    // Le Cv 85 s'ouvre pour AM-N1, mais on remet 85a à gauche au terrain.
    const x = pressRoute(s, 'amni', now);
    x.lev.aig85a = 'g';
    const y = marche(x, now, now + 40_000);
    expect(journal(y)).toMatch(/c'est tracé vers le butoir/);
  });

  it('AM-N1 — 83a à gauche, le train sort vers N1', () => {
    const { s, now } = trainVoieMere();
    const x = marche(pressRoute(s, 'amni', now), now, now + 300_000);
    expect(journal(x)).toMatch(/a quitté Springfield vers N1/);
    expect(x.trpresvm).toBe(false);
  });

  it('AM-NU — 83a à droite, le train se gare voie centrale', () => {
    const { s, now } = trainVoieMere();
    const x = marche(pressRoute(s, 'amnu', now), now, now + 300_000);
    expect(journal(x)).toMatch(/est garé voie centrale/);
    expect(x.trpresvc).toBe(true);
    // `tmchuit()` : `if (btrafic==1){traficc();}` — il repart en fil C.
    expect(etape(x, 'C')).not.toBeNull();
  });

  it('AM-N1 tombe au passage du train', () => {
    const { s, now } = trainVoieMere();
    const x = marche(pressRoute(s, 'amni', now), now, now + 300_000);
    expect(x.established.amni).toBe(false);
  });

  it("la pédale du Cv 85 s'arme à son ouverture", () => {
    // `feamni()` : `ped85 = 1`. Le Cv 85 n'a pas de mémoire `kitNN` mais
    // bien une pédale — c'est elle qui tient l'enclenchement d'approche.
    const { s, now } = trainVoieMere();
    const x = pressRoute(s, 'amni', now);
    expect(x.signals.cv85).toBe(0);
    expect(x.ped['85']).toBe(1);
  });

  it('et retombe avec la destruction de son itinéraire', () => {
    // `damni()` : `ped85 = 0` — le train est passé, l'itinéraire est tombé.
    const { s, now } = trainVoieMere();
    const x = marche(pressRoute(s, 'amni', now), now, now + 300_000);
    expect(x.established.amni).toBe(false);
    expect(x.ped['85']).toBe(0);
  });
});

describe('nez-à-nez', () => {
  /**
   * Deuxième train envoyé voie centrale alors qu'un premier y est garé.
   *
   * Le circuit z84 tient normalement l'itinéraire fermé : AG-NU ne se forme
   * pas sur une destination occupée. La situation du référentiel est celle où
   * **le circuit ne voit pas** le train garé — l'aiguilleur trace alors sans
   * obstacle. On rend la zone libre à la main plutôt que par le menu des
   * dérangements, qui en occuperait d'autres au passage.
   */
  function deuxiemeTrainVoieCentrale() {
    const { s, now } = garageVoieCentrale();
    expect(s.trpresvc).toBe(true);
    s.zones.z84 = 0;
    return marche(pressRoute(s, 'agnu', now), now, now + 250_000);
  }

  it('un train envoyé sur la voie centrale occupée ne peut plus s’arrêter', () => {
    // `tacsix()` : `if (trpresvc==1){dsoalert(); …"une voie occupée"…}`
    const x = deuxiemeTrainVoieCentrale();
    expect(journal(x)).toMatch(/envoyé sur une voie occupée/);
    expect(x.traffic).toBe(false);
  });

  it('la sirène retentit — ce n’est pas un talonnage', () => {
    const x = deuxiemeTrainVoieCentrale();
    expect(x.sfx.derail).toBeGreaterThan(0);
  });
});

describe('les phases de scénario ne sont plus inertes', () => {
  it('les sept genres de phase engagent un train', () => {
    for (const [genre, cible] of Object.entries(SPAWN_TARGET)) {
      const s = createInitialState();
      spawnTrain(
        s,
        {
          thread: cible.thread,
          branch: cible.branch as never,
          counter: cible.counter,
          dest: cible.dest,
        },
        T,
      );
      expect(s.trains, genre).toHaveLength(1);
      // La branche existe et son étape 0 est jouable.
      const x = marche(s, T, T + 20_000);
      expect(x.log.length + x.trains.length, genre).toBeGreaterThan(0);
    }
  });

  it('un scénario engage bien des trains sur les quatre fils', () => {
    // Le 5 est celui qui en compte le plus : trois phases voie centrale et
    // une voie mère, sur dix-huit.
    let s = startScenario('5', T);
    const fils = new Set<string>();
    for (let now = T; now <= T + 500_000; now += 2_000) {
      s = tick(s, now);
      for (const x of s.trains) fils.add(x.thread);
    }
    expect([...fils].sort()).toEqual(['A', 'B', 'C', 'M']);
    expect(journal(s)).not.toMatch(/fil non porté/);
  });

  it('aucune phase ne se journalise plus comme « fil non porté »', () => {
    let s = createInitialState();
    for (const genre of Object.keys(SPAWN_TARGET)) {
      const cible = SPAWN_TARGET[genre as keyof typeof SPAWN_TARGET];
      spawnTrain(
        s,
        {
          thread: cible.thread,
          branch: cible.branch as never,
          counter: cible.counter,
          dest: cible.dest,
        },
        T,
      );
    }
    s = marche(s, T, T + 60_000);
    expect(journal(s)).not.toMatch(/fil non porté/);
  });
});
