// Poste de travail d'un opérateur CAPI : curseur dans la barre des menus, dialogue
// en cours de frappe, alarmes affichées (IN 0513, articles 3, 5 et 7).
//
// `toucher` interprète une touche du clavier ; il ne connaît pas React. L'écran
// ne fait que relire la session et la ligne.

import { alarme } from './alarmes';
import { CLES } from './dialogues';
import type { Resultat } from './dialogues';
import { horloge } from './ligne';
import type { Ligne } from './ligne';
import { MENUS_MAINTENANCE, MENUS_SERVICE } from './menus';

export interface AlarmeAffichee {
  n: number;
  niveau: 1 | 2 | 3;
  libelle: string;
  heure: string;
  /** Le dialogue de la zone E1 est perdu à l'acquittement. */
  perte: boolean;
}

export interface Session {
  menu: number;
  /** Menu déroulant ouvert sous la barre. */
  ouvert: boolean;
  item: number;
  saisie: string;
  /** Instant réel (ms) de la première frappe : la validation doit suivre de moins de 60 s. */
  debut: number | null;
  /** Clé erronée : l'alarme 6 s'oppose à la saisie de la suite. */
  cleErronee: boolean;
  /** Alarme de niveau 2 en attente : le dialogue ne peut plus être modifié. */
  bloque: boolean;
  precedent: string;
  info: string[];
  vue: 'etat' | null;
  /** La plus récente en tête. */
  alarmes: AlarmeAffichee[];
  /** Indice de l'alarme sélectionnée, acquittée par F6. */
  sel: number;
  /** Dialogue envoyé au serveur, réponse attendue : le clavier est suspendu. */
  attente: boolean;
}

/** Ce que la session demande à l'extérieur : jouer un dialogue, redessiner l'écran. */
export interface Contexte {
  jouer: (saisie: string) => Promise<Resultat>;
  rafraichir: () => void;
}

/** Alarmes mémorisées au-delà des six affichées (article 7). */
const ALARMES_MAX = 16;
const DELAI_VALIDATION_MS = 60_000;

export function nouvelleSession(): Session {
  return {
    menu: 0,
    ouvert: false,
    item: 0,
    saisie: '',
    debut: null,
    cleErronee: false,
    bloque: false,
    precedent: '',
    info: [],
    vue: null,
    alarmes: [],
    sel: 0,
    attente: false,
  };
}

export function menusDuPoste(l: Ligne, i: number) {
  return l.postes[i].maintenance ? MENUS_MAINTENANCE : MENUS_SERVICE;
}

function abandonner(s: Session): void {
  s.saisie = '';
  s.debut = null;
  s.cleErronee = false;
  s.bloque = false;
}

function lever(l: Ligne, s: Session, n: number, perte: boolean, reelMs: number): void {
  const a = alarme(n);
  const d = horloge(l, reelMs);
  const p = (x: number) => String(x).padStart(2, '0');
  s.alarmes.unshift({
    n,
    niveau: a.niveau,
    libelle: a.libelle,
    heure: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
    perte,
  });
  s.alarmes.splice(ALARMES_MAX);
  s.sel = 0;
  if (perte) s.bloque = true;
}

function acquitter(s: Session): void {
  const [a] = s.alarmes.splice(s.sel, 1);
  if (a?.perte) abandonner(s);
  s.sel = Math.min(s.sel, Math.max(0, s.alarmes.length - 1));
}

function valider(l: Ligne, i: number, s: Session, reelMs: number, ctx: Contexte): void {
  if (s.debut != null && reelMs - s.debut > DELAI_VALIDATION_MS) {
    lever(l, s, 17, true, reelMs);
    return;
  }
  const saisie = s.saisie;
  s.attente = true;
  void ctx.jouer(saisie).then((r) => {
    s.attente = false;
    if (!r.ok) {
      lever(l, s, r.alarme, alarme(r.alarme).niveau >= 2, reelMs);
    } else {
      s.precedent = saisie.trim().toUpperCase();
      s.info = r.info;
      s.vue = null;
      abandonner(s);
      // La barre des menus change quand le poste entre en maintenance ou en sort.
      if (s.menu >= menusDuPoste(l, i).length || s.precedent === 'DM' || s.precedent === 'FM') s.menu = 0;
    }
    ctx.rafraichir();
  });
}

function choisir(l: Ligne, i: number, s: Session, reelMs: number): void {
  const item = menusDuPoste(l, i)[s.menu].items[s.item];
  s.ouvert = false;
  if (item.vue) {
    s.vue = item.vue;
    return;
  }
  s.saisie = item.aide.includes('∇') ? `${item.cle} ` : item.cle;
  s.debut = reelMs;
  s.cleErronee = false;
}

/** Interprète une touche ; renvoie vrai si elle a été prise en compte. */
export function toucher(
  l: Ligne,
  i: number,
  s: Session,
  touche: string,
  reelMs: number,
  ctx: Contexte,
): boolean {
  if (s.attente) return true;
  const menus = menusDuPoste(l, i);
  if (s.menu >= menus.length) s.menu = 0;

  switch (touche) {
    case 'F6':
      acquitter(s);
      return true;
    case 'F7':
    case 'F10':
      return true;
    case 'PageUp':
      s.sel = Math.max(0, s.sel - 1);
      return true;
    case 'PageDown':
      s.sel = Math.min(Math.max(0, s.alarmes.length - 1), s.sel + 1);
      return true;
    case 'Escape':
      if (s.vue) s.vue = null;
      else if (s.ouvert) s.ouvert = false;
      else abandonner(s);
      return true;
  }

  // Dialogue en cours de frappe.
  if (s.saisie.length > 0) {
    if (touche === 'Enter') {
      valider(l, i, s, reelMs, ctx);
      return true;
    }
    if (touche === 'Backspace') {
      if (!s.bloque) {
        s.saisie = s.saisie.slice(0, -1);
        s.cleErronee = false;
        if (s.saisie.length === 0) s.debut = null;
      }
      return true;
    }
    if (touche.length === 1) {
      const c = touche.toUpperCase();
      if (s.bloque || s.cleErronee || !/^[A-Z0-9 /]$/.test(c)) return true;
      if (c === ' ' && s.saisie.endsWith(' ')) return true;
      s.saisie += c;
      if (s.saisie.length === 2 && !CLES.has(s.saisie)) {
        s.cleErronee = true;
        lever(l, s, 6, false, reelMs);
      }
      return true;
    }
    return false;
  }

  // Aucun dialogue : le curseur parcourt les menus, dont la liste des clés se
  // déroule dès que le curseur s'y trouve.
  const deplacer = (pas: number) => {
    s.menu = Math.min(menus.length - 1, Math.max(0, s.menu + pas));
    s.item = 0;
    s.vue = null;
    s.ouvert = true;
  };
  switch (touche) {
    case 'ArrowLeft':
      deplacer(-1);
      return true;
    case 'ArrowRight':
      deplacer(1);
      return true;
    case 'ArrowUp':
    case 'ArrowDown': {
      const pas = touche === 'ArrowDown' ? 1 : -1;
      if (s.ouvert) {
        s.item = Math.min(menus[s.menu].items.length - 1, Math.max(0, s.item + pas));
      } else {
        s.ouvert = true;
        s.item = 0;
        s.vue = null;
      }
      return true;
    }
    case 'Enter':
      if (s.ouvert) choisir(l, i, s, reelMs);
      else {
        s.ouvert = true;
        s.item = 0;
        s.vue = null;
      }
      return true;
  }
  if (touche.length === 1 && /^[a-zA-Z]$/.test(touche)) {
    s.saisie = touche.toUpperCase();
    s.debut = reelMs;
    s.ouvert = false;
    return true;
  }
  return false;
}
