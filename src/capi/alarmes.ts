// Alarmes du système (IN 0513, annexe 3).
//
// Niveau 1 (blanc) : le dialogue peut être corrigé avant l'acquittement.
// Niveau 2 (jaune) : le dialogue de la zone E1 est perdu à l'acquittement.
// Niveau 3 (rouge) : bloque le système jusqu'à l'acquittement (défauts matériels,
// non simulés ici).
//
// Les niveaux des alarmes 1 à 8 sont lus dans la colonne « niveau » de l'annexe
// du PDF, dont la mise en page est décalée : à relire sur l'original.

export type NiveauAlarme = 1 | 2 | 3;

export interface Alarme {
  niveau: NiveauAlarme;
  libelle: string;
}

export const ALARMES: Readonly<Record<number, Alarme>> = {
  1: { niveau: 2, libelle: 'erreur de syntaxe' },
  2: { niveau: 1, libelle: 'erreur code TR 3 A' },
  3: { niveau: 1, libelle: 'erreur parité numéro de train' },
  4: { niveau: 2, libelle: 'erreur numéro de train' },
  5: { niveau: 2, libelle: 'erreur numéro de bulletin MV' },
  6: { niveau: 1, libelle: 'erreur clé' },
  7: { niveau: 2, libelle: 'erreur heure d’arrivée' },
  8: { niveau: 2, libelle: 'erreur heure' },
  9: { niveau: 2, libelle: 'erreur date' },
  11: { niveau: 2, libelle: 'annonce en cours' },
  12: { niveau: 2, libelle: 'accusé de réception annonce en cours' },
  13: { niveau: 2, libelle: 'annonce en canton occupé en cours' },
  14: { niveau: 2, libelle: 'accusé de réception annonce en canton occupé en cours' },
  15: { niveau: 2, libelle: 'maintenance en cours' },
  16: { niveau: 2, libelle: 'blocage en cours' },
  17: { niveau: 2, libelle: 'Dialogue non abouti' },
  21: { niveau: 2, libelle: 'absence annonce' },
  22: { niveau: 2, libelle: 'absence accusé de réception annonce' },
  23: { niveau: 2, libelle: 'absence reddition voie libre' },
  24: { niveau: 2, libelle: 'absence annulation annonce' },
  25: { niveau: 2, libelle: 'absence annonce clé maîtresse' },
  26: { niveau: 2, libelle: 'absence accusé de réception annonce clé maîtresse' },
  27: { niveau: 2, libelle: 'absence reddition voie libre clé maîtresse' },
  28: { niveau: 2, libelle: 'absence annonce en cours' },
  29: { niveau: 2, libelle: 'absence annonce en canton occupé' },
  31: { niveau: 2, libelle: 'absence accusé de réception reddition voie libre' },
  32: { niveau: 2, libelle: 'absence reddition voie libre train en canton occupé' },
  33: { niveau: 2, libelle: 'absence accusé de réception annonce en canton occupé' },
  34: { niveau: 2, libelle: 'absence annulation annonce en canton occupé' },
  35: { niveau: 2, libelle: 'absence blocage' },
  36: { niveau: 2, libelle: 'absence maintenance' },
  39: { niveau: 2, libelle: 'écriture impossible' },
  40: { niveau: 2, libelle: 'dialogue refusé' },
  41: { niveau: 2, libelle: 'commutateur ES / HS « en service »' },
  42: { niveau: 2, libelle: 'commutateur ES / HS « hors service »' },
  43: { niveau: 2, libelle: 'Liaison CAPI/CRO hors service' },
  44: { niveau: 2, libelle: 'Imprimante hors service' },
};

export function alarme(n: number): Alarme {
  return ALARMES[n] ?? { niveau: 2, libelle: 'alarme inconnue' };
}
