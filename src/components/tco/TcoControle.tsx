import type { StationItem, Tool } from '../../types/gessie';
import { useGessieStore } from '../../store/useGessieStore';

interface Props {
  item: StationItem;
  tool: Tool;
}

/**
 * Position courante de l'affectation dans le Player store ("F"|"O"|...) ou
 * null si pas de Player chargé (mode edit). Pour un contrôle, l'ID
 * d'affectation = item.name.
 */
function useAffectationPosition(affId: string | null): string | null {
  return useGessieStore((s) => {
    if (!affId || !s.player.data) return null;
    return s.player.data.affectations[affId]?.position ?? null;
  });
}

/**
 * État composite EAP/EPA/FA/proxi encodé en CSV pour rester scalaire au
 * sens Zustand (évite la boucle "getSnapshot should be cached").
 *
 * Format : "fa|hasEap|eap|zap|hasEpa|epa|hasProxi|proxiPressed|double"
 *           (flags 0/1, séparés par '|')
 *
 * Cf. tco-controle data/computed (renderer.js @281000) :
 *   - fa            : !!affectation.fa
 *   - eap.eap/zap   : affectation.eap?.eap, affectation.eap?.zap
 *   - epa.epa       : affectation.epa?.epa
 *   - proxi         : !!affectation.pedales.Proxi
 *   - proxiPressed  : pedale.pressed && !disturbance NON_LIBERATION_EP
 *   - double        : affectation.controle?.double_zap_eap_epa
 */
function useControleVisualState(affId: string | null): string {
  return useGessieStore((s) => {
    if (!affId || !s.player.data) return '';
    const a = s.player.data.affectations[affId];
    if (!a) return '';
    const proxiPedale = a.pedales?.Proxi;
    const proxiBlocked = a.disturbances.indexOf('NON_LIBERATION_EP') !== -1;
    return [
      a.fa ? '1' : '0',
      a.eap ? '1' : '0',
      a.eap?.eap ? '1' : '0',
      a.eap?.zap ? '1' : '0',
      a.epa ? '1' : '0',
      a.epa?.epa ? '1' : '0',
      proxiPedale ? '1' : '0',
      proxiPedale?.pressed && !proxiBlocked ? '1' : '0',
      a.controle?.double_zap_eap_epa ? '1' : '0',
    ].join('|');
  });
}

interface VisualState {
  fa: boolean;
  hasEap: boolean;
  eapEap: boolean;
  eapZap: boolean;
  hasEpa: boolean;
  epaEpa: boolean;
  hasProxi: boolean;
  proxiPressed: boolean;
  double: boolean;
}

function decodeVisualState(csv: string): VisualState {
  const [fa, hasEap, eapEap, eapZap, hasEpa, epaEpa, hasProxi, proxiPressed, double_] = csv.split('|');
  return {
    fa: fa === '1',
    hasEap: hasEap === '1',
    eapEap: eapEap === '1',
    eapZap: eapZap === '1',
    hasEpa: hasEpa === '1',
    epaEpa: epaEpa === '1',
    hasProxi: hasProxi === '1',
    proxiPressed: proxiPressed === '1',
    double: double_ === '1',
  };
}

/**
 * Contrôle : boîte rectangulaire arrondie (ou ovale pour les "D")
 * placée AU-DESSUS ou EN-DESSOUS de la voie, raccordée au rail par
 * un petit "tail" vertical.
 *
 * Reproduction fidèle de tco-controle (renderer.js @616667 + data() @281149).
 *
 * Defaults Gessie (data() @281149) : r=7, h=14, w=20.
 *
 * variationId → position :
 *   - "top"      → "up"        (boîte au-dessus, tail descend vers la voie)
 *   - "bottom"   → "down"      (boîte en-dessous, tail monte vers la voie)
 *   - "hidden"   → invisible   (pas de rendu hors mode édition)
 *   - "sam"      → image (mode play uniquement, ici skippé)
 *   - "tiv-up"   → indicateur TIV au-dessus (rendu 'O' minimal)
 *   - "tiv-down" → indicateur TIV en-dessous (rendu 'O' minimal)
 *
 * Couleurs : fond blanc, contour noir, comme dans Gessie. Le texte du
 * nom est en blanc pour rester lisible sur le fond TCO foncé.
 *
 * État live câblé :
 *  - `position` : rond rouge si 'F', rond jaune si `ouverture && 'O'`.
 *  - `fa`       : cercle vide + label "FA" (côté correspondant à position).
 *  - `proxi`    : petit cercle (jaune si `pedales.Proxi.pressed && !disturb`)
 *                 + label "EP".
 *  - `eap` / `epa` (mode `controle.double_zap_eap_epa` uniquement) :
 *                 paire de cercles bicolores (rouge actif / jaune repos)
 *                 + labels "EAp" / "ZAp" / "EPa".
 *
 * Mode simple (sans `double_zap_eap_epa`) pour EAP : pas porté — Gessie
 * utilise un sous-composant `tco-signal` avec props label/etat dédiées.
 */

// Defaults Gessie : r=7, h=14, w=20. Agrandis (~×1.4) pour lisibilité TCO web.
const R = 10;
const H = 20;
const W = 28;

function pathUp(isD: boolean, ouverture: boolean): string {
  if (isD) {
    // Boîte ovale : seuls les coins arrondis (pas d'allongement horizontal)
    return (
      `M3,-30 ` +
      `m0,${R} ` +
      `a${R},${R} 0 0 1 ${R},${-R} ` +
      `a${R},${R} 0 0 1 ${R},${R} ` +
      `v${H - 2 * R} ` +
      `a${R},${R} 0 0 1 ${-R},${R} ` +
      `a${R},${R} 0 0 1 ${-R},${-R} ` +
      `z ` +
      `M-2,-30 ` +
      `m5,${H / 2} ` +
      `h-5 ` +
      `v${9 + H / 2}`
    );
  }
  const ext = ouverture ? 12 : 0;
  return (
    `M0,-30 ` +
    `m0,${R} ` +
    `a${R},${R} 0 0 1 ${R},${-R} ` +
    `h${W + ext - 2 * R} ` +
    `a${R},${R} 0 0 1 ${R},${R} ` +
    `v${H - 2 * R} ` +
    `a${R},${R} 0 0 1 ${-R},${R} ` +
    `h${-(W + ext) + 2 * R} ` +
    `a${R},${R} 0 0 1 ${-R},${-R} ` +
    `z ` +
    `M-5,-30 ` +
    `m5,${H / 2} ` +
    `h-5 ` +
    `v${9 + H / 2}`
  );
}

function pathDown(isD: boolean, ouverture: boolean): string {
  const off = ouverture ? -12 : 0;
  if (isD) {
    return (
      `M-22,12 ` +
      `m${off},${R} ` +
      `a${R},${R} 0 0 1 ${R},${-R} ` +
      `a${R},${R} 0 0 1 ${R},${R} ` +
      `v${H - 2 * R} ` +
      `a${R},${R} 0 0 1 ${-R},${R} ` +
      `a${R},${R} 0 0 1 ${-R},${-R} ` +
      `z ` +
      `M-33,10 ` +
      `m${W + 4},${2 + H / 2} ` +
      `h5 ` +
      `v-${4 + H / 2}`
    );
  }
  const ext = ouverture ? 12 : 0;
  return (
    `M-25,12 ` +
    `m${off},${R} ` +
    `a${R},${R} 0 0 1 ${R},${-R} ` +
    `h${W + ext - 2 * R} ` +
    `a${R},${R} 0 0 1 ${R},${R} ` +
    `v${H - 2 * R} ` +
    `a${R},${R} 0 0 1 ${-R},${R} ` +
    `h${-(W + ext) + 2 * R} ` +
    `a${R},${R} 0 0 1 ${-R},${-R} ` +
    `z ` +
    `M-30,10 ` +
    `m${W + 4},${2 + H / 2} ` +
    `h5 ` +
    `v-${4 + H / 2}`
  );
}

function pathTivUp(): string {
  // Petit "tail" vertical seul (pas d'état "F" rendu ici)
  return `M-2,-25 m5,${H / 2} h-5 v${4 + H / 2}`;
}

function pathTivDown(): string {
  return `M-33,10 m${W + 4},${2 + H / 2} h5 v-${4 + H / 2}`;
}

// Mode "double" — pair de cercles : extérieur rouge si actif, intérieur
// jaune au repos. Reproduit le rendu Gessie pour controle.double_zap_eap_epa.
function DoubleCircles({
  cxOuter, cyOuter,
  cxInner, cyInner,
  active,
}: {
  cxOuter: number; cyOuter: number;
  cxInner: number; cyInner: number;
  active: boolean;
}) {
  return (
    <>
      <circle cx={cxOuter} cy={cyOuter} r={4} fill={active ? '#FF2200' : 'white'} stroke="#000000" strokeWidth={1} />
      <circle cx={cxInner} cy={cyInner} r={4} fill={active ? 'white' : '#FFEE44'} stroke="#000000" strokeWidth={1} />
    </>
  );
}

export function TcoControle({ item }: Props) {
  // Hooks d'abord (rules-of-hooks).
  const name = item.name ? String(item.name) : '';
  // État du contrôle (F = fermé / O = ouvert). Lu depuis Player.affectations
  // si la sim est lancée, sinon null (= pas de rond, juste la boîte blanche).
  // Sémantique SNCF : carré au repos = position "F" = rond rouge ; quand le
  // levier est actionné, position passe à "O" → le rond rouge disparaît.
  const etat = useAffectationPosition(name || null);
  // États EAP/EPA/FA/proxi — encodés en CSV pour rester scalaire.
  const visualCsv = useControleVisualState(name || null);
  const v = decodeVisualState(visualCsv);

  if (item.xPos == null || item.yPos == null) return null;

  const variation = item.variationId ?? 'hidden';
  if (variation === 'hidden') return null;

  // Mapping variationId → position (cf. controle/settings.json)
  const position =
    variation === 'top' ? 'up'
    : variation === 'bottom' ? 'down'
    : variation; // sam / tiv-up / tiv-down passent tel quel

  const isD = name.startsWith('D');
  const ouverture = Boolean(item.controleOuverture);
  const rotation = parseFloat(String(item.rotation ?? '0')) || 0;

  // Sélection du path selon la position
  let d: string;
  if (position === 'up') {
    d = pathUp(isD, ouverture);
  } else if (position === 'down') {
    d = pathDown(isD, ouverture);
  } else if (position === 'tiv-up') {
    d = pathTivUp();
  } else if (position === 'tiv-down') {
    d = pathTivDown();
  } else {
    // sam : image, pas implémenté hors mode play
    return null;
  }

  // Position du nom (cf. render fn)
  let nameX: number;
  let nameY: number;
  if (position === 'up') {
    nameX = -10;
    nameY = -34;
  } else {
    nameX = -36;
    nameY = H + 30;
  }

  // Position des ronds (rouge si F, jaune si ouverture && O) — cf. Gessie
  // render @616667 :
  //   'up'   : red @ (10, -18), yellow @ (12+w/2, -25+h/2)
  //   'down' : red @ (-25+w/2, 12+h/2), yellow @ (-37+w/2, 12+h/2)
  // Les coords (10, -18) de Gessie sont le centre de SA boîte (w=20, h=14) :
  // soit (w/2, -25+h/2). On dérive les nôtres de la même formule pour rester
  // centré quand on agrandit (W=28, H=20).
  let redCx = 0, redCy = 0, yellowCx = 0, yellowCy = 0;
  if (position === 'up') {
    redCx = W / 2;
    redCy = -30 + H / 2;
    yellowCx = 12 + W / 2;
    yellowCy = -30 + H / 2;
  } else if (position === 'down') {
    redCx = -25 + W / 2;
    redCy = 12 + H / 2;
    yellowCx = -37 + W / 2;
    yellowCy = 12 + H / 2;
  }
  const dotR = 0.3 * H;

  return (
    <g transform={`translate(${item.xPos}, ${item.yPos})`}>
      <g transform={`rotate(${rotation}, 0, 8)`}>
        <path
          d={d}
          fill="#ffffff"
          stroke="#000000"
          strokeWidth={2}
          strokeMiterlimit={10}
        />
        {/* Rond rouge si fermé ("F") — sémantique SNCF carré au rouge */}
        {etat === 'F' && (position === 'up' || position === 'down') && (
          <circle cx={redCx} cy={redCy} r={dotR} fill="red" />
        )}
        {/* Rond jaune si ouverture commandée et signal ouvert */}
        {ouverture && etat === 'O' && (position === 'up' || position === 'down') && (
          <circle cx={yellowCx} cy={yellowCy} r={dotR} fill="#FFCC00" />
        )}
        {position === 'tiv-up' && (
          <rect
            x={4}
            y={-30}
            width={18}
            height={22}
            fill="#ffffff"
            stroke="#000000"
            strokeWidth={2}
            strokeMiterlimit={10}
          />
        )}
        {position === 'tiv-down' && (
          <rect
            x={-27}
            y={10}
            width={18}
            height={22}
            fill="#ffffff"
            stroke="#000000"
            strokeWidth={2}
            strokeMiterlimit={10}
          />
        )}
        {name && (position === 'up' || position === 'down') && (
          <text
            x={nameX}
            y={nameY}
            fontSize={20}
            fill="var(--tco-trait)"
            fontFamily="system-ui"
          >
            {name}
          </text>
        )}
        {(position === 'up' || position === 'down') && (
          <ControleAddOns position={position} v={v} />
        )}
      </g>
    </g>
  );
}

/**
 * Rendu des indicateurs auxiliaires (FA / proxi / EAP / EPA) du contrôle.
 *
 * Reproduction fidèle de tco-controle render @616667 (renderer.js) — les
 * coordonnées sont reprises telles quelles (Gessie utilise w=20/h=14 ;
 * nos W=28/H=20 sont 1.4× plus grands mais les overlays externes restent
 * en valeurs absolues, donc visuellement compatibles).
 *
 * Mode `double` (cf. controle.double_zap_eap_epa) : 4 cercles + label texte.
 * Mode simple (sans double) : on rend en placeholder texte — le sous-
 * composant tco-signal de Gessie (`label=position, etat=rouge|jaune`) n'est
 * pas porté ici (utilisation très spécifique).
 */
function ControleAddOns({
  position,
  v,
}: {
  position: 'up' | 'down';
  v: VisualState;
}) {
  const FA = (
    <>
      {position === 'up' ? (
        <>
          <circle cx={-30} cy={-45} r={11} fill="none" stroke="var(--tco-trait)" strokeWidth={1.5} />
          <text x={-30} y={-45} fontSize={13} fontWeight="bold" textAnchor="middle" dominantBaseline="central" fill="var(--tco-trait)" fontFamily="system-ui">FA</text>
        </>
      ) : (
        <>
          <circle cx={-8 + 2 * W} cy={17 + 2 * H} r={11} fill="none" stroke="var(--tco-trait)" strokeWidth={1.5} />
          <text x={-8 + 2 * W} y={17 + 2 * H} fontSize={13} fontWeight="bold" textAnchor="middle" dominantBaseline="central" fill="var(--tco-trait)" fontFamily="system-ui">FA</text>
        </>
      )}
    </>
  );

  const Proxi = (
    <>
      <circle
        cx={-40}
        cy={15}
        r={4}
        fill={v.proxiPressed ? '#FFEE44' : 'transparent'}
        stroke="var(--tco-trait)"
        strokeWidth={1.5}
      />
      <text x={-45} y={35} fontSize={14} fontWeight="bold" fill="var(--tco-trait)" fontFamily="system-ui">EP</text>
    </>
  );

  const EAP = v.hasEap && v.double ? (
    position === 'up' ? (
      <>
        <text y={-20} x={-65} fontSize={14} fontWeight="bold" fill="var(--tco-trait)" fontFamily="system-ui">ZAp</text>
        <DoubleCircles cxOuter={-48} cyOuter={-14} cxInner={-58} cyInner={-14} active={v.eapZap} />
        <text y={-20} x={-30} fontSize={14} fontWeight="bold" fill="var(--tco-trait)" fontFamily="system-ui">EAp</text>
        <DoubleCircles cxOuter={-15} cyOuter={-14} cxInner={-25} cyInner={-14} active={v.eapEap} />
      </>
    ) : (
      <>
        <text y={28} x={5} fontSize={14} fontWeight="bold" fill="var(--tco-trait)" fontFamily="system-ui">EAp</text>
        <DoubleCircles cxOuter={22} cyOuter={14} cxInner={12} cyInner={14} active={v.eapEap} />
        <text y={28} x={40} fontSize={14} fontWeight="bold" fill="var(--tco-trait)" fontFamily="system-ui">ZAp</text>
        <DoubleCircles cxOuter={56} cyOuter={14} cxInner={46} cyInner={14} active={v.eapZap} />
      </>
    )
  ) : null;

  const EPA = v.hasEpa && !v.hasEap ? (
    v.double ? (
      <>
        <text y={position === 'up' ? -20 : 28} x={position === 'up' ? -30 : 5} fontSize={14} fontWeight="bold" fill="var(--tco-trait)" fontFamily="system-ui">EPa</text>
        <DoubleCircles
          cxOuter={position === 'up' ? -15 : 22}
          cyOuter={position === 'up' ? -14 : 14}
          cxInner={position === 'up' ? -25 : 12}
          cyInner={position === 'up' ? -14 : 14}
          active={v.epaEpa}
        />
      </>
    ) : (
      // Mode simple EPA : un seul cercle bicolore + label "Epa"
      <>
        <circle
          cx={position === 'up' ? -22 : -22}
          cy={position === 'up' ? -17 : -17}
          r={4}
          fill={v.epaEpa ? '#FF2200' : '#FFEE44'}
          stroke="#000000"
          strokeWidth={1}
        />
        <text x={-30} y={-20} fontSize={14} fontWeight="bold" fill="var(--tco-trait)" fontFamily="system-ui">Epa</text>
      </>
    )
  ) : null;

  return (
    <>
      {v.fa && FA}
      {v.hasProxi && Proxi}
      {EAP}
      {EPA}
    </>
  );
}
