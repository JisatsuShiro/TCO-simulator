// § 4.8 — Manœuvre à main : clé Main-Moteur, calage, renversement du levier.
//
// Référence : `enclenchement.md` § 4.8, et `quXX()` / `levaig()` du source.
// Trois notions se croisent ici : la **commande** (`cagNN`), la **position
// terrain** (`levNN`) et le **contrôle** (`aigNN`), qui n'est rendu que lorsque
// les deux premières concordent.

import { describe, expect, it } from 'vitest';
import { depuisRepos, T } from './helpers';
import {
  createInitialState,
  pressRoute,
  setAigFault,
  throwLever,
  toggleKey,
  toggleMainMoteur,
} from '../engine';
import type { AigFaultKind, PrsState } from '../engine';

const avecCle = (s: PrsState) => toggleKey(s);
const cale = (s: PrsState) => toggleMainMoteur(s, 'aig81a');
const renverse = (s: PrsState) => throwLever(s, 'aig81a');

describe('§4.8 la clé Main-Moteur commande tout', () => {
  it('sans la clé, on ne cale pas', () => {
    const s = depuisRepos(cale);
    expect(s.mm.aig81a).toBe(0);
    expect(s.log[0].text).toMatch(/Clé Main-Moteur non retirée/);
  });

  it('sans la clé, on ne renverse pas', () => {
    const s = depuisRepos((x) => throwLever(x, 'aig81a'));
    expect(s.lev.aig81a).toBe('d'); // position de repos
  });

  it("avec la clé, le calage prend la position courante", () => {
    const s = depuisRepos(avecCle, cale);
    expect(s.mm.aig81a).toBe('d');
  });
});

describe('§4.8 renversement du levier', () => {
  /** AG-N1 formé — commande 81a à droite — puis calage et renversement. */
  const renversee = depuisRepos(avecCle, (x) => pressRoute(x, 'agnida', T), cale, renverse);

  it('la position terrain suit, le contrôle tombe', () => {
    expect(renversee.lev.aig81a).toBe('g');
    expect(renversee.cag.aig81a).toBe('d'); // la commande, elle, ne bouge pas
    expect(renversee.aig.aig81a).toBe(0);
  });

  it('le voyant de dérangement isolement s\'allume', () => {
    expect(renversee.di).toBe(1);
  });

  it("le signal de l'itinéraire établi se referme", () => {
    // `levaig()` rappelle `feX()` pour chaque itinéraire commandé.
    expect(renversee.established.agnida).toBe(true);
    expect(renversee.signals.c81).toBe(1);
  });

  it('un second renversement rejoint la commande et rend le contrôle', () => {
    const s = renverse(renversee);
    expect(s.lev.aig81a).toBe('d');
    expect(s.aig.aig81a).toBe('d');
    expect(s.di).toBe(0);
    expect(s.signals.c81).toBe(0);
  });
});

describe("§4.8 dérangement d'aiguille et manœuvre à main", () => {
  /** DG-N1 commande 81a à gauche ; on l'emmène à droite puis on revient. */
  const allerRetour = (kind: AigFaultKind) =>
    depuisRepos(
      avecCle,
      (x) => pressRoute(x, 'dgni', T),
      (x) => setAigFault(x, { id: 'aig81a', kind }),
      cale,
      renverse, // vers la droite
      renverse, // retour à gauche, position commandée
    );

  it("le dérangement de la direction visée interdit le contrôle", () => {
    // `levaig()` : `if ((dergmta!="aig81ag")&&(cag81a=="g")) {aig81a="g";}`
    const s = allerRetour('noCtrlG');
    expect(s.lev.aig81a).toBe('g');
    expect(s.cag.aig81a).toBe('g');
    expect(s.aig.aig81a).toBe(0);
  });

  it("celui de l'autre direction ne s'y oppose pas", () => {
    const s = allerRetour('noCtrlD');
    expect(s.aig.aig81a).toBe('g');
  });

  it("l'écart ne s'oppose pas non plus : il suit la manœuvre", () => {
    // `if (dergmta=="aig81aeg") { if (cag81a==lev81a){aig81a="d";
    //   dergmta="aig81aed";} … }` — le dérangement change de direction avec
    // le levier au lieu de bloquer.
    const s = allerRetour('elec');
    expect(s.aig.aig81a).toBe('g');
  });
});

describe("§4.8 l'aiguille calée résiste à la commande moteur", () => {
  it("une aiguille calée à gauche perd son contrôle quand un itinéraire la veut à droite", () => {
    // `ffX()` : `if (mm81a=="g"){aig81a=0;di=1;lev81a="g";}`
    const s = depuisRepos(
      avecCle,
      (x) => pressRoute(x, 'dgni', T), // commande 81a à gauche
      cale, // calée à gauche
      (x) => pressRoute(x, 'dgni', T + 1_000), // destruction
      (x) => pressRoute(x, 'agnida', T + 2_000), // veut 81a à droite
    );
    expect(s.cag.aig81a).toBe('d'); // la commande passe
    expect(s.lev.aig81a).toBe('g'); // le terrain reste calé
    expect(s.aig.aig81a).toBe(0);
    expect(s.signals.c81).toBe(1);
  });

  it('rendue au moteur, elle reprend son contrôle si elle est bien placée', () => {
    const s = depuisRepos(avecCle, cale, cale);
    expect(s.mm.aig81a).toBe(0);
    expect(s.aig.aig81a).toBe('d');
  });
});

describe('§4.8 état initial', () => {
  it('la clé est en place', () => {
    expect(createInitialState().clemm).toBe(false);
  });
});
