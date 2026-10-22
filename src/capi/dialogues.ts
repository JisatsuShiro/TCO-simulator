// Exécution des dialogues CAPI (IN 0513, annexe 2).
//
// `executer` joue un dialogue saisi au poste `i` : il vérifie les conditions
// dans l'ordre des tableaux de l'annexe, renvoie l'alarme du premier critère
// non satisfait, sinon applique les effets (messages, fenêtres, symboles de
// blocage, situation des postes). Poste émetteur : C, poste désigné dans le
// dialogue : D (ou B). Les postes sont désignés par leur indice dans `LIGNE`.

import { ARCHIVE_MAX, LIGNE, ajouterMessage, cantonEntre, horloge, reconstruireCantons, voisins } from './ligne.ts';
import type { Canton, Ligne, Sens, TrainCanton } from './ligne.ts';
import { alarme } from './alarmes.ts';

export type Resultat =
  | { ok: true; info: string[] }
  | { ok: false; alarme: number };

/** Durée d'affichage des accusés de réception d'une reddition ou d'une annulation. */
const TROIS_MINUTES = 3 * 60 * 1000;

type Champ = 'poste' | 'train' | 'mv' | 'heure' | 'date' | 'refuse';

interface Syntaxe {
  champs: Champ[];
  /** Nombre de champs facultatifs en fin de dialogue (« REFUSE »). */
  facultatifs?: number;
}

const SYNTAXES: Readonly<Record<string, Syntaxe>> = {
  AA: { champs: ['poste', 'train'] },
  RA: { champs: ['poste', 'train', 'refuse'], facultatifs: 1 },
  VA: { champs: ['poste', 'train', 'heure'] },
  RL: { champs: ['poste', 'train'] },
  AM: { champs: ['poste', 'train'] },
  RM: { champs: ['poste', 'train', 'refuse'], facultatifs: 1 },
  VM: { champs: ['poste', 'train', 'heure'] },
  RN: { champs: ['poste', 'train'] },
  AO: { champs: ['poste', 'train', 'mv'] },
  RO: { champs: ['poste', 'train', 'refuse'], facultatifs: 1 },
  VO: { champs: ['poste', 'train', 'mv', 'heure'] },
  RP: { champs: ['poste', 'train', 'mv'] },
  NA: { champs: ['poste', 'train'] },
  NR: { champs: ['poste', 'train'] },
  NO: { champs: ['poste', 'train'] },
  NP: { champs: ['poste', 'train'] },
  IB: { champs: ['poste'] },
  EB: { champs: ['poste'] },
  HS: { champs: [] },
  ES: { champs: [] },
  DM: { champs: [] },
  FM: { champs: [] },
  CT: { champs: [] },
  MH: { champs: ['heure', 'date'] },
  // Dialogues du mainteneur, accessibles en période de maintenance.
  TL: { champs: [] },
  CM: { champs: [] },
};

export const CLES: ReadonlySet<string> = new Set(Object.keys(SYNTAXES));

/** Dialogues de cantonnement : inhibés dans un canton dont un poste est en maintenance. */
const CANTONNEMENT = new Set([
  'AA', 'RA', 'VA', 'RL', 'AM', 'RM', 'VM', 'RN', 'AO', 'RO', 'VO', 'RP', 'NA', 'NR', 'NO', 'NP', 'EB',
]);

const FORMES: Readonly<Record<Champ, RegExp>> = {
  poste: /^[A-Z]{3}$/,
  // Dix caractères alphanumériques, éventuellement complétés de « /O ».
  train: /^[A-Z0-9]{1,10}(\/O)?$/,
  mv: /^[A-Z0-9]{1,6}$/,
  heure: /^\d{4}$/,
  date: /^\d{6}$/,
  refuse: /^REFUSE$/,
};

interface Appel {
  cle: string;
  poste?: string;
  train?: string;
  mv?: string;
  heure?: string;
  date?: string;
  refuse: boolean;
}

/** Décompose la saisie ; `null` si la syntaxe est fausse (alarme 1). */
function analyser(saisie: string): Appel | null {
  const mots = saisie.trim().toUpperCase().split(/\s+/);
  const syntaxe = SYNTAXES[mots[0]];
  if (syntaxe == null) return null;
  const valeurs = mots.slice(1);
  const min = syntaxe.champs.length - (syntaxe.facultatifs ?? 0);
  if (valeurs.length < min || valeurs.length > syntaxe.champs.length) return null;
  const appel: Appel = { cle: mots[0], refuse: false };
  for (let k = 0; k < valeurs.length; k++) {
    const champ = syntaxe.champs[k];
    if (!FORMES[champ].test(valeurs[k])) return null;
    if (champ === 'refuse') appel.refuse = true;
    else appel[champ] = valeurs[k];
  }
  return appel;
}

const reussi = (info: string[] = []): Resultat => ({ ok: true, info });
const echec = (n: number): Resultat => ({ ok: false, alarme: n });

function pad(n: number, largeur = 2): string {
  return String(n).padStart(largeur, '0');
}

function heureValide(hhmm: string): boolean {
  return Number(hhmm.slice(0, 2)) <= 23 && Number(hhmm.slice(2)) <= 59;
}

/** Date JJMMAA valide (alarme 9 sinon). */
function dateValide(jjmmaa: string): Date | null {
  const jour = Number(jjmmaa.slice(0, 2));
  const mois = Number(jjmmaa.slice(2, 4));
  const annee = 2000 + Number(jjmmaa.slice(4));
  const d = new Date(annee, mois - 1, jour);
  return d.getFullYear() === annee && d.getMonth() === mois - 1 && d.getDate() === jour ? d : null;
}

/** L'heure d'arrivée doit précéder de moins d'une heure l'horloge (alarme 7). */
function heureArriveeValide(hhmm: string, maintenant: Date): boolean {
  if (!heureValide(hhmm)) return false;
  const arrivee = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(2));
  const courante = maintenant.getHours() * 60 + maintenant.getMinutes();
  return (courante - arrivee + 1440) % 1440 < 60;
}

/** Parité du numéro en accord avec le sens du train (alarme 3). */
function pariteCorrecte(numero: string, vers: Sens): boolean {
  if (numero.endsWith('/O')) return true;
  const chiffre = [...numero].reverse().find((c) => c >= '0' && c <= '9');
  if (chiffre == null) return false;
  const impair = Number(chiffre) % 2 === 1;
  return vers === 'droite' ? impair : !impair;
}

function code(i: number): string {
  return LIGNE[i].code;
}

/** Un poste d'une extrémité du canton, ou un poste hors service intercalé, est en maintenance. */
function enMaintenance(l: Ligne, c: Canton): boolean {
  for (let k = c.a; k <= c.b; k++) {
    if (l.postes[k].maintenance && (k === c.a || k === c.b || !l.postes[k].enService)) return true;
  }
  return false;
}

/** Cantons concernés par une cessation de service, une reprise ou une maintenance du poste `i`. */
function cantonsAutour(l: Ligne, i: number): Canton[] {
  if (l.postes[i].enService) return l.cantons.filter((c) => c.a === i || c.b === i);
  const { gauche, droite } = voisins(l, i);
  const c = gauche != null && droite != null ? cantonEntre(l, gauche, droite) : undefined;
  return c ? [c] : [];
}

/** Cantons B–D qui naîtraient de la reprise du service du poste `i` (annexe 2.20). */
function cantonDeReprise(l: Ligne, i: number): Canton[] {
  const { gauche, droite } = voisins(l, i);
  const c = gauche != null && droite != null ? cantonEntre(l, gauche, droite) : undefined;
  return c ? [c] : [];
}

/**
 * Alarme 11 / 12 : une annonce, ou un accusé de réception d'annonce, est en
 * cours dans l'un des cantons. Tout train inscrit dans un canton compte.
 */
function annonceEnCours(cantons: Canton[]): number | null {
  if (cantons.some((c) => c.trains.some((t) => t.etape === 'annonce'))) return 11;
  if (cantons.some((c) => c.trains.length > 0)) return 12;
  return null;
}

function retirer(c: Canton, t: TrainCanton): void {
  c.trains.splice(c.trains.indexOf(t), 1);
}

function texteTrain(t: TrainCanton, avecMv: boolean): string {
  const suite = t.co ? (avecMv ? ` porteur du bulletin n° ${t.mv}` : ' en canton occupé') : t.cle ? ' porteur de la clé maîtresse' : '';
  return `train n° ${t.numero}${suite}`;
}

function annoncer(de: number, a: number, c: Canton, texte: string, reelMs: number, dure = false): void {
  ajouterMessage(c, { de, a, texte: `${code(de)} à ${code(a)} - ${texte}`, expire: dure ? reelMs + TROIS_MINUTES : null });
}

/** Archive la commande (ou l'alarme) avec la date et l'heure du système. */
function archiver(l: Ligne, i: number, ligne: string, reelMs: number): void {
  const d = horloge(l, reelMs);
  const horodatage = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${pad(d.getFullYear() % 100)} ${pad(d.getHours())}:${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
  const a = l.archives[i];
  a.push(`${horodatage}  ${ligne}`);
  if (a.length > ARCHIVE_MAX) a.splice(0, a.length - ARCHIVE_MAX);
}

/**
 * Joue le dialogue `saisie` au poste `i` à l'instant réel `reelMs`.
 * L'état de la ligne n'est modifié que si le dialogue est pris en compte.
 */
export function executer(l: Ligne, i: number, saisie: string, reelMs: number): Resultat {
  const r = appliquer(l, i, saisie, reelMs);
  const cle = saisie.trim().toUpperCase();
  archiver(l, i, r.ok ? cle : `${cle}  ** ALARME ${r.alarme} ${alarme(r.alarme).libelle}`, reelMs);
  return r;
}

function appliquer(l: Ligne, i: number, saisie: string, reelMs: number): Resultat {
  const cle = saisie.trim().toUpperCase().split(/\s+/)[0];
  if (!CLES.has(cle)) return echec(6);
  const appel = analyser(saisie);
  if (appel == null) return echec(1);

  const poste = l.postes[i];
  const maintenant = horloge(l, reelMs);

  // Inhibitions propres à la situation du poste.
  const permis = poste.maintenance
    ? ['FM', 'TL', 'ES', 'CM']
    : poste.enService
      ? [...CLES].filter((k) => !['ES', 'TL', 'CM'].includes(k))
      : ['ES', 'DM', 'FM', 'CT', 'MH'];
  if (!permis.includes(cle)) return echec(40);

  switch (cle) {
    case 'HS':
      return cessation(l, i);
    case 'ES':
      return poste.maintenance ? reussi(['Entrées / sorties : toutes les entrées et sorties sont à l’état « 0 »']) : reprise(l, i);
    case 'DM':
      return debutMaintenance(l, i);
    case 'FM':
      return finMaintenance(l, i);
    case 'MH':
      return miseAHeure(l, i, appel, reelMs);
    case 'CT': {
      const n = l.archives[i].length;
      return reussi([`Copie des informations Exploitation archivées effectuée (${n} ligne${n > 1 ? 's' : ''})`]);
    }
    case 'CM': {
      const n = l.archives[i].length;
      return reussi([`Copie des informations Maintenance archivées effectuée (${n} ligne${n > 1 ? 's' : ''})`]);
    }
    case 'TL': {
      const { gauche, droite } = voisins(l, i);
      const essais = [gauche, droite].filter((j): j is number => j != null);
      return reussi(essais.map((j) => `Test de ligne avec ${code(j)} : messages émis et reçus identiques`));
    }
  }

  // Dialogues de cantonnement : le poste désigné doit être un voisin en service.
  const j = voisinDesigne(l, i, appel.poste ?? '');
  if (j == null) return echec(2);
  const canton = cantonEntre(l, i, j);
  if (canton == null) return echec(2);
  const vers: Sens = j > i ? 'droite' : 'gauche';

  if (cle === 'IB') return inscrireBlocage(canton, i);
  // La parité précède l'inhibition ; les tableaux citent l'alarme 15 plus bas,
  // mais l'inhibition d'un canton en maintenance est totale : on la teste ici
  // pour ne pas la répéter dans chaque dialogue.
  if (['AA', 'AM', 'AO'].includes(cle) && !pariteCorrecte(appel.train as string, vers)) return echec(3);
  if (CANTONNEMENT.has(cle) && enMaintenance(l, canton)) return echec(15);

  switch (cle) {
    case 'AA':
    case 'AM':
      return annonce(l, i, j, canton, appel, vers, reelMs);
    case 'AO':
      return annonceCo(l, i, j, canton, appel, reelMs);
    case 'RA':
    case 'RM':
    case 'RO':
      return accuseAnnonce(i, j, canton, appel, reelMs);
    case 'VA':
    case 'VM':
      return reddition(i, j, canton, appel, maintenant, reelMs);
    case 'VO':
      return redditionCo(i, j, canton, appel, maintenant, reelMs);
    case 'RL':
    case 'RN':
    case 'RP':
      return accuseReddition(i, j, canton, appel, reelMs);
    case 'NA':
    case 'NO':
      return annulation(i, j, canton, appel, reelMs);
    case 'NR':
    case 'NP':
      return accuseAnnulation(i, j, canton, appel, reelMs);
    case 'EB':
      return effacerBlocage(i, j, canton);
  }
  return echec(6);
}

function voisinDesigne(l: Ligne, i: number, abreviation: string): number | null {
  const { gauche, droite } = voisins(l, i);
  for (const j of [gauche, droite]) {
    if (j != null && code(j) === abreviation) return j;
  }
  return null;
}

// ---- Annonces ---------------------------------------------------------------

function annonce(
  l: Ligne,
  i: number,
  j: number,
  c: Canton,
  appel: Appel,
  vers: Sens,
  reelMs: number,
): Resultat {
  const numero = appel.train as string;
  const cle = appel.cle === 'AM';
  const enCours = annonceEnCours([c]);
  if (enCours != null) return echec(enCours);
  if (c.ib.length > 0) return echec(16);
  if (!l.postes[i].liaisonCro) return echec(43);
  const t: TrainCanton = { numero, vers, emetteur: i, cle, co: false, etape: 'annonce', clignote: true };
  c.trains.push(t);
  annoncer(i, j, c, `J’annonce ${texteTrain(t, false)}`, reelMs);
  return reussi();
}

function annonceCo(l: Ligne, i: number, j: number, c: Canton, appel: Appel, reelMs: number): Resultat {
  const numero = appel.train as string;
  const mv = appel.mv as string;
  const vers: Sens = j > i ? 'droite' : 'gauche';
  const premier = c.trains[0];
  // Un seul train, déjà annoncé et accusé par le poste voisin, expédié par ce poste.
  if (c.trains.length !== 1 || premier.etape !== 'recu' || premier.emetteur !== i || premier.co) return echec(28);
  if (c.trains.some((t) => t.emetteur === j)) return echec(11);
  if (!c.ib.includes(i)) return echec(35);
  if (c.ib.includes(j)) return echec(16);
  if (!l.postes[i].liaisonCro) return echec(43);
  const t: TrainCanton = { numero, vers, emetteur: i, cle: false, co: true, mv, etape: 'annonce', clignote: true };
  c.trains.push(t);
  annoncer(i, j, c, `J’annonce ${texteTrain(t, false)}`, reelMs);
  return reussi();
}

function accuseAnnonce(i: number, j: number, c: Canton, appel: Appel, reelMs: number): Resultat {
  const numero = appel.train as string;
  const co = appel.cle === 'RO';
  const cle = appel.cle === 'RM';
  const t = c.trains.find((x) => x.emetteur === j && x.etape === 'annonce' && x.co === co && x.cle === cle);
  if (t == null) return echec(co ? 29 : cle ? 25 : 21);
  if (t.numero !== numero) return echec(4);
  if (appel.refuse) {
    retirer(c, t);
    annoncer(i, j, c, `je refuse ${texteTrain(t, false)}`, reelMs);
    return reussi();
  }
  t.etape = 'recu';
  t.clignote = false;
  annoncer(i, j, c, `Pris note de l’annonce du ${texteTrain(t, false)}`, reelMs);
  return reussi();
}

// ---- Reddition de voie libre -------------------------------------------------

function reddition(i: number, j: number, c: Canton, appel: Appel, maintenant: Date, reelMs: number): Resultat {
  const numero = appel.train as string;
  const cle = appel.cle === 'VM';
  const t = c.trains.find((x) => x.emetteur === j && x.etape === 'recu' && !x.co && x.cle === cle);
  if (t == null) return echec(cle ? 26 : 22);
  if (t.numero !== numero) return echec(4);
  if (!heureArriveeValide(appel.heure as string, maintenant)) return echec(7);
  t.etape = 'vl';
  t.clignote = true;
  annoncer(i, j, c, `Voie libre derrière ${texteTrain(t, false)}`, reelMs);
  return reussi();
}

function redditionCo(i: number, j: number, c: Canton, appel: Appel, maintenant: Date, reelMs: number): Resultat {
  const numero = appel.train as string;
  const t = c.trains.find((x) => x.emetteur === j && x.co && x.etape === 'recu');
  if (t == null) return echec(33);
  if (t.numero !== numero) return echec(4);
  // L'accusé de la reddition derrière le premier train fait passer celui-ci en première fenêtre.
  if (c.trains[0] !== t) return echec(31);
  if (t.mv !== appel.mv) return echec(5);
  if (!heureArriveeValide(appel.heure as string, maintenant)) return echec(7);
  t.etape = 'vl';
  t.clignote = true;
  annoncer(i, j, c, `Voie libre derrière ${texteTrain(t, true)}`, reelMs);
  return reussi();
}

function accuseReddition(i: number, j: number, c: Canton, appel: Appel, reelMs: number): Resultat {
  const numero = appel.train as string;
  const co = appel.cle === 'RP';
  const cle = appel.cle === 'RN';
  const t = c.trains.find((x) => x.emetteur === i && x.etape === 'vl' && x.co === co && x.cle === cle);
  if (t == null) return echec(co ? 32 : cle ? 27 : 23);
  if (t.numero !== numero) return echec(4);
  if (co && t.mv !== appel.mv) return echec(5);
  retirer(c, t);
  annoncer(i, j, c, `Pris note de la reddition de voie libre derrière ${texteTrain(t, true)}`, reelMs, true);
  return reussi();
}

// ---- Annulations -------------------------------------------------------------

function annulation(i: number, j: number, c: Canton, appel: Appel, reelMs: number): Resultat {
  const numero = appel.train as string;
  const co = appel.cle === 'NO';
  const t = c.trains.find((x) => x.emetteur === i && x.etape === 'recu' && x.co === co);
  if (t == null) return echec(co ? 33 : 22);
  if (t.numero !== numero) return echec(4);
  // L'annulation du premier train est impossible tant qu'un train est en canton occupé.
  if (!co && c.trains.some((x) => x.co && x.emetteur === i)) return echec(13);
  t.etape = 'annulation';
  t.clignote = true;
  annoncer(i, j, c, `J’annule l’annonce du ${texteTrain(t, false)}`, reelMs);
  return reussi();
}

function accuseAnnulation(i: number, j: number, c: Canton, appel: Appel, reelMs: number): Resultat {
  const numero = appel.train as string;
  const co = appel.cle === 'NP';
  const t = c.trains.find((x) => x.emetteur === j && x.etape === 'annulation' && x.co === co);
  if (t == null) return echec(co ? 34 : 24);
  if (t.numero !== numero) return echec(4);
  retirer(c, t);
  annoncer(i, j, c, `Pris note de l’annulation de l’annonce du ${texteTrain(t, false)}`, reelMs, true);
  return reussi();
}

// ---- Blocage ------------------------------------------------------------------

function inscrireBlocage(c: Canton, i: number): Resultat {
  // Chaque poste ne peut inscrire le symbole qu'une fois par canton.
  if (c.ib.includes(i)) return echec(16);
  c.ib.push(i);
  return reussi();
}

function effacerBlocage(i: number, j: number, c: Canton): Resultat {
  if (c.trains.some((t) => t.co && t.emetteur === i)) return echec(13);
  if (c.trains.some((t) => t.co && t.emetteur === j)) return echec(14);
  if (!c.ib.includes(i)) return echec(35);
  c.ib.splice(c.ib.indexOf(i), 1);
  return reussi();
}

// ---- Situation du poste -----------------------------------------------------

function cessation(l: Ligne, i: number): Resultat {
  const poste = l.postes[i];
  if (!LIGNE[i].temporaire) return echec(40);
  const cantons = cantonsAutour(l, i);
  const enCours = annonceEnCours(cantons);
  if (enCours != null) return echec(enCours);
  if (cantons.some((c) => c.ib.length > 0)) return echec(16);
  if (cantons.some((c) => enMaintenance(l, c))) return echec(15);
  if (poste.selecteurEnService) return echec(41);
  poste.enService = false;
  reconstruireCantons(l);
  return reussi();
}

function reprise(l: Ligne, i: number): Resultat {
  const poste = l.postes[i];
  if (!LIGNE[i].temporaire) return echec(40);
  const cantons = cantonDeReprise(l, i);
  const enCours = annonceEnCours(cantons);
  if (enCours != null) return echec(enCours);
  if (cantons.some((c) => c.ib.length > 0)) return echec(16);
  if (cantons.some((c) => enMaintenance(l, c))) return echec(15);
  if (!poste.selecteurEnService) return echec(42);
  poste.enService = true;
  reconstruireCantons(l);
  return reussi();
}

function debutMaintenance(l: Ligne, i: number): Resultat {
  const poste = l.postes[i];
  if (!poste.bouchon) return echec(6);
  const enCours = annonceEnCours(cantonsAutour(l, i));
  if (enCours != null) return echec(enCours);
  poste.maintenance = true;
  return reussi();
}

function finMaintenance(l: Ligne, i: number): Resultat {
  const poste = l.postes[i];
  if (poste.bouchon) return echec(6);
  if (!poste.maintenance) return echec(36);
  poste.maintenance = false;
  return reussi();
}

function miseAHeure(l: Ligne, i: number, appel: Appel, reelMs: number): Resultat {
  const hhmm = appel.heure as string;
  if (!heureValide(hhmm)) return echec(8);
  const date = dateValide(appel.date as string);
  if (date == null) return echec(9);
  // Seul le poste origine de la ligne recale l'horloge de l'ensemble des postes.
  if (!LIGNE[i].origine) return echec(40);
  date.setHours(Number(hhmm.slice(0, 2)), Number(hhmm.slice(2)), 0, 0);
  l.decalageMs = date.getTime() - reelMs;
  return reussi();
}
