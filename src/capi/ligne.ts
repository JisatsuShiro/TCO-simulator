// État d'une ligne à voie unique équipée de CAPI 95 (IN 0513).
//
// Un seul objet `Ligne` porte tous les postes : chacun voit la même réalité
// depuis son bout de ligne, comme le système réel dont les postes dialoguent
// entre eux. L'écran d'un poste n'est qu'une lecture de cet état.

export type Sens = 'gauche' | 'droite';

export interface PosteDef {
  /** Code à trois lettres de la NG TR3A n° 2 (celui de Rennes reste à confirmer). */
  code: string;
  nom: string;
  /** Un poste temporaire peut cesser le cantonnement (dialogues HS / ES). */
  temporaire: boolean;
  /** Poste origine de la ligne : seul à pouvoir émettre la mise à l'heure (MH). */
  origine: boolean;
}

/**
 * Les postes de la ligne, de gauche à droite à l'écran.
 *
 * Rennes est à gauche (à l'est de la ligne), Châteaubriant à droite. Les
 * circulations qui vont vers la droite sont de sens impair, les autres de sens
 * pair (voir `sensDeParite`).
 */
export const LIGNE: readonly PosteDef[] = [
  { code: 'REN', nom: 'Rennes', temporaire: false, origine: true },
  { code: 'VRN', nom: 'Vern', temporaire: true, origine: false },
  { code: 'JZE', nom: 'Janzé', temporaire: true, origine: false },
  { code: 'RTS', nom: 'Retiers', temporaire: true, origine: false },
  { code: 'CTB', nom: 'Châteaubriant', temporaire: false, origine: false },
];

export interface PosteEtat {
  /** Situation « en service » (vrai) ou « cessation de service » (faux). */
  enService: boolean;
  /** Position du sélecteur de régime gare : vrai = ES, faux = HS. */
  selecteurEnService: boolean;
  /** Commutateur LIAISON CAPI / CRO : vrai = MARCHE. */
  liaisonCro: boolean;
  /** Bouchon de maintenance sur la sortie imprimante. */
  bouchon: boolean;
  /** Période de maintenance ouverte (dialogue DM pris en compte). */
  maintenance: boolean;
}

export type EtapeTrain = 'annonce' | 'recu' | 'vl' | 'annulation';

/** Un train inscrit dans l'une des deux fenêtres d'un canton. */
export interface TrainCanton {
  numero: string;
  /** Côté du poste vers lequel le train se dirige. */
  vers: Sens;
  /** Indice du poste qui a annoncé le train. */
  emetteur: number;
  /** Porteur de la clé maîtresse (affiché suivi de « + »). */
  cle: boolean;
  /** Expédié en canton occupé (clé AO). */
  co: boolean;
  /** Bulletin MV du train expédié en canton occupé. */
  mv?: string;
  /**
   * Avancement : annoncé, annonce reçue (DAAT annulé), voie libre rendue,
   * annulation annoncée. Le numéro clignote tant que l'accusé de réception de
   * l'étape en cours n'est pas pris en compte.
   */
  etape: EtapeTrain;
  clignote: boolean;
}

export interface Message {
  de: number;
  a: number;
  texte: string;
  /** Horloge réelle (ms) à laquelle le message s'efface, `null` s'il reste. */
  expire: number | null;
}

/** Intervalle entre deux postes en service voisins. `a` est à gauche de `b`. */
export interface Canton {
  a: number;
  b: number;
  /** Au plus deux trains : le premier en première fenêtre, le second en seconde. */
  trains: TrainCanton[];
  /** Postes ayant inscrit le symbole de blocage (IB). */
  ib: number[];
  messages: Message[];
}

export interface Ligne {
  postes: PosteEtat[];
  cantons: Canton[];
  /** Écart entre l'horloge du système et l'horloge réelle (mise à l'heure MH). */
  decalageMs: number;
  /** Informations archivées par poste (7000 lignes au plus). */
  archives: string[][];
}

export const ARCHIVE_MAX = 7000;
const MESSAGES_MAX = 4;

export function creerLigne(): Ligne {
  const l: Ligne = {
    postes: LIGNE.map(() => ({
      enService: true,
      selecteurEnService: true,
      liaisonCro: true,
      bouchon: false,
      maintenance: false,
    })),
    cantons: [],
    decalageMs: 0,
    archives: LIGNE.map(() => []),
  };
  reconstruireCantons(l);
  return l;
}

/**
 * Ligne d'une partie en ligne : seuls Rennes et Châteaubriant sont en service
 * (ils le sont toujours). Un poste temporaire n'existe dans CAPI que s'il est
 * tenu par un opérateur, et reprend alors le service par le dialogue ES.
 */
export function creerLigneDeSession(): Ligne {
  const l = creerLigne();
  LIGNE.forEach((def, i) => {
    if (!def.temporaire) return;
    l.postes[i].enService = false;
    l.postes[i].selecteurEnService = false;
  });
  reconstruireCantons(l);
  return l;
}

/** Remet un poste quitté par son opérateur dans l'état d'un poste absent. */
export function liberer(l: Ligne, i: number): void {
  const p = l.postes[i];
  p.maintenance = false;
  p.bouchon = false;
  if (LIGNE[i].temporaire) {
    p.enService = false;
    p.selecteurEnService = false;
    reconstruireCantons(l);
  }
}

/** Postes en service les plus proches de `i`, de part et d'autre. */
export function voisins(l: Ligne, i: number): { gauche: number | null; droite: number | null } {
  let gauche: number | null = null;
  for (let j = i - 1; j >= 0; j--) {
    if (l.postes[j].enService) {
      gauche = j;
      break;
    }
  }
  let droite: number | null = null;
  for (let j = i + 1; j < l.postes.length; j++) {
    if (l.postes[j].enService) {
      droite = j;
      break;
    }
  }
  return { gauche, droite };
}

/**
 * Remet les cantons en cohérence avec les postes en service : ceux dont les
 * deux extrémités sont toujours voisines survivent, les autres disparaissent,
 * et les nouveaux naissent vides (les dialogues HS et ES exigent un canton net).
 */
export function reconstruireCantons(l: Ligne): void {
  const enService = l.postes.map((_, i) => i).filter((i) => l.postes[i].enService);
  const voulus: Array<[number, number]> = [];
  for (let k = 0; k + 1 < enService.length; k++) voulus.push([enService[k], enService[k + 1]]);
  l.cantons = voulus.map(
    ([a, b]) =>
      l.cantons.find((c) => c.a === a && c.b === b) ?? {
        a,
        b,
        trains: [],
        ib: [],
        messages: [],
      },
  );
}

export function cantonEntre(l: Ligne, i: number, j: number): Canton | undefined {
  const a = Math.min(i, j);
  const b = Math.max(i, j);
  return l.cantons.find((c) => c.a === a && c.b === b);
}

/** Heure du système à l'instant réel `reelMs`. */
export function horloge(l: Ligne, reelMs: number): Date {
  return new Date(reelMs + l.decalageMs);
}

export function ajouterMessage(c: Canton, m: Message): void {
  c.messages.push(m);
  if (c.messages.length > MESSAGES_MAX) c.messages.splice(0, c.messages.length - MESSAGES_MAX);
}

/** Messages encore affichés à l'instant réel `reelMs`. */
export function messagesVisibles(c: Canton, reelMs: number): Message[] {
  return c.messages.filter((m) => m.expire == null || m.expire > reelMs);
}

/**
 * Poste encadrant en maintenance du côté `cote` de `i` : le poste en service
 * voisin ou un poste hors service intercalé, le plus proche d'abord, quelle que
 * soit sa situation (article 3, zones E5 et E6).
 */
export function maintenanceProche(l: Ligne, i: number, cote: Sens): number | null {
  const voisin = voisins(l, i)[cote];
  if (voisin == null) return null;
  const pas = cote === 'gauche' ? -1 : 1;
  for (let j = i + pas; ; j += pas) {
    if (l.postes[j].maintenance) return j;
    if (j === voisin) return null;
  }
}

/**
 * Sens de circulation d'un numéro de train : les numéros impairs vont vers la
 * droite de l'écran, les pairs vers la gauche. Le suffixe « /O » signale un
 * numéro dont la parité n'est pas celle du sens (article 5.2) : on ne conclut
 * alors rien.
 */
export function sensDeParite(numero: string): Sens | null {
  if (numero.endsWith('/O')) return null;
  const chiffre = [...numero].reverse().find((c) => c >= '0' && c <= '9');
  if (chiffre == null) return null;
  return Number(chiffre) % 2 === 1 ? 'droite' : 'gauche';
}
