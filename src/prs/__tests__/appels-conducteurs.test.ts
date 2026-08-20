// Ce que le poste signale, et son chemin jusqu'à l'écran.
//
// L'original passe tout en `alert()` — la modale bloque le poste jusqu'au clic.
// Le portage l'écrivait au journal ; le journal une fois masqué, il ne se voyait
// plus nulle part. Deux familles ont désormais leur file, `state.messages`, que
// la fenêtre affiche et que l'aiguilleur vide une par une :
//
//   `appel`     un conducteur au téléphone — il attend une réponse ;
//   `incident`  un accident de circulation — les trois qui arrêtent le trafic,
//               et les deux franchissements de carré fermé.
//
// Ce que ces essais garantissent : que les deux familles remplissent la file,
// qu'un conducteur ne s'y répète pas, qu'un incident n'en est jamais chassé par
// les appels qu'il provoque, que la prendre n'efface pas la trace au journal —
// et que le détonateur d'un franchissement **autorisé** ne s'y invite pas.

import { describe, expect, it } from 'vitest';
import { acquitterMessage, createInitialState, pressRoute } from '../engine';
import type { PosteMessage, PrsState } from '../engine';
import { advanceTraffic, nextTrafficDue, startTraffic, trainStatus } from '../traffic';
import { T } from './helpers';

const appels = (s: PrsState): PosteMessage[] => s.messages.filter((m) => m.kind === 'appel');
const incidents = (s: PrsState): PosteMessage[] => s.messages.filter((m) => m.kind === 'incident');

/** Fait tourner le trafic jusqu'à ce que la condition tienne, ou s'épuise. */
function jusquA(s: PrsState, ok: (s: PrsState) => boolean, limite = 400): PrsState {
  let now = T;
  for (let i = 0; i < limite && !ok(s); i += 1) {
    const due = nextTrafficDue(s);
    if (due == null) break;
    now = Math.max(now, due);
    advanceTraffic(s, now);
  }
  return s;
}

/** Le poste au repos, trafic lancé : les carrés sont fermés, personne n'a tracé. */
function posteEnMarche(): PrsState {
  const s = createInitialState();
  startTraffic(s, T);
  return s;
}

describe('un conducteur arrêté devant un signal fermé appelle', () => {
  it('et son appel arrive dans la file', () => {
    const s = jusquA(posteEnMarche(), (x) => appels(x).length > 0);
    expect(appels(s).length).toBeGreaterThan(0);

    const a = appels(s)[0];
    // Le fil A part en 135517 + 2, le fil B en 135872 + 2 : l'un des deux.
    expect(a.num).toBeGreaterThan(100_000);
    expect(a.text.length).toBeGreaterThan(20);
    // La réplique complète s'annonce, comme au téléphone.
    expect(a.text).toContain(String(a.num));
  });

  it('et c’est bien un train arrêté qui parle', () => {
    const s = jusquA(posteEnMarche(), (x) => appels(x).length > 0);
    const t = s.trains.find((x) => x.num === appels(s)[0].num);
    expect(t, 'le train de l’appel existe').toBeDefined();
    expect(trainStatus(t!)).toContain('arrêté');
  });

  it('une seule fois, si longtemps qu’il attende', () => {
    // `aamessN` : la réplique est mémorisée par train et par motif, et l'étape
    // du carré se rejoue toutes les secondes tant qu'il reste fermé. Sans cette
    // mémoire, le poste croulerait sous le même appel.
    //
    // On compte au **journal**, pas dans la file : celle-ci est bornée, et le
    // second fil appelle lui aussi — depuis son propre carré.
    const s = jusquA(posteEnMarche(), (x) => appels(x).length > 0);
    const phrase = appels(s)[0].text;
    jusquA(s, () => false, 200);
    expect(s.log.filter((l) => l.text === phrase)).toHaveLength(1);
  });

  it('le journal en garde la trace, mot pour mot', () => {
    const s = jusquA(posteEnMarche(), (x) => appels(x).length > 0);
    const a = appels(s)[0];
    expect(s.log.some((l) => l.seq === a.seq && l.text === a.text)).toBe(true);
  });
});

describe('prendre l’appel', () => {
  it('le retire de l’écran mais pas du journal', () => {
    const s = jusquA(posteEnMarche(), (x) => appels(x).length > 0);
    const a = appels(s)[0];
    const t = acquitterMessage(s, a.seq);

    expect(appels(t).some((x) => x.seq === a.seq)).toBe(false);
    expect(t.log.some((l) => l.seq === a.seq)).toBe(true);
  });

  it('n’efface que celui-là', () => {
    const s = jusquA(posteEnMarche(), (x) => appels(x).length >= 2);
    expect(appels(s).length).toBeGreaterThanOrEqual(2);
    const garde = appels(s)[1].seq;
    const t = acquitterMessage(s, appels(s)[0].seq);
    expect(appels(t).map((x) => x.seq)).toContain(garde);
  });

  it('et laisse l’état d’origine intact', () => {
    const s = jusquA(posteEnMarche(), (x) => appels(x).length > 0);
    const avant = appels(s).length;
    acquitterMessage(s, appels(s)[0].seq);
    expect(appels(s)).toHaveLength(avant);
  });
});

describe('la file ne déborde pas', () => {
  it('elle ne garde que les quatre derniers appels', () => {
    // Quatre boîtes tiennent à l'écran ; au-delà, la plus ancienne s'efface —
    // elle reste au journal.
    const s = jusquA(posteEnMarche(), () => false, 4_000);
    expect(appels(s).length).toBeLessThanOrEqual(4);
    expect(s.log.filter((l) => l.level === 'warn').length).toBeGreaterThan(0);
  });
});

describe('un accident de circulation s’affiche aussi', () => {
  /**
   * AG-N1 formé, trafic lancé, puis l'aiguille 81a se dérobe sous le train.
   *
   * `tacinqatn()` : `if (lev81a=="g"){dsoalert();alert("…dérailler…");}` — le
   * seul cas où l'original fasse hurler la sirène avant de parler.
   */
  function deraillement(): PrsState {
    const s = pressRoute(createInitialState(), 'agnida', T);
    startTraffic(s, T);
    const s2 = jusquA(s, (x) => x.trains.some((t) => trainStatus(t).includes('tacinqatn')));
    const t = s2.trains.find((x) => trainStatus(x).includes('tacinqatn'))!;
    s2.lev.aig81a = 'g';
    advanceTraffic(s2, t.dueAt);
    return s2;
  }

  it('le déraillement arrive dans la file, en incident', () => {
    const s = deraillement();
    expect(incidents(s)).toHaveLength(1);
    expect(incidents(s)[0].text).toMatch(/a déraillé sur l'aiguille 81a/);
    // Il porte la circulation, comme un appel : la fenêtre l'affiche pareil.
    // Le train, lui, a quitté la liste — `derail()` rend `done: true`, il ne
    // roule plus. C'est le message qui en garde le numéro.
    expect(incidents(s)[0].text).toContain(String(incidents(s)[0].num));
    expect(s.trains.some((t) => t.num === incidents(s)[0].num)).toBe(false);
  });

  it('et le trafic s’arrête — c’est ce que l’écran doit expliquer', () => {
    const s = deraillement();
    expect(s.traffic).toBe(false);
    expect(s.sfx.derail).toBeGreaterThan(0);
  });

  it('il se prend comme un appel, et reste au journal', () => {
    const s = deraillement();
    const m = incidents(s)[0];
    const t = acquitterMessage(s, m.seq);
    expect(t.messages.some((x) => x.seq === m.seq)).toBe(false);
    expect(t.log.some((l) => l.seq === m.seq && l.text === m.text)).toBe(true);
  });

  it('et les appels qu’il provoque ne le chassent pas de l’écran', () => {
    // Le trafic est arrêté, mais les trains déjà en ligne continuent d'appeler.
    // La file est bornée à quatre : c'est un appel qu'elle sacrifie, jamais
    // l'accident qui explique l'arrêt du poste.
    const s = deraillement();
    const seq = incidents(s)[0].seq;
    jusquA(s, () => false, 1_000);
    expect(s.messages.length).toBeLessThanOrEqual(4);
    expect(incidents(s).map((m) => m.seq)).toContain(seq);
  });
});

describe('le franchissement de carré fermé s’affiche aussi', () => {
  /**
   * Le carré se referme sous un train déjà lancé.
   *
   * `tdeux()` retient que le train roulait — `messa = 3` — et `ttrois()` en tire
   * les conséquences : « il ne pourra plus s'arrêter ». Le détonateur claque, et
   * le conducteur appelle depuis l'autre côté du signal.
   */
  function franchissement(): PrsState {
    const s = pressRoute(createInitialState(), 'agnida', T);
    startTraffic(s, T);
    // Le train voit le C 81 ouvert et se lance : `tdeux()` pose `running`.
    const s2 = jusquA(s, (x) => x.trains.some((t) => trainStatus(t).includes('ttrois')));
    const t = s2.trains.find((x) => trainStatus(x).includes('ttrois'))!;
    expect(t.running, 'le train est lancé').toBe(true);
    // Trop tard : le carré se referme devant lui.
    s2.signals.c81 = 1;
    advanceTraffic(s2, t.dueAt);
    return s2;
  }

  it('le détonateur claque, et l’écran le dit', () => {
    const s = franchissement();
    expect(incidents(s)).toHaveLength(1);
    expect(incidents(s)[0].text).toMatch(/a FRANCHI le C 81 fermé — détonateur/);
    expect(s.sfx.deto).toBeGreaterThan(0);
  });

  it('le conducteur appelle en plus, depuis l’autre côté du signal', () => {
    // Deux boîtes, et c'est juste : le détonateur est le fait du poste, l'appel
    // est celui du conducteur. `messa = 1` l'empêche de redire qu'il est arrêté
    // au carré — il est passé devant.
    const s = franchissement();
    const num = incidents(s)[0].num;
    expect(appels(s).some((a) => a.num === num && /viens de franchir/.test(a.text))).toBe(true);
  });

  it('mais le trafic continue : ce n’est pas un déraillement', () => {
    const s = franchissement();
    expect(s.traffic).toBe(true);
    expect(s.trains.some((t) => t.overran)).toBe(true);
  });

  it('le détonateur du C 84, lui, ne signale rien', () => {
    // `attvc()` : `if (c84==1){dsodetoa();}` — franchi **sur ordre**, en marche
    // à vue. Le détonateur claque, mais c'est la procédure, pas l'accident, et
    // l'original ne le journalise même pas.
    const s = createInitialState();
    startTraffic(s, T);
    jusquA(s, () => false, 1_500);
    for (const m of incidents(s)) expect(m.text).not.toMatch(/C 84/);
  });
});

describe('un carré ouvert ne fait appeler personne', () => {
  it('le train passe sans rien dire', () => {
    // AG-N1 tracé avant l'arrivée : le C 81 s'ouvre, le conducteur n'a aucune
    // raison d'appeler le poste.
    let s = posteEnMarche();
    s = pressRoute(s, 'agnida', T);
    expect(s.established.agnida).toBe(true);

    // On suit le seul fil A jusqu'à ce qu'il ait franchi le carré.
    const num = s.trains.find((t) => t.thread === 'A')!.num;
    jusquA(s, (x) => (x.trains.find((t) => t.num === num)?.step ?? 99) >= 4, 200);
    expect(appels(s).some((a) => a.num === num)).toBe(false);
  });
});
