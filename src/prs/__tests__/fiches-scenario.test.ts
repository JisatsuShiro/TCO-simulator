// Fiches de situation de travail (« T.S.T. ») — le bouton `btst` / `ftst()`.
//
// Chaque scénario est livré avec une planche scannée : le graphique de
// circulation prévu, numéro par numéro, heure et itinéraire, sens impair à
// gauche et sens pair à droite. C'est le document sur lequel l'aiguilleur
// travaille.
//
// Ces planches sont aussi une **vérification indépendante** de la table des
// scénarios : elle a été générée mécaniquement depuis `gaestro.js`, la fiche
// est un scan produit par l'auteur. Si les deux concordent, les deux sont
// justes. Les essais ci-dessous confrontent les numéros engagés par le moteur
// à ceux relevés sur deux planches.

import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { startScenario, tick } from '../engine';
import type { PrsState } from '../engine';
import { SCENARIOS, ficheScenario } from '../scenarios';
import { T } from './helpers';

describe('les planches sont livrées', () => {
  it('les seize scénarios ont la leur', () => {
    for (const sc of SCENARIOS) {
      const url = ficheScenario(sc.id);
      expect(existsSync(`public${url}`), `${sc.label} → ${url}`).toBe(true);
    }
  });

  it('les quatre « service normal » portent le préfixe sn', () => {
    // `ftst()` : `if (tsc==91) {open("doc/tst/scenarsn1.html",…);}`
    expect(ficheScenario('91')).toBe('/images/prs/tst/scenarsn1.jpg');
    expect(ficheScenario('94')).toBe('/images/prs/tst/scenarsn4.jpg');
    expect(ficheScenario('1')).toBe('/images/prs/tst/scenar1.jpg');
    expect(ficheScenario('12')).toBe('/images/prs/tst/scenar12.jpg');
  });
});

/**
 * Les numéros engagés par un scénario, dans l'ordre, **l'aiguilleur suivant
 * son graphique**.
 *
 * Depuis que les gardes de phase sont portées, une phase attend que la voie
 * soit prête : sans personne au pupitre, les trains s'arrêtent aux signaux et
 * l'horaire se fige — c'est tout l'intérêt de la garde. Ces essais-ci ne
 * portent que sur la **numérotation** ; le banc lève donc les gardes à mesure,
 * comme le ferait un aiguilleur qui ne prend aucun retard : la case d'annonce
 * se vide et la circulation précédente est réputée dégagée dès qu'un train est
 * engagé.
 */
function numerosEngages(id: string, minutes: number): number[] {
  let s: PrsState = startScenario(id, T);
  const vus = new Set<number>();
  const ordre: number[] = [];
  for (let now = T; now <= T + minutes * 60_000; now += 2_000) {
    s = tick(s, now);
    for (const t of s.trains) {
      if (vus.has(t.key)) continue;
      vus.add(t.key);
      ordre.push(t.num);
      // L'aiguilleur a reçu ce train : la voie redevient disponible.
      if (t.thread === 'A') s.dtrain.v1 = t.num;
      if (t.thread === 'B') s.dtrain.v2 = t.num;
    }
    for (const c of ['v1ag', 'v2n2', 'vm'] as const) s.saat[c] = '';
    // Les phases « voie centrale » attendent un train garé, et parfois un
    // numéro précis : on le leur donne.
    const attendue = SCENARIOS.find((x) => x.id === id)!.phases.find(
      (ph, i) => !s.scenario?.fired[i] && ph.attend?.present?.cell === 'nu',
    );
    s.trpresvc = true;
    if (attendue?.attend?.present) s.saat.nu = String(attendue.attend.present.num);
  }
  return ordre;
}

describe('les numéros du moteur sont ceux de la planche', () => {
  it('scénario 1 — neuf circulations impaires, dix paires', () => {
    // Relevé sur `scenar1.jpg` : 135161 AG-NU, 135519 AG-N1, 135521, 135163
    // AG-NU, 135523, 135525, 135527, 135529, 135531 ; et côté pair 135438,
    // 135126 NU-DG V2, 135440, 135442, 135444, 135128 NU-DG V2, 135446,
    // 135448, 135450, 135452.
    const vus = new Set(numerosEngages('1', 30));
    for (const n of [135_161, 135_519, 135_521, 135_163, 135_523, 135_525, 135_527, 135_529, 135_531]) {
      expect(vus.has(n), `impair ${n}`).toBe(true);
    }
    for (const n of [135_438, 135_126, 135_440, 135_442, 135_444, 135_128, 135_446, 135_448, 135_450, 135_452]) {
      expect(vus.has(n), `pair ${n}`).toBe(true);
    }
  });

  it('scénario 5 — le train de la voie mère garde son numéro en repartant', () => {
    // Sur `scenar5.jpg` : 403529 arrive AM-NU à 12H08, et la voie centrale
    // renvoie **403542** à 12H10 — `scapheg()` recale `trainvcb = 403540`.
    const vus = new Set(numerosEngages('5', 30));
    expect(vus.has(403_529), 'arrivée voie mère').toBe(true);
    expect(vus.has(403_542), 'départ voie centrale').toBe(true);
    // Puis le compteur revient à la série 1352xx.
    expect(vus.has(135_202), 'départ suivant').toBe(true);
  });

  it('scénario 5 — la voie centrale est déjà occupée à la prise de poste', () => {
    // `scenar5()` : `trpresvc = 1; document.saat.casec.value = "135200";`
    const s = startScenario('5', T);
    expect(s.trpresvc).toBe(true);
    expect(s.saat.nu).toBe('135200');
    // Et la première phase « voie centrale » lui redonne ce numéro.
    expect(new Set(numerosEngages('5', 15)).has(135_200)).toBe(true);
  });

  it('une phase antérieure à la prise de poste ne se joue jamais', () => {
    // Le scénario 5 démarre à 12h04'01" et sa table porte une phase à 12h02 :
    // le déclenchement se fait sur **égalité** de la minute, elle est donc
    // injouable. La planche le confirme — aucune circulation avant 12H05.
    const def = SCENARIOS.find((x) => x.id === '5')!;
    expect(def.phases[0].at).toBe('12h02');
    expect(def.start).toEqual({ h: 12, m: 4, s: 1 });
    // 135193 est le train de la phase 12h11, pas celui de la phase 12h02.
    const vus = numerosEngages('5', 30);
    expect(vus.filter((n) => n === 135_193)).toHaveLength(1);
  });
});

describe('les sept voies centrales occupées au départ', () => {
  it('portent le numéro que leur première phase redonne', () => {
    // Le compteur `vcb` du scénario est réglé pour que le premier train
    // « voie centrale » reprenne le numéro déjà garé : les deux doivent
    // concorder, sans quoi la planche et le poste se contredisent.
    const avecGarage = SCENARIOS.filter((sc) => sc.voieCentrale != null);
    expect(avecGarage).toHaveLength(7);
    for (const sc of avecGarage) {
      const premiere = sc.phases.find((p) => p.spawn === 'cb' || p.spawn === 'cm');
      expect(premiere, sc.label).toBeDefined();
      const depart = premiere!.nums?.vcb ?? (sc.nums.vcb as number);
      expect(depart + 2, `${sc.label} — garé ${sc.voieCentrale}`).toBe(sc.voieCentrale);
    }
  });
});
