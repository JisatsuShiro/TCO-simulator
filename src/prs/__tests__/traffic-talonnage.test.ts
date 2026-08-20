// Talonnage, déraillement, arrêt au pied : trois issues à ne pas confondre.
//
// Le source distingue trois cas quand un train se présente sur une aiguille
// qui n'est pas dans sa position — et le vocabulaire n'est pas décoratif :
//
//   `taquatre()`   train engagé **sur carré ouvert** (`memv1 == 1`) : il prend
//                  l'aiguille par le talon — « je viens de talonner
//                  l'aiguille 85b ! », **sans sirène** ;
//   `taquatre()`   train engagé **sur ordre**, en marche à vue (`memv1 == 0`) :
//                  il s'arrête au pied et attend ;
//   `taquatreat()` l'aiguille bouge **sous** le train — « je viens de dérailler
//                  sur l'aiguille 85b ! », précédé de `dsoalert()`.

import { describe, expect, it } from 'vitest';
import { createInitialState, pressRoute } from '../engine';
import type { PrsState } from '../engine';
import { advanceTraffic, nextTrafficDue, startTraffic, trainStatus } from '../traffic';
import type { Train } from '../traffic';
import { T } from './helpers';

/** Le train arrêté sur l'étape nommée, s'il y en a un. */
const a = (s: PrsState, etape: string): Train | undefined =>
  s.trains.find((t) => trainStatus(t).endsWith(`— ${etape}`));

/**
 * Fait tourner le trafic jusqu'à ce qu'un train soit **sur le point** de jouer
 * l'étape nommée, sans la jouer : l'appelant règle alors le terrain, puis
 * appelle `joue()`.
 */
function jusquA(s: PrsState, etape: string, limite = 400): Train {
  let now = T;
  for (let i = 0; i < limite; i += 1) {
    const t = a(s, etape);
    if (t) return t;
    const due = nextTrafficDue(s);
    if (due == null) break;
    now = Math.max(now, due);
    advanceTraffic(s, now);
  }
  throw new Error(
    `étape « ${etape} » jamais atteinte — trains : ${s.trains.map(trainStatus).join(', ')}`,
  );
}

/** Joue l'étape en attente de ce train — les autres suivent s'ils sont dus. */
function joue(s: PrsState, t: Train): void {
  advanceTraffic(s, t.dueAt);
}

/** AG-N1 formé, trafic souple lancé : un train arrive par la voie 1. */
function trainVoie1(): PrsState {
  const s = pressRoute(createInitialState(), 'agnida', T);
  startTraffic(s, T);
  return s;
}

const journal = (s: PrsState) => s.log.map((e) => e.text).join('\n');

describe('un train engagé sur carré ouvert talonne', () => {
  it("l'annonce comme un talonnage, pas comme un déraillement", () => {
    const s = trainVoie1();
    const t = jusquA(s, 'taquatre');
    // `attvi()` : le carré était ouvert, donc `memv1 = 1`.
    expect(t.cleared).toBe(true);
    // L'aiguille se dérobe au terrain — contrôle perdu, position contraire.
    s.lev.aig85b = 'd';
    joue(s, t);

    expect(journal(s)).toMatch(/a talonné l'aiguille 85b/);
    expect(journal(s)).not.toMatch(/déraill/);
  });

  it('interrompt le trafic, sans faire hurler la sirène', () => {
    // `if (memv1==1){alert("…talonner…");location.reload();}` — pas de
    // `dsoalert()`, contrairement à toutes les branches de déraillement.
    const s = trainVoie1();
    const t = jusquA(s, 'taquatre');
    const sirene = s.sfx.derail;
    s.lev.aig85b = 'd';
    joue(s, t);

    expect(s.traffic).toBe(false);
    expect(s.sfx.derail).toBe(sirene);
  });
});

describe('un train engagé sur ordre ne talonne pas', () => {
  it("s'arrête au pied de l'aiguille, et le trafic continue", () => {
    // `attvi()` : `if (c81==0){memv1=1;} else{memv1=0;}`. Ici le carré s'est
    // refermé et c'est l'autorisation de franchissement (`auto81`) qui engage
    // le train : il roule à vue, donc il peut s'arrêter.
    const s = trainVoie1();
    const t = jusquA(s, 'attvi');
    t.auto = true;
    s.signals.c81 = 1;
    joue(s, t);
    expect(t.cleared).toBe(false);

    s.lev.aig85b = 'd';
    const u = jusquA(s, 'taquatre');
    joue(s, u);

    expect(journal(s)).toMatch(/arrêté au pied de l’aiguille 85b/);
    expect(journal(s)).not.toMatch(/talonné|déraillé/);
    expect(s.traffic).toBe(true);
  });
});

describe("l'aiguille qui bouge sous le train reste un déraillement", () => {
  it('le dit, et déclenche la sirène', () => {
    // `tacinqatn()` : `if (lev81a=="g"){dsoalert();alert("…dérailler…");}`
    const s = trainVoie1();
    const t = jusquA(s, 'tacinqatn');
    const sirene = s.sfx.derail;
    s.lev.aig81a = 'g';
    joue(s, t);

    expect(journal(s)).toMatch(/a déraillé sur l'aiguille 81a/);
    expect(s.sfx.derail).toBe(sirene + 1);
    expect(s.traffic).toBe(false);
  });
});
