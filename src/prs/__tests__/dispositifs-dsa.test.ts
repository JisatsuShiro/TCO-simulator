// Le D.S.A, troisième dispositif, et le menu contextuel qui le pose.
//
// Le poste d'origine n'en connaît que deux — `disp1` (D.A) et `dispr1` (D.R) —
// et les pose par un **mode** : le menu « Dispositifs divers » arme
// `da = 1` ou `dr = 1`, et le prochain appui sur un bouton d'itinéraire y pose
// un dispositif au lieu de commander l'itinéraire (`dispda()`, `tfX()`).
//
// Le portage ajoute le **D.S.A** et une seconde voie d'accès : le clic droit
// sur un bouton d'itinéraire, qui désigne directement le bouton visé. Les deux
// voies aboutissent à `changeDispositif()`, et le plafond de quatre reste
// **commun aux trois natures**, comme `magnida()` le fait pour deux :
// `dar1 = disp1 + dispr1; if (dar1 > 4) {disp1--;}`.

import { describe, expect, it } from 'vitest';
import { depuisRepos, T } from './helpers';
import {
  DISPOSITIF_LABELS,
  DISPOSITIF_MAX,
  changeDispositif,
  createInitialState,
  dispositifsPoses,
  pressRoute,
  setDispositifMode,
} from '../engine';
import type { DispositifKind, PrsState } from '../engine';

const poser = (id: 'agnida' | 'nzdgda', kind: DispositifKind, n = 1) => (s: PrsState) => {
  let x = s;
  for (let i = 0; i < n; i += 1) x = changeDispositif(x, id, kind, 1);
  return x;
};

describe('les trois natures de dispositif', () => {
  it('sont comptées séparément sur chaque bouton', () => {
    const s = depuisRepos(
      poser('agnida', 'da', 1),
      poser('agnida', 'dr', 2),
      poser('agnida', 'dsa', 1),
    );
    expect(s.da.agnida).toBe(1);
    expect(s.dr.agnida).toBe(2);
    expect(s.dsa.agnida).toBe(1);
    // Les autres boutons restent vierges : chacun a son compte.
    expect(dispositifsPoses(s, 'nzdgda')).toBe(0);
  });

  it('partent toutes de zéro', () => {
    const s = createInitialState();
    expect(dispositifsPoses(s, 'agnida')).toBe(0);
    expect(s.dsa.agnida).toBe(0);
  });

  it('ont chacune leur libellé', () => {
    expect(DISPOSITIF_LABELS).toEqual({ da: 'D.A', dr: 'D.R', dsa: 'D.S.A' });
  });
});

describe('le plafond est commun aux trois', () => {
  it('quatre dispositifs au total, quelle qu’en soit la nature', () => {
    const s = depuisRepos(
      poser('agnida', 'da', 2),
      poser('agnida', 'dr', 1),
      poser('agnida', 'dsa', 1),
    );
    expect(dispositifsPoses(s, 'agnida')).toBe(DISPOSITIF_MAX);

    // Le cinquième est refusé, quelle que soit sa nature.
    for (const kind of ['da', 'dr', 'dsa'] as DispositifKind[]) {
      const x = changeDispositif(s, 'agnida', kind, 1);
      expect(dispositifsPoses(x, 'agnida'), kind).toBe(DISPOSITIF_MAX);
      expect(x.log[0].text).toMatch(/maximum de 4 dispositifs/);
    }
  });

  it('le D.S.A seul plafonne aussi à quatre', () => {
    const s = depuisRepos(poser('agnida', 'dsa', 6));
    expect(s.dsa.agnida).toBe(DISPOSITIF_MAX);
  });

  it('retirer libère une place', () => {
    let s = depuisRepos(poser('agnida', 'dsa', 4));
    s = changeDispositif(s, 'agnida', 'dsa', -1);
    expect(dispositifsPoses(s, 'agnida')).toBe(3);
    s = changeDispositif(s, 'agnida', 'da', 1);
    expect(s.da.agnida).toBe(1);
  });

  it('retirer sous zéro ne fait rien', () => {
    const s = createInitialState();
    expect(changeDispositif(s, 'agnida', 'dsa', -1)).toBe(s);
  });
});

describe('le D.S.A ne retient pas la commande', () => {
  it("un itinéraire qui en porte se commande normalement", () => {
    // `tfagnida()` ne teste que le **mode** (`da`, `dr`), jamais les
    // compteurs : hors affichage, un dispositif posé n'enclenche rien.
    const s = depuisRepos(poser('agnida', 'dsa', 3), (x) => pressRoute(x, 'agnida', T));
    expect(s.dsa.agnida).toBe(3);
    expect(s.established.agnida).toBe(true);
  });
});

describe('le mode se rend quand plus rien n’est posé', () => {
  it('le D.S.A compte dans ce décompte', () => {
    // `verifda()` / `verifdr()` : `if (tous les compteurs == 0) {dispa = 0;}`.
    let s = depuisRepos(poser('agnida', 'dsa', 1));
    s = setDispositifMode(s, { kind: 'dsa', delta: -1 });
    expect(s.dispMode).not.toBeNull();

    // Tant que le D.S.A subsiste, le mode reste armé.
    s = changeDispositif(s, 'nzdgda', 'da', 1);
    s = changeDispositif(s, 'nzdgda', 'da', -1);
    expect(s.dispMode).not.toBeNull();

    s = changeDispositif(s, 'agnida', 'dsa', -1);
    expect(s.dispMode).toBeNull();
  });
});
