// Barre des menus CAPI et listes de dialogues (IN 0513, article 5.1).

export interface ItemMenu {
  cle: string;
  libelle: string;
  /** Ligne d'aide à la saisie, « ∇ » figurant l'espace. */
  aide: string;
  /** Vue plutôt que dialogue (menu « Etat-ligne » de la maintenance). */
  vue?: 'etat';
}

export interface Menu {
  nom: string;
  items: ItemMenu[];
}

export const MENUS_SERVICE: readonly Menu[] = [
  {
    nom: 'Opérations_normales',
    items: [
      { cle: 'AA', libelle: 'annonce', aide: 'AA ∇ poste ∇ n° train' },
      { cle: 'RA', libelle: 'accusé de réception annonce', aide: 'RA ∇ poste ∇ n° train [∇ REFUSE]' },
      { cle: 'VA', libelle: 'reddition voie libre', aide: 'VA ∇ poste ∇ n° train ∇ heure d’arrivée (hhmm)' },
      { cle: 'RL', libelle: 'accusé de réception voie libre', aide: 'RL ∇ poste ∇ n° train' },
    ],
  },
  {
    nom: 'Cle_Maitresse',
    items: [
      { cle: 'AM', libelle: 'annonce M', aide: 'AM ∇ poste ∇ n° train' },
      { cle: 'RM', libelle: 'accusé réception annonce M', aide: 'RM ∇ poste ∇ n° train [∇ REFUSE]' },
      { cle: 'VM', libelle: 'reddition voie libre M', aide: 'VM ∇ poste ∇ n° train ∇ heure d’arrivée (hhmm)' },
      { cle: 'RN', libelle: 'accusé réception voie libre M', aide: 'RN ∇ poste ∇ n° train' },
    ],
  },
  {
    nom: 'Canton_Occupe',
    items: [
      { cle: 'AO', libelle: 'annonce CO', aide: 'AO ∇ poste ∇ n° train ∇ n° bulletin MV' },
      { cle: 'RO', libelle: 'accusé réception annonce CO', aide: 'RO ∇ poste ∇ n° train [∇ REFUSE]' },
      { cle: 'VO', libelle: 'reddition voie libre CO', aide: 'VO ∇ poste ∇ n° train ∇ n° bulletin MV ∇ heure (hhmm)' },
      { cle: 'RP', libelle: 'accusé réception voie libre CO', aide: 'RP ∇ poste ∇ n° train ∇ n° bulletin MV' },
    ],
  },
  {
    nom: 'Annulations',
    items: [
      { cle: 'NA', libelle: 'annulation annonce', aide: 'NA ∇ poste ∇ n° train' },
      { cle: 'NR', libelle: 'accusé réception annul. annonce', aide: 'NR ∇ poste ∇ n° train' },
      { cle: 'NO', libelle: 'annulation annonce CO', aide: 'NO ∇ poste ∇ n° train' },
      { cle: 'NP', libelle: 'accusé réception annul. an. CO', aide: 'NP ∇ poste ∇ n° train' },
    ],
  },
  {
    nom: 'Situations',
    items: [
      { cle: 'IB', libelle: 'inscription blocage canton', aide: 'IB ∇ poste' },
      { cle: 'EB', libelle: 'effacement blocage canton', aide: 'EB ∇ poste' },
      { cle: 'HS', libelle: 'poste temporaire hors service', aide: 'HS' },
      { cle: 'ES', libelle: 'poste temporaire en service', aide: 'ES' },
    ],
  },
  {
    nom: 'Divers',
    items: [
      { cle: 'DM', libelle: 'début de maintenance', aide: 'DM' },
      { cle: 'MH', libelle: 'mise à l’heure', aide: 'MH ∇ heure (hhmm) ∇ date (jjmmaa)' },
      { cle: 'CT', libelle: 'collecte informations transport', aide: 'CT' },
    ],
  },
];

/** Barre des menus de la vue « poste en maintenance » (annexe 1.4). */
export const MENUS_MAINTENANCE: readonly Menu[] = [
  { nom: 'Etat-ligne', items: [{ cle: '', libelle: 'état de la ligne', aide: '', vue: 'etat' }] },
  { nom: 'Test-ligne', items: [{ cle: 'TL', libelle: 'test ligne', aide: 'TL' }] },
  { nom: 'IO->Entrées-sorties', items: [{ cle: 'ES', libelle: 'entrées / sorties', aide: 'ES' }] },
  { nom: 'Desarchivage', items: [{ cle: 'CM', libelle: 'collecte informations maintenance', aide: 'CM' }] },
  { nom: 'Fin-maintenance', items: [{ cle: 'FM', libelle: 'fin de maintenance', aide: 'FM' }] },
];

/** Ligne d'aide à la saisie pour la clé en cours de frappe. */
export function aideDeCle(cle: string): string {
  for (const menu of [...MENUS_SERVICE, ...MENUS_MAINTENANCE]) {
    const item = menu.items.find((it) => it.cle === cle);
    if (item) return item.aide;
  }
  return '';
}
