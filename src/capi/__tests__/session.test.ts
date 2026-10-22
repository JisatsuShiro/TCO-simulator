// Clavier de l'opérateur CAPI : menus déroulants, frappe directe de la clé,
// alarmes de saisie et acquittement par F6 (IN 0513, articles 3, 5.2 et 7).
//
// Le dialogue validé part au serveur en vrai ; ici le moteur joue sur place, de
// manière asynchrone comme la réponse du serveur.

import { describe, expect, it } from 'vitest';
import { executer } from '../dialogues';
import { creerLigne } from '../ligne';
import { nouvelleSession, toucher } from '../session';

const REEL = new Date(2026, 9, 22, 10, 30, 0).getTime();
const VRN = 1;

function poste() {
  const l = creerLigne();
  const s = nouvelleSession();
  const ctx = {
    jouer: (saisie: string) => Promise.resolve(executer(l, VRN, saisie, REEL)),
    rafraichir: () => {},
  };
  const touche = (k: string, reel = REEL) => toucher(l, VRN, s, k, reel, ctx);
  const frappe = (texte: string) => {
    for (const c of texte) touche(c);
  };
  /** Laisse la réponse du serveur arriver. */
  const reponse = () => new Promise((r) => setTimeout(r, 0));
  return { l, s, touche, frappe, reponse };
}

describe('barre des menus', () => {
  it('parcourt les menus aux flèches sans dépasser les extrémités', () => {
    const { s, touche } = poste();
    touche('ArrowLeft');
    expect(s.menu).toBe(0);
    for (let k = 0; k < 8; k++) touche('ArrowRight');
    expect(s.menu).toBe(5);
  });

  it('déroule la liste des clés dès que le curseur change de menu', () => {
    const { s, touche } = poste();
    expect(s.ouvert).toBe(false);
    touche('ArrowRight');
    expect(s).toMatchObject({ menu: 1, ouvert: true, item: 0 });
    touche('ArrowRight');
    expect(s).toMatchObject({ menu: 2, ouvert: true, item: 0 });
    touche('Escape');
    expect(s.ouvert).toBe(false);
  });

  it('ouvre le menu à Entrée et amorce le dialogue choisi', () => {
    const { s, touche } = poste();
    touche('Enter');
    expect(s.ouvert).toBe(true);
    touche('ArrowDown');
    touche('Enter');
    expect(s.saisie).toBe('RA ');
    expect(s.ouvert).toBe(false);
  });

  it('laisse HS sans champ prêt à être validé', () => {
    const { s, touche } = poste();
    for (let k = 0; k < 4; k++) touche('ArrowRight');
    expect(s.ouvert).toBe(true);
    touche('ArrowDown');
    touche('ArrowDown');
    touche('Enter');
    expect(s.saisie).toBe('HS');
  });
});

describe('saisie et validation', () => {
  it('valide un dialogue frappé directement', async () => {
    const { s, touche, frappe, reponse } = poste();
    frappe('aa jze 423755');
    expect(s.saisie).toBe('AA JZE 423755');
    touche('Enter');
    expect(s.attente).toBe(true);
    touche('x'); // clavier suspendu pendant l'attente de la réponse
    await reponse();
    expect(s.attente).toBe(false);
    expect(s.saisie).toBe('');
    expect(s.precedent).toBe('AA JZE 423755');
    expect(s.alarmes).toHaveLength(0);
  });

  it('s’oppose à la suite d’une clé erronée jusqu’à l’effacement', () => {
    const { s, touche, frappe } = poste();
    frappe('ZZ');
    expect(s.alarmes[0].n).toBe(6);
    frappe('AB');
    expect(s.saisie).toBe('ZZ');
    touche('Backspace');
    touche('Backspace');
    frappe('IB');
    expect(s.saisie).toBe('IB');
  });

  it('perd le dialogue à l’acquittement d’une alarme de niveau 2', async () => {
    const { s, touche, frappe, reponse } = poste();
    frappe('AA JZE');
    touche('Enter');
    await reponse();
    expect(s.alarmes[0]).toMatchObject({ n: 1, niveau: 2 });
    frappe('X'); // dialogue verrouillé tant que l'alarme n'est pas acquittée
    expect(s.saisie).toBe('AA JZE');
    touche('F6');
    expect(s.alarmes).toHaveLength(0);
    expect(s.saisie).toBe('');
  });

  it('conserve le dialogue après une alarme de niveau 1', async () => {
    const { s, touche, frappe, reponse } = poste();
    frappe('AA XXX 423755');
    touche('Enter');
    await reponse();
    expect(s.alarmes[0]).toMatchObject({ n: 2, niveau: 1 });
    touche('F6');
    expect(s.saisie).toBe('AA XXX 423755');
  });

  it('perd la préparation passé 60 secondes', () => {
    const { l, s, touche, frappe } = poste();
    frappe('AA JZE 423755');
    touche('Enter', REEL + 61_000);
    expect(s.alarmes[0].n).toBe(17);
    expect(l.cantons.every((c) => c.trains.length === 0)).toBe(true);
  });

  it('affiche la maintenance après DM et revient aux menus normaux après FM', async () => {
    const { l, s, touche, frappe, reponse } = poste();
    l.postes[VRN].bouchon = true;
    frappe('DM');
    touche('Enter');
    await reponse();
    expect(l.postes[VRN].maintenance).toBe(true);
    touche('ArrowRight');
    touche('Enter');
    expect(s.saisie).toBe('TL');
    touche('Escape');
    l.postes[VRN].bouchon = false;
    frappe('FM');
    touche('Enter');
    await reponse();
    expect(l.postes[VRN].maintenance).toBe(false);
  });
});
