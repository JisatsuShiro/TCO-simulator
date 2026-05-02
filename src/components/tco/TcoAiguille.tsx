import type { StationItem, Tool } from '../../types/gessie';
import { useGessieStore } from '../../store/useGessieStore';

interface Props {
  item: StationItem;
  tool: Tool;
}

interface Parsed {
  /** "e" = tronc horizontal ; "nw" / "ne" = tronc oblique. */
  trunk: 'e' | 'nw' | 'ne';
  /** ±1, sens vertical (oriente la divergence haut/bas). */
  vMod: 1 | -1;
  /** ±1, sens horizontal (oriente la divergence gauche/droite). */
  hMod: 1 | -1;
  /** Branche après remap (utilisée pour computer branchName quand trunk==='e'). */
  branche: string;
}

/**
 * Parse une `shape` Gessie (ex: "e-nw", "ne-w") en {trunk, vMod, hMod}.
 *
 * Reproduction fidèle du data() de tco-aiguille (renderer.js @276023).
 *
 * Les variations possibles (champ `ui` du JSON) :
 *   - tronc horizontal : e-se, e-sw, e-ne, e-nw
 *   - tronc oblique    : ne-w, ne-e, nw-w, nw-e
 *
 * Note : la branche "i = brancheRaw.split('')" est utilisée AVANT le remap
 * dans Gessie pour calculer vMod/hMod sur les shapes "e-*".
 */
function parseShape(shape: string): Parsed | null {
  const parts = shape.split('-');
  const tronc = parts[0];
  const brancheRaw = parts[1];
  if (!tronc || !brancheRaw) return null;

  const i = brancheRaw.split('');

  // Remap pour 2 cas spécifiques (utilisé par computed.branchName, pas par vMod/hMod)
  let branche = brancheRaw;
  if (shape === 'e-ne') branche = 'nw';
  else if (shape === 'e-nw') branche = 'ne';

  if (tronc === 'w' || tronc === 'e') {
    return {
      trunk: 'e',
      vMod: (i[0] === 'n' ? -1 : 1) as 1 | -1,
      hMod: (i[1] === 'e' ? 1 : -1) as 1 | -1,
      branche,
    };
  }
  if (tronc === 'nw' || tronc === 'se') {
    return {
      trunk: 'nw',
      vMod: 1,
      hMod: (branche === 'e' ? -1 : 1) as 1 | -1,
      branche,
    };
  }
  if (tronc === 'ne' || tronc === 'sw') {
    return {
      trunk: 'ne',
      vMod: -1,
      hMod: (branche === 'e' ? -1 : 1) as 1 | -1,
      branche,
    };
  }
  return null;
}

/**
 * Calcule branchName ("G" ou "D") selon la logique Gessie computed.branchName :
 *   - trunk "nw" → G
 *   - trunk "ne" → D
 *   - trunk "e" : branche (après remap) === "nw" || "se" → D, sinon G
 */
function computeBranchName(trunk: 'e' | 'nw' | 'ne', branche: string): 'G' | 'D' {
  if (trunk === 'nw') return 'G';
  if (trunk === 'ne') return 'D';
  return branche === 'nw' || branche === 'se' ? 'D' : 'G';
}

/**
 * Hooks de sélection — un par valeur primitive pour éviter la boucle infinie
 * "getSnapshot should be cached" (Zustand compare par référence ; un sélecteur
 * qui retourne un objet littéral crée une nouvelle réf à chaque render).
 */
function useAiguillePosition(name: string): string | undefined {
  return useGessieStore((s) => {
    if (!name || !s.player.data) return undefined;
    return s.player.data.affectations['Ag' + name]?.position;
  });
}
function useAiguilleControleGauche(name: string): boolean | undefined {
  return useGessieStore((s) => {
    if (!name || !s.player.data) return undefined;
    return s.player.data.affectations['Ag' + name]?.controle?.gauche;
  });
}
function useAiguilleControleDroite(name: string): boolean | undefined {
  return useGessieStore((s) => {
    if (!name || !s.player.data) return undefined;
    return s.player.data.affectations['Ag' + name]?.controle?.droite;
  });
}
/** True si l'affectation existe (= mode play, sim chargée). */
function useAiguilleHasAffectation(name: string): boolean {
  return useGessieStore((s) => {
    if (!name || !s.player.data) return false;
    return Boolean(s.player.data.affectations['Ag' + name]);
  });
}

/**
 * Path pour aiguille à tronc horizontal ("e").
 * Reproduction du d="..." de la render fn Gessie pour `e == trunk`.
 *
 * Forme : trunk = 2 lignes horizontales parallèles (les 2 rails)
 *         branche = 2 segments diagonaux montant/descendant
 */
function pathHorizontalTrunk(vMod: number, hMod: number): string {
  return [
    `M0,${8 * vMod}`,
    `h${42 + 8 * vMod * hMod}`,
    `l${60 * vMod * hMod},${60 * vMod}`,
    `m22,0`,
    `l${-60 * vMod * hMod},${-60 * vMod}`,
    `h${36 - 8 * vMod * hMod}`,
    `m0,${-16 * vMod}`,
    `h-100`,
  ].join(' ');
}

/**
 * Path pour aiguille à tronc oblique ("nw" ou "ne").
 * Reproduction du d="..." de la render fn Gessie pour `e != trunk`.
 */
function pathObliqueTrunk(vMod: number, hMod: number): string {
  return [
    `M${50 - 50 * vMod},${-(50 + 3 * vMod) - 11 * (vMod * hMod)}`,
    `l${100 * vMod},100`,
    `M${50 - 50 * vMod},${-(50 + 3 * vMod) + 11 * (vMod * hMod)}`,
    `l${(42 + 3 * vMod - 11 * vMod * hMod) * vMod},${42 + 3 * vMod - 11 * hMod * vMod}`,
    `H${53 + 2 * vMod - 17 * hMod - 40 * hMod}`,
    `m0,16`,
    `h${hMod * (46 + 6 * (vMod * hMod))}`,
    `l${40 * vMod},40`,
  ].join(' ');
}

/**
 * Aiguille rendue procéduralement, à l'identique de Gessie.
 *
 * Différences avec l'original :
 *   - stroke blanc au lieu de noir pour le path (fond TCO foncé)
 *   - cercles de contrôle : visibles seulement en mode play (Player chargé)
 *   - pas de menu contextuel pour les dérangements
 *
 * Cercles de contrôle (cf. render fn Gessie @569560) :
 *   - Tronc + branche : un cercle chacun, rayon 6, stroke noir
 *   - Visible si l'affectation a `controle.gauche` ou `controle.droite`
 *     correspondant
 *   - Fill jaune `#FFCC00` si etat (G/D) === branchName/trunkName
 *     (= aiguille pointe vers cette voie), sinon `transparent`
 *   - Position tronc cas "e" : `(48 + 20*vMod*hMod, 0)`
 *   - Position branche cas "e" : `(73 ou 33, 20*vMod)` selon `vMod*hMod`
 *   - Position tronc cas oblique : `(50 - 10*hMod, 0)`
 *   - Position branche cas oblique : `(73, 20*vMod)` (Gessie identique
 *     pour les 4 sous-cas, possible bug)
 */
export function TcoAiguille({ item, tool }: Props) {
  // Hooks d'abord — interdit après early return (react-hooks/rules-of-hooks).
  const name = item.name ? String(item.name) : '';
  const hasAffectation = useAiguilleHasAffectation(name);
  const etat = useAiguillePosition(name);
  const ctrlGauche = useAiguilleControleGauche(name);
  const ctrlDroite = useAiguilleControleDroite(name);

  if (item.xPos == null || item.yPos == null || !item.variationId) return null;

  const variation = tool.variations[item.variationId];
  if (!variation) return null;

  const shape = variation.ui;
  const parsed = parseShape(shape);
  if (!parsed) return null;

  const d =
    parsed.trunk === 'e'
      ? pathHorizontalTrunk(parsed.vMod, parsed.hMod)
      : pathObliqueTrunk(parsed.vMod, parsed.hMod);

  // Position du label (reprise des coords Gessie)
  const labelX = parsed.trunk === 'e' ? 40 : 45 + 45 * parsed.hMod;
  const labelY =
    parsed.trunk === 'e'
      ? parsed.vMod === 1
        ? -15
        : 30
      : parsed.vMod === -1
        ? 42
        : 60;

  // ===== Cercles de contrôle (mode play uniquement) =====
  let circles: React.ReactNode = null;
  if (hasAffectation) {
    const branchName = computeBranchName(parsed.trunk, parsed.branche);
    const trunkName: 'G' | 'D' = branchName === 'G' ? 'D' : 'G';
    // etat = "G" | "D" | "g" | "d" (lower si discordance)

    const trunkControle = branchName === 'D' ? ctrlGauche : ctrlDroite;
    const branchControle = branchName === 'G' ? ctrlGauche : ctrlDroite;

    const trunkColor = etat === trunkName ? '#FFCC00' : 'transparent';
    const branchColor = etat === branchName ? '#FFCC00' : 'transparent';

    // Coords reprises de Gessie mais avec un offset plus généreux : sur notre
    // TCO agrandi le `48 ± 20` original tombait pile au centre visuel de
    // l'aiguille (path large de ~132px). On décale à `48 ± 30` (et idem pour
    // la branche) pour que les ronds se voient bien sur leur voie respective.
    const trunkCx = parsed.trunk === 'e'
      ? 48 + 40 * parsed.vMod * parsed.hMod
      : 50 - 10 * parsed.hMod;
    const trunkCy = 0;
    const branchCx = parsed.trunk === 'e'
      ? parsed.vMod * parsed.hMod === 1 ? 73 : 33
      : 73;
    const branchCy = 20 * parsed.vMod;

    circles = (
      <>
        {trunkControle && (
          <circle cx={trunkCx} cy={trunkCy} r={6} fill={trunkColor} stroke="#000000" strokeWidth={1} />
        )}
        {branchControle && (
          <circle cx={branchCx} cy={branchCy} r={6} fill={branchColor} stroke="#000000" strokeWidth={1} />
        )}
      </>
    );
  }

  return (
    <g transform={`translate(${item.xPos}, ${item.yPos})`}>
      {/* Zone de hit élargie : rect transparent qui capture les clics
          (gauche/droit) sur toute l'emprise visuelle de l'aiguille, pas
          seulement sur le stroke fin du path. */}
      <rect
        x={-15}
        y={-55}
        width={140}
        height={120}
        fill="transparent"
        pointerEvents="all"
      />
      <path
        d={d}
        fill="transparent"
        stroke="#ecf0f1"
        strokeWidth={2}
        strokeMiterlimit={10}
        pointerEvents="none"
      />
      {circles}
      {name && (
        <text
          x={labelX}
          y={labelY}
          fontSize={20}
          fill="#ecf0f1"
          fontFamily="monospace"
          textAnchor="middle"
        >
          {name}
        </text>
      )}
    </g>
  );
}
