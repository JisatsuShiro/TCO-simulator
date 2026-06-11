// Constantes partagées des gares ouvertes au cantonnement multijoueur.
//
// Source de vérité côté front. Doit rester synchronisé avec la liste `GARES`
// du serveur relais (`server/index.js`).

export const GARES = ['Clelles', 'Vif', 'Monestier'] as const;
export type Gare = (typeof GARES)[number];

// Encodage gare ⇄ 1re lettre du code de partie (toutes non ambiguës).
// Sert à pré-filtrer le choix de gare côté « rejoindre » (la gare de l'hôte
// est devinée depuis le code), avant la validation autoritaire du serveur.
export const GARE_TO_LETTER: Record<Gare, string> = {
  Clelles: 'C',
  Vif: 'V',
  Monestier: 'M',
};

export const LETTER_TO_GARE: Record<string, Gare> = {
  C: 'Clelles',
  V: 'Vif',
  M: 'Monestier',
};

// Nom du dossier station (src/data/stations/<name>/) correspondant à chaque
// gare — utilisé pour charger la bonne gare quand l'opérateur entre en poste.
export const GARE_TO_STATION: Record<Gare, string> = {
  Clelles: 'clelles',
  Vif: 'vif',
  Monestier: 'monestier',
};

export function isGare(v: unknown): v is Gare {
  return typeof v === 'string' && (GARES as readonly string[]).includes(v);
}
