// Badges des dispositifs d'attention — un badge coloré par type (DA / DSA /
// DR) présent sur une cible (levier ou bloc), avec le NOMBRE d'exemplaires
// inscrit dedans. La couleur identifie le type ; le titre (tooltip) donne le
// libellé complet. Partagé entre LeversPanel et BlocsPanel pour un rendu
// homogène.

import { colors, radii, typography } from '../../design/tokens';

// Couleurs alignées sur les manchons colorés des têtes de manche
// (cf. DISPOSITIF_KNOB_COLORS dans LeversPanel). `fg` = couleur du texte,
// choisie pour contraster avec le fond.
const DISPOSITIF_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  DA: { bg: colors.signal.rouge, fg: '#fff', label: "Dispositif d'attention" },
  DSA: { bg: colors.accent.primary, fg: '#fff', label: "Dispositif spécial d'attention" },
  DR: { bg: colors.signal.jaune, fg: colors.surface.darkest, label: 'Dispositif de rappel' },
};

// Ordre canonique d'affichage, indépendant de l'ordre d'ajout.
const DISPOSITIF_ORDER = ['DA', 'DSA', 'DR'] as const;

/** Compte les occurrences de chaque dispositif dans la liste (doublons inclus). */
function countByType(dispositifs: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const d of dispositifs) counts.set(d, (counts.get(d) ?? 0) + 1);
  return counts;
}

interface Props {
  /** Liste brute des dispositifs posés (peut contenir des doublons). */
  dispositifs: string[];
  /** Empile les badges verticalement (cas du levier, peu large). */
  vertical?: boolean;
}

export function DispositifBadges({ dispositifs, vertical = false }: Props) {
  if (dispositifs.length === 0) return null;
  const counts = countByType(dispositifs);

  return (
    <span
      style={{
        display: 'inline-flex',
        flexDirection: vertical ? 'column' : 'row',
        gap: 3,
        // En ligne : pousse les badges à droite quand ils suivent un autre
        // contenu (cas du bloc). En colonne : pas d'effet.
        marginLeft: vertical ? 0 : 'auto',
      }}
    >
      {DISPOSITIF_ORDER.filter((d) => counts.has(d)).map((d) => {
        const n = counts.get(d) ?? 0;
        const style = DISPOSITIF_STYLE[d];
        return (
          <span
            key={d}
            title={`${style.label} (${d}) ×${n}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              fontFamily: typography.mono.family,
              fontSize: 11,
              fontWeight: typography.weight.bold,
              lineHeight: 1,
              color: style.fg,
              background: style.bg,
              borderRadius: radii.sm,
            }}
          >
            {n}
          </span>
        );
      })}
    </span>
  );
}
