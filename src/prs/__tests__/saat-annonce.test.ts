// Annonce d'une circulation à la main, depuis le graphique.
//
// C'est un **ajout** au poste d'origine, dont les six cases sont de simples
// champs que le trafic remplit et que l'aiguilleur peut corriger : les remplir
// n'y engage rien. Ce que ces essais garantissent, c'est que l'ajout passe par
// la porte existante — `spawnTrain()`, celle des scénarios et du trafic souple
// — et que le train qui en naît ne se distingue en rien d'un autre.

import { describe, expect, it } from 'vitest';
import { annoncerCirculation, createInitialState, estEntree, SAAT_CELLS, tick } from '../engine';
import type { PrsState, SaatCell } from '../engine';
import { SAAT_ENTREES } from '../traffic';

const T = 1_000_000;

const annonce = (s: PrsState, cell: SaatCell, num: string) =>
  annoncerCirculation(s, cell, num, T);

describe('les cases qui acceptent une annonce', () => {
  it('sont les quatre entrées du poste, pas les deux sorties', () => {
    const entrees = SAAT_CELLS.filter((c) => estEntree(c.id)).map((c) => c.id);
    expect(entrees.sort()).toEqual(['nu', 'v1ag', 'v2n2', 'vm']);
  });

  it('et chacune mène au fil qui dessert ce tronçon', () => {
    // Les quatre fils du poste, un par entrée : A voie 1 depuis AG, B voie 2
    // depuis N2, C voie centrale, M voie mère.
    const fils = Object.values(SAAT_ENTREES).map((e) => e!.thread);
    expect(fils.sort()).toEqual(['A', 'B', 'C', 'M']);
  });

  it('une sortie refuse : aucun train n’y entre', () => {
    for (const cell of ['v1n1', 'v2dg'] as const) {
      const s = annonce(createInitialState(), cell, '135872');
      expect(s.trains, cell).toHaveLength(0);
      expect(s.saat[cell], cell).toBe('');
    }
  });
});

describe('l’annonce engage un train véritable', () => {
  it('sur le fil de la case, avec le numéro saisi', () => {
    const s = annonce(createInitialState(), 'v1ag', '135872');
    expect(s.trains).toHaveLength(1);
    expect(s.trains[0]).toMatchObject({ num: 135872, thread: 'A', branch: 'a', step: 0 });
  });

  it('et recale le compteur, pour que la suivante lui succède', () => {
    // Comme les treize phases de scénario qui portent un `nums` : le fil
    // reprend sa numérotation à partir du train annoncé.
    const s = annonce(createInitialState(), 'v2n2', '135872');
    expect(s.trainNum.v2).toBe(135872);
  });

  it('le train s’annonce ensuite tout seul au graphique', () => {
    // `tun()` : `document.saat.case1.value = trainv1`. La case est écrite par
    // l'étape 0 du fil, pas par la saisie — la circulation existe d'abord.
    let s = annonce(createInitialState(), 'v1ag', '135872');
    expect(s.saat.v1ag).toBe('');
    s = tick(s, s.trains[0].dueAt);
    expect(s.saat.v1ag).toBe('135872');
    expect(s.trains[0].step).toBe(1);
  });

  it('sans destination imposée : elle suivra les aiguilles', () => {
    // `traficcb()` engage un train **qui va à DG** et refusera la voie mère ;
    // une circulation annoncée à la main n'a pas cette contrainte.
    const s = annonce(createInitialState(), 'nu', '135872');
    expect(s.trains[0].dest).toBeNull();
  });

  it('les quatre entrées engagent, chacune sur son fil', () => {
    for (const [cell, e] of Object.entries(SAAT_ENTREES)) {
      const s = annonce(createInitialState(), cell as SaatCell, '135872');
      expect(s.trains, cell).toHaveLength(1);
      expect(s.trains[0].thread, cell).toBe(e!.thread);
      expect(s.trainNum[e!.counter], cell).toBe(135872);
    }
  });
});

describe('ce que l’annonce refuse', () => {
  it('un numéro qui n’en est pas un', () => {
    for (const saisie of ['', '13587', '1358722', 'abcdef', '13 872']) {
      const s = annonce(createInitialState(), 'v1ag', saisie);
      expect(s.trains, saisie).toHaveLength(0);
    }
  });

  it('un numéro déjà en circulation', () => {
    const s = annonce(createInitialState(), 'v1ag', '135872');
    const t = annonce(s, 'v2n2', '135872');
    expect(t.trains).toHaveLength(1);
    expect(t.saat.v2n2).toBe('');
  });

  it('un numéro déjà inscrit ailleurs au graphique', () => {
    // Un train garé voie centrale au départ d'un scénario, par exemple : il
    // n'a pas d'objet `Train` mais il occupe bien le tronçon.
    const s = createInitialState();
    s.saat.nu = '135872';
    const t = annonce(s, 'v1ag', '135872');
    expect(t.trains).toHaveLength(0);
    expect(t.saat.nu).toBe('135872');
  });

  it('et le refus vide la case, en le disant au journal', () => {
    const s = createInitialState();
    s.saat.v1ag = '13587';
    const t = annonce(s, 'v1ag', '13587');
    expect(t.saat.v1ag).toBe('');
    expect(t.log[0]).toMatchObject({ level: 'error' });
    expect(t.log[0].text).toContain('13587');
  });
});
