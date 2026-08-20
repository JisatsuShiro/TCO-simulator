// Les fiches de situation de travail, confrontées à la table des scénarios.
//
// Les planches sont des scans transcrits à la main (`../tst`) ; la table des
// phases a été extraite de `gaestro.js`. Les deux décrivent le même service :
// si les **numéros** concordent, scénario par scénario et sens par sens, ni la
// transcription ni la table ne se sont trompées.
//
// Le recoupement est serré. Le numéro d'une circulation ne s'écrit nulle part
// dans la phase qui l'engage : il sort d'un compteur que chaque `trafic*()`
// avance de deux, et que treize phases recalent en cours de route. Rejouer
// cette marche des compteurs et retrouver, à la ligne près, ce que l'auteur
// avait écrit à la main sur seize planches ne laisse guère de place au hasard.
//
// Ce n'est pas un exercice : la confrontation a trouvé deux fautes de frappe —
// une dans la planche 12, une dans la source elle-même (voir plus bas).
//
// Les **heures**, elles, ne se vérifient pas ainsi : celles des planches sont
// écrites à la main et suivent les phases sans s'en déduire — sur le scénario 3
// le premier AG-NU part deux minutes après sa phase, l'AM-N1 zéro, les AG-N1
// une. On se contente de les voir monter.

import { describe, expect, it } from 'vitest';
import { SCENARIOS, SPAWN_TARGET } from '../scenarios';
import type { ScenarioDef, SpawnKind, TrainCounter } from '../scenarios';
import { rangees, TST, VOIES } from '../tst';

/** Sens d'une circulation : la planche range les deux en colonnes. */
const sens = (spawn: SpawnKind): 'impair' | 'pair' =>
  SPAWN_TARGET[spawn].thread === 'A' || SPAWN_TARGET[spawn].thread === 'M' ? 'impair' : 'pair';

/** Minutes depuis minuit, pour comparer une heure « HHhMM » au départ. */
const minutes = (at: string) => {
  const [h, m] = at.split('h').map(Number);
  return h * 60 + m;
};

/**
 * Les numéros qu'un scénario engage réellement, dans l'ordre, par sens.
 *
 * Deux règles suffisent, et ce sont celles du moteur : une phase dont l'heure
 * tombe **avant** la prise de service ne se joue jamais — elle se déclenche sur
 * égalité de la minute — et engager un train avance son compteur de deux, après
 * l'éventuel recalage porté par la phase.
 */
function engages(def: ScenarioDef) {
  const depart = def.start.h * 60 + def.start.m;
  const cpt = { ...def.nums } as Partial<Record<TrainCounter, number | 'EVO'>>;
  const out: Record<'impair' | 'pair', string[]> = { impair: [], pair: [] };

  for (const p of def.phases) {
    if (p.nums) Object.assign(cpt, p.nums);
    if (minutes(p.at) < depart) continue;
    const cle = SPAWN_TARGET[p.spawn].counter;
    // `trainvcm = "EVO"` : une évolution n'a pas de numéro, et rien n'avance.
    if (cpt[cle] === 'EVO') {
      out[sens(p.spawn)].push('EVO');
      continue;
    }
    cpt[cle] = ((cpt[cle] as number) ?? 0) + 2;
    out[sens(p.spawn)].push(String(cpt[cle]));
  }
  return out;
}

/**
 * Les circulations que le poste engage sans qu'elles soient au graphique.
 *
 * Toutes deux sont l'imprévu dont le scénario fait son sujet : le graphique dit
 * le service **prévu**, et ni une mise en marche ni un train né d'une alerte
 * radio n'y avaient leur place. L'aiguilleur en est avisé autrement — la fiche
 * le rappelle en bas de planche.
 */
const HORS_GRAPHIQUE: Record<string, string[]> = {
  93: ['747204'],
  94: ['797302'],
};

describe('les seize planches sont transcrites', () => {
  it('chaque scénario a la sienne', () => {
    for (const sc of SCENARIOS) expect(TST[sc.id], sc.label).toBeDefined();
    expect(Object.keys(TST)).toHaveLength(SCENARIOS.length);
  });

  it('aucune ligne vide ni mal formée', () => {
    for (const [id, f] of Object.entries(TST)) {
      for (const r of [...f.impair, ...f.pair]) {
        expect(r.num, `${id} — numéro`).toMatch(/^(\d{6}|EVO \*)$/);
        expect(r.heure, `${id} — heure`).toMatch(/^\d{2}H\d{2}$/);
        expect(r.itineraire, `${id} — itinéraire`).toMatch(
          /^(AG-N1|AG-NU|AM-N1|AM-NU|N2-DG|NU-AM|NU-DG par V[12])$/,
        );
      }
    }
  });

  it('chaque itinéraire se traduit en deux voies', () => {
    // La fiche n'affiche plus le code du poste : si un itinéraire manquait à la
    // table, sa ligne perdrait sa destination sans que rien ne le signale.
    for (const [id, f] of Object.entries(TST)) {
      for (const r of [...f.impair, ...f.pair]) {
        expect(VOIES[r.itineraire], `${id} — ${r.itineraire}`).toBeDefined();
      }
    }
    // Et aucune traduction ne dort : les huit servent.
    const vus = new Set(
      Object.values(TST).flatMap((f) => [...f.impair, ...f.pair].map((r) => r.itineraire)),
    );
    expect([...Object.keys(VOIES)].sort()).toEqual([...vus].sort());
  });

  it('les deux NU-DG ne se confondent pas', () => {
    // Elles sortent au même endroit — la voie 2 — et ne diffèrent que par la
    // voie de traversée. C'est pourtant deux boutons distincts au pupitre.
    expect(VOIES['NU-DG par V1'].vers).not.toBe(VOIES['NU-DG par V2'].vers);
    for (const v of Object.values(VOIES)) {
      expect(v.de).toMatch(/^voie (1|2|centrale|mère)$/);
    }
  });

  it('les heures montent, dans chaque sens', () => {
    for (const [id, f] of Object.entries(TST)) {
      for (const [colonne, lignes] of [
        ['impair', f.impair],
        ['pair', f.pair],
      ] as const) {
        const h = lignes.map((r) => r.heure);
        expect(h, `${id} ${colonne}`).toEqual([...h].sort());
      }
    }
  });
});

describe('les deux sens se fondent sans rien perdre', () => {
  it.each(SCENARIOS.map((sc) => [sc.id, sc.label] as const))(
    'scénario %s — %s',
    (id) => {
      const f = TST[id];
      const r = rangees(f);

      // Chaque circulation se retrouve, dans son sens et dans l'ordre.
      expect(r.map((x) => x.impair).filter(Boolean)).toEqual(f.impair);
      expect(r.map((x) => x.pair).filter(Boolean)).toEqual(f.pair);

      // Une ligne porte au moins une circulation, et son heure est la leur.
      for (const x of r) {
        expect(x.impair ?? x.pair).toBeDefined();
        for (const c of [x.impair, x.pair]) if (c) expect(c.heure).toBe(x.heure);
      }

      // L'heure est l'axe : elle monte, et deux lignes ne la partagent que si
      // les deux sens se présentent séparément à la même minute.
      const h = r.map((x) => x.heure);
      expect(h).toEqual([...h].sort());
      expect(new Set(h).size).toBe(h.length);
    },
  );
});

describe('la planche annonce ce que le poste engage', () => {
  it.each(SCENARIOS.map((sc) => [sc.id, sc.label] as const))(
    'scénario %s — %s',
    (id) => {
      const def = SCENARIOS.find((x) => x.id === id)!;
      const attendu = engages(def);
      const hors = HORS_GRAPHIQUE[id] ?? [];

      for (const colonne of ['impair', 'pair'] as const) {
        // La planche numérote les évolutions « EVO * » et les renvoie en note.
        const planche = TST[id][colonne].map((r) => r.num.replace(' *', ''));
        const poste = attendu[colonne].filter((n) => !hors.includes(n));
        expect(planche, `${id} ${colonne}`).toEqual(poste);
      }
    },
  );

  it('les deux exceptions sont bien engagées, et bien annotées', () => {
    for (const [id, nums] of Object.entries(HORS_GRAPHIQUE)) {
      const def = SCENARIOS.find((x) => x.id === id)!;
      const tous = [...engages(def).impair, ...engages(def).pair];
      for (const n of nums) expect(tous, `${id} — ${n}`).toContain(n);
      expect(TST[id].note, id).toContain(nums[0]);
    }
  });
});

describe('les évolutions sont signalées', () => {
  it('les deux scénarios qui en portent une la renvoient en bas de planche', () => {
    const avecEvo = Object.entries(TST).filter(([, f]) =>
      [...f.impair, ...f.pair].some((r) => r.num.startsWith('EVO')),
    );
    expect(avecEvo.map(([id]) => id).sort()).toEqual(['11', '92']);
    for (const [id, f] of avecEvo) expect(f.note, id).toMatch(/Évolution du 403603/);
  });

  it('et ce sont bien les scénarios dont le compteur vaut EVO', () => {
    for (const sc of SCENARIOS) {
      const evoTable = sc.nums.vcm === 'EVO';
      const evoFiche = [...TST[sc.id].impair, ...TST[sc.id].pair].some((r) =>
        r.num.startsWith('EVO'),
      );
      expect(evoFiche, sc.label).toBe(evoTable);
    }
  });
});

describe('aucune garde ne peut rester en suspens', () => {
  // `scaphsnds()` attendait `dtrainv2 == 13572` — un chiffre perdu pour 135872.
  // La garde ne passait jamais : le sens pair se figeait à 17h35, vingt minutes
  // après la prise de service, et les 135874 et 135876 de la planche n'arrivaient
  // pas. Une garde ne peut porter que sur un train déjà engagé, ou déjà en ligne.
  it.each(SCENARIOS.map((sc) => [sc.id, sc.label] as const))(
    'scénario %s — %s',
    (id) => {
      const def = SCENARIOS.find((x) => x.id === id)!;
      const depart = def.start.h * 60 + def.start.m;
      const cpt = { ...def.nums } as Partial<Record<TrainCounter, number | 'EVO'>>;

      // Ce qui roule déjà à la prise de service : la table `degage`, et le train
      // garé voie centrale, que l'un ou l'autre sens peut attendre.
      const vus: Record<string, Set<number>> = { v1: new Set(), v2: new Set(), vm: new Set() };
      for (const [fil, num] of Object.entries(def.degage ?? {})) vus[fil]?.add(num);
      if (def.voieCentrale) for (const s of Object.values(vus)) s.add(def.voieCentrale);

      for (const p of def.phases) {
        if (p.nums) Object.assign(cpt, p.nums);
        if (minutes(p.at) < depart) continue;
        const g = p.attend?.degage;
        if (g) expect(vus[g.fil], `${id} — ${p.at} attend ${g.fil} ${g.num}`).toContain(g.num);

        const cle = SPAWN_TARGET[p.spawn].counter;
        if (cpt[cle] === 'EVO') continue;
        cpt[cle] = ((cpt[cle] as number) ?? 0) + 2;
        // Le fil sur lequel ce train roulera, et où on pourra l'attendre.
        const fil = SPAWN_TARGET[p.spawn].thread === 'M' ? 'vm' : sens(p.spawn) === 'impair' ? 'v1' : 'v2';
        vus[fil].add(cpt[cle] as number);
      }
    },
  );
});
