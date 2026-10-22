// Dialogues CAPI (IN 0513, annexe 2) : un cycle nominal par famille de clés, puis
// les alarmes que les tableaux de conditions attachent à chaque critère.
//
// Postes : REN (0) · VRN (1) · JZE (2) · RTS (3) · CTB (4). VRN → JZE va vers la
// droite de l'écran : sens impair (423755, 631997).

import { describe, expect, it } from 'vitest';
import { executer } from '../dialogues';
import type { Resultat } from '../dialogues';
import { cantonEntre, creerLigne, horloge, messagesVisibles } from '../ligne';
import type { Ligne } from '../ligne';

const REEL = new Date(2026, 9, 22, 10, 30, 0).getTime();
const REN = 0;
const VRN = 1;
const JZE = 2;
const RTS = 3;

function alarme(r: Resultat): number | null {
  return r.ok ? null : r.alarme;
}

function dit(l: Ligne, i: number, saisie: string, reel = REEL): number | null {
  return alarme(executer(l, i, saisie, reel));
}

/** Heure d'arrivée située `minutes` avant l'horloge du système, au format HHMM. */
function il_y_a(l: Ligne, minutes: number): string {
  const d = new Date(horloge(l, REEL).getTime() - minutes * 60_000);
  return `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
}

function canton(l: Ligne, i: number, j: number) {
  const c = cantonEntre(l, i, j);
  if (c == null) throw new Error('canton absent');
  return c;
}

describe('opérations normales', () => {
  it('conduit un train de l’annonce à la reddition de voie libre', () => {
    const l = creerLigne();
    expect(dit(l, VRN, 'AA JZE 423755')).toBeNull();
    const c = canton(l, VRN, JZE);
    expect(c.trains[0]).toMatchObject({ numero: '423755', etape: 'annonce', clignote: true, vers: 'droite' });
    expect(messagesVisibles(c, REEL)[0].texte).toBe('VRN à JZE - J’annonce train n° 423755');

    expect(dit(l, JZE, 'RA VRN 423755')).toBeNull();
    expect(c.trains[0]).toMatchObject({ etape: 'recu', clignote: false });
    expect(messagesVisibles(c, REEL).at(-1)?.texte).toBe('JZE à VRN - Pris note de l’annonce du train n° 423755');

    expect(dit(l, JZE, `VA VRN 423755 ${il_y_a(l, 2)}`)).toBeNull();
    expect(c.trains[0]).toMatchObject({ etape: 'vl', clignote: true });

    expect(dit(l, VRN, 'RL JZE 423755')).toBeNull();
    expect(c.trains).toHaveLength(0);
    // L'accusé de la reddition ne reste affiché que trois minutes.
    const dernier = messagesVisibles(c, REEL).at(-1);
    expect(dernier?.texte).toBe('VRN à JZE - Pris note de la reddition de voie libre derrière train n° 423755');
    expect(messagesVisibles(c, REEL + 4 * 60_000).includes(dernier!)).toBe(false);
  });

  it('permet de refuser une annonce, puis d’en refaire une', () => {
    const l = creerLigne();
    dit(l, VRN, 'AA JZE 423755');
    expect(dit(l, JZE, 'RA VRN 423755 REFUSE')).toBeNull();
    const c = canton(l, VRN, JZE);
    expect(c.trains).toHaveLength(0);
    expect(messagesVisibles(c, REEL).at(-1)?.texte).toBe('JZE à VRN - je refuse train n° 423755');
    expect(dit(l, VRN, 'AA JZE 423755')).toBeNull();
  });

  it('porte le signe + pour un train porteur de la clé maîtresse', () => {
    const l = creerLigne();
    expect(dit(l, VRN, 'AM JZE 423755')).toBeNull();
    const c = canton(l, VRN, JZE);
    expect(c.trains[0].cle).toBe(true);
    expect(dit(l, JZE, 'RA VRN 423755')).toBe(21); // RA n'accuse pas une annonce AM : absence d'annonce
    expect(dit(l, JZE, 'RM VRN 423755')).toBeNull();
    expect(dit(l, JZE, `VM VRN 423755 ${il_y_a(l, 1)}`)).toBeNull();
    expect(dit(l, VRN, 'RN JZE 423755')).toBeNull();
    expect(c.trains).toHaveLength(0);
  });

  it('annule une annonce reçue', () => {
    const l = creerLigne();
    dit(l, VRN, 'AA JZE 423755');
    expect(dit(l, VRN, 'NA JZE 423755')).toBe(22); // pas encore accusée
    dit(l, JZE, 'RA VRN 423755');
    expect(dit(l, VRN, 'NA JZE 423755')).toBeNull();
    expect(dit(l, JZE, 'NR VRN 423755')).toBeNull();
    expect(canton(l, VRN, JZE).trains).toHaveLength(0);
  });
});

describe('alarmes de saisie', () => {
  it('signale clé, syntaxe, poste, parité et numéro', () => {
    const l = creerLigne();
    expect(dit(l, VRN, 'ZZ JZE 1')).toBe(6);
    expect(dit(l, VRN, 'AA JZE')).toBe(1);
    expect(dit(l, VRN, 'AA JZE 42375555555')).toBe(1);
    expect(dit(l, VRN, 'AA RTS 423755')).toBe(2); // RTS n'est pas le poste voisin en service
    expect(dit(l, VRN, 'AA JZE 423756')).toBe(3);
    expect(dit(l, VRN, 'AA JZE 423756/O')).toBeNull(); // « /O » : parité non conforme au sens
    const l2 = creerLigne();
    dit(l2, VRN, 'AA JZE 423755');
    expect(dit(l2, JZE, 'RA VRN 423757')).toBe(4);
  });

  it('refuse une seconde annonce tant que la première n’est pas soldée', () => {
    const l = creerLigne();
    dit(l, VRN, 'AA JZE 423755');
    expect(dit(l, VRN, 'AA JZE 423757')).toBe(11);
    dit(l, JZE, 'RA VRN 423755');
    expect(dit(l, VRN, 'AA JZE 423757')).toBe(12);
  });

  it('exige une heure d’arrivée de moins d’une heure', () => {
    const l = creerLigne();
    dit(l, VRN, 'AA JZE 423755');
    dit(l, JZE, 'RA VRN 423755');
    expect(dit(l, JZE, `VA VRN 423755 ${il_y_a(l, 90)}`)).toBe(7);
    expect(dit(l, JZE, `VA VRN 423755 ${il_y_a(l, -10)}`)).toBe(7); // dans le futur
    expect(dit(l, JZE, `VA VRN 423755 ${il_y_a(l, 59)}`)).toBeNull();
  });

  it('s’oppose à l’annonce quand la liaison CAPI/CRO est hors service', () => {
    const l = creerLigne();
    l.postes[VRN].liaisonCro = false;
    expect(dit(l, VRN, 'AA JZE 423755')).toBe(43);
  });
});

describe('blocage et canton occupé', () => {
  it('interdit les annonces tant qu’un symbole de blocage est inscrit', () => {
    const l = creerLigne();
    expect(dit(l, JZE, 'IB VRN')).toBeNull();
    expect(dit(l, JZE, 'IB VRN')).toBe(16);
    expect(dit(l, VRN, 'AA JZE 423755')).toBe(16);
    expect(dit(l, JZE, 'EB VRN')).toBeNull();
    expect(dit(l, VRN, 'AA JZE 423755')).toBeNull();
  });

  it('expédie un second train en canton occupé puis libère le canton', () => {
    const l = creerLigne();
    dit(l, VRN, 'AA JZE 423755');
    dit(l, JZE, 'RA VRN 423755');
    expect(dit(l, VRN, 'AO JZE 631997 634')).toBe(35); // blocage non inscrit
    dit(l, VRN, 'IB JZE');
    expect(dit(l, VRN, 'AO JZE 631997 634')).toBeNull();
    const c = canton(l, VRN, JZE);
    expect(c.trains).toHaveLength(2);
    expect(c.trains[1]).toMatchObject({ co: true, mv: '634', etape: 'annonce' });
    // EB et NA sont inhibés dès l'annonce en canton occupé.
    expect(dit(l, VRN, 'EB JZE')).toBe(13);
    expect(dit(l, VRN, 'NA JZE 423755')).toBe(13);

    expect(dit(l, JZE, 'RO VRN 631997')).toBeNull();
    // La reddition derrière le premier train doit être soldée avant VO.
    expect(dit(l, JZE, `VO VRN 631997 634 ${il_y_a(l, 5)}`)).toBe(31);
    dit(l, JZE, `VA VRN 423755 ${il_y_a(l, 10)}`);
    dit(l, VRN, 'RL JZE 423755');
    expect(c.trains).toHaveLength(1); // le second train passe en première fenêtre
    expect(dit(l, JZE, `VO VRN 631997 999 ${il_y_a(l, 5)}`)).toBe(5);
    expect(dit(l, JZE, `VO VRN 631997 634 ${il_y_a(l, 5)}`)).toBeNull();
    expect(dit(l, VRN, 'RP JZE 631997 634')).toBeNull();
    expect(c.trains).toHaveLength(0);
    expect(dit(l, VRN, 'EB JZE')).toBeNull();
  });

  it('annule l’annonce d’un train en canton occupé', () => {
    const l = creerLigne();
    dit(l, VRN, 'AA JZE 423755');
    dit(l, JZE, 'RA VRN 423755');
    dit(l, VRN, 'IB JZE');
    dit(l, VRN, 'AO JZE 631997 634');
    dit(l, JZE, 'RO VRN 631997');
    expect(dit(l, VRN, 'NO JZE 631997')).toBeNull();
    expect(dit(l, JZE, 'NP VRN 631997')).toBeNull();
    expect(canton(l, VRN, JZE).trains).toHaveLength(1);
    expect(dit(l, VRN, 'EB JZE')).toBeNull();
  });
});

describe('situation du poste', () => {
  it('met un poste temporaire hors service puis en service', () => {
    const l = creerLigne();
    expect(dit(l, VRN, 'HS')).toBe(41); // sélecteur resté sur ES
    l.postes[VRN].selecteurEnService = false;
    expect(dit(l, VRN, 'HS')).toBeNull();
    expect(l.postes[VRN].enService).toBe(false);
    // Rennes et Janzé deviennent voisins.
    expect(dit(l, REN, 'AA VRN 423755')).toBe(2);
    expect(dit(l, REN, 'AA JZE 423755')).toBeNull();
    expect(dit(l, VRN, 'AA JZE 423755')).toBe(40); // poste hors service : dialogue refusé
    dit(l, JZE, 'RA REN 423755');
    dit(l, JZE, `VA REN 423755 ${il_y_a(l, 1)}`);
    dit(l, REN, 'RL JZE 423755');

    expect(dit(l, VRN, 'ES')).toBe(42); // sélecteur sur HS
    l.postes[VRN].selecteurEnService = true;
    expect(dit(l, VRN, 'ES')).toBeNull();
    expect(dit(l, REN, 'AA VRN 423755')).toBeNull();
  });

  it('refuse la cessation de service pendant une annonce ou à un poste permanent', () => {
    const l = creerLigne();
    l.postes[VRN].selecteurEnService = false;
    dit(l, REN, 'AA VRN 423755');
    expect(dit(l, VRN, 'HS')).toBe(11);
    const l2 = creerLigne();
    l2.postes[REN].selecteurEnService = false;
    expect(dit(l2, REN, 'HS')).toBe(40);
  });

  it('ouvre et ferme une période de maintenance', () => {
    const l = creerLigne();
    expect(dit(l, VRN, 'DM')).toBe(6); // bouchon absent
    l.postes[VRN].bouchon = true;
    expect(dit(l, VRN, 'DM')).toBeNull();
    expect(dit(l, REN, 'AA VRN 423755')).toBe(15);
    expect(dit(l, JZE, 'AA VRN 423756')).toBe(15);
    expect(dit(l, VRN, 'AA JZE 423755')).toBe(40);
    expect(dit(l, VRN, 'FM')).toBe(6); // bouchon encore en place
    l.postes[VRN].bouchon = false;
    expect(dit(l, VRN, 'FM')).toBeNull();
    expect(dit(l, VRN, 'FM')).toBe(36);
    expect(dit(l, REN, 'AA VRN 423755')).toBeNull();
  });

  it('refuse le début de maintenance pendant une annonce', () => {
    const l = creerLigne();
    dit(l, REN, 'AA VRN 423755');
    l.postes[VRN].bouchon = true;
    expect(dit(l, VRN, 'DM')).toBe(11);
  });
});

describe('divers', () => {
  it('ne laisse recaler l’horloge qu’au poste origine', () => {
    const l = creerLigne();
    expect(dit(l, VRN, 'MH 0900 011225')).toBe(40);
    expect(dit(l, REN, 'MH 2560 011225')).toBe(8);
    expect(dit(l, REN, 'MH 0900 321225')).toBe(9);
    expect(dit(l, REN, 'MH 0900 011225')).toBeNull();
    const h = horloge(l, REEL);
    expect([h.getFullYear(), h.getMonth(), h.getDate(), h.getHours(), h.getMinutes()]).toEqual([2025, 11, 1, 9, 0]);
  });

  it('archive les commandes et les alarmes avec l’heure du système', () => {
    const l = creerLigne();
    dit(l, VRN, 'AA JZE 423755');
    dit(l, VRN, 'AA JZE 423757');
    expect(l.archives[VRN]).toHaveLength(2);
    expect(l.archives[VRN][0]).toBe('22/10/26 10:30.00  AA JZE 423755');
    expect(l.archives[VRN][1]).toContain('ALARME 11');
  });

  it('copie les informations archivées', () => {
    const l = creerLigne();
    dit(l, VRN, 'AA JZE 423755');
    const r = executer(l, VRN, 'CT', REEL);
    expect(r.ok && r.info[0]).toContain('Exploitation');
    expect(dit(l, RTS, 'TL')).toBe(40); // test de ligne réservé à la maintenance
  });
});
