// Pupitre de commande du PRS de Springfield.
//
// Disposition reprise de la maquette Claude Design : bloc des annulateurs de
// transit (coupons plombés + plaques T1/T2), grille d'itinéraires 5 × 3,
// panneau « Commandes », puis colonne de droite (contrôle des aiguilles,
// « À disposition », clé Main-Moteur).
//
// Cf. `docs/springfield-prs-spec.md` §4 (machine d'état des boutons),
// §6.3 (A.T.R.), §6.8 (terrain) et §7 (dispositifs).

import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { AIGUILLES, PUPITRE_GRID, ROUTE_BY_ID } from './topology';
import type { AigId, AigPos, RouteId } from './topology';
import { DISPOSITIF_MAX } from './engine';
import type { DispositifKind, PrsState, SaatCell } from './engine';
import { PrsSaat } from './PrsSaat';
import { Panel, Row } from './ui';
import { chipButton, hintStyle, padButton, selectStyle } from './styles';
import { ROUTE_LAMP, prs, prsFont } from './theme';

export type DispositifMode = null | { kind: DispositifKind; delta: 1 | -1 };

export interface PrsPupitreProps {
  state: PrsState;
  dispositifMode: DispositifMode;
  selectedAig: AigId | null;
  keyTaken: boolean;
  now: number;
  onPressRoute: (id: RouteId) => void;
  onChangeDispositif: (id: RouteId, kind: 'da' | 'dr', delta: 1 | -1) => void;
  onSetDispositifMode: (m: DispositifMode) => void;
  onToggleCarre: (sig: 'c81' | 'c82' | 'c84') => void;
  onToggleTestAig: () => void;
  onTestZones: (on: boolean) => void;
  onAckDi: () => void;
  onPressS81: () => void;
  /** Imprimé ouvert sous le pupitre, `null` si aucun. */
  imprime: string | null;
  onSelectImprime: (id: string | null) => void;
  onCycleAtr: (n: 1 | 2 | 3) => void;
  onAnnulAtr: (n: 1 | 2 | 3) => void;
  onSelectAig: (id: AigId | null) => void;
  onToggleMainMoteur: (id: AigId) => void;
  onThrowLever: (id: AigId) => void;
  onToggleKey: () => void;
  /** Clic droit sur un bouton d'itinéraire : menu des dispositifs. */
  onRouteMenu: (id: RouteId, x: number, y: number) => void;
  /** Remplace l'état entier — le graphique de circulation se saisit au clavier. */
  onSetState: (next: PrsState) => void;
  /** Annonce d'une circulation saisie dans une case d'entrée du graphique. */
  onAnnoncer: (cell: SaatCell, num: string) => void;
}

/**
 * « À disposition » — consignes, imprimés, dispositifs divers, clé Main-Moteur
 * — est masqué le temps de reprendre le graphique de circulation. Le panneau
 * reste écrit et branché : remettre ce drapeau à `true` le rétablit.
 */
const AFFICHER_A_DISPOSITION: boolean = false;

export function PrsPupitre(p: PrsPupitreProps) {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <AtrBlock {...p} />
      <RoutesPanel {...p} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minWidth: 300 }}>
        <PrsSaat state={p.state} onChange={p.onSetState} onAnnoncer={p.onAnnoncer} />
        {AFFICHER_A_DISPOSITION && <DispositionPanel {...p} />}
      </div>
    </div>
  );
}

// ===== Annulateurs de transit ===============================================

const ATR_SCOPE: Record<1 | 2 | 3, string> = {
  1: 'Z 89',
  2: 'T 1',
  3: 'T 2',
};

const ATR_HINT: Record<1 | 2 | 3, string> = {
  1: 'Voie M (z89) — purge automatique après 20 s',
  2: 'Zones z81 · z81b · z83b',
  3: 'Zone z82a (côté DG / N2)',
};

function AtrBlock({ state, onCycleAtr, onAnnulAtr }: PrsPupitreProps) {
  return (
    // Une grille de trois rangées : chaque coupon tient la même que sa portée.
    // En deux colonnes indépendantes, elles dérivaient — le coupon fait 76 px
    // de haut, la portée davantage dès qu'elle porte une plaque de transit, si
    // bien que le troisième libellé finissait 80 px sous son bouton.
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto auto',
        columnGap: 14,
        rowGap: 12,
        // Le coupon s'aligne en haut, sur le libellé de sa portée.
        alignItems: 'start',
        background: prs.panel,
        border: `1px solid ${prs.border}`,
        borderRadius: prs.radius.lg,
        padding: 14,
      }}
    >
      {([1, 2, 3] as const).map((n) => {
        const armed = state.atrArmed[n - 1];
        const annul = state.atrAnnul[n - 1];
        const lamp = annul ? prs.red : armed ? prs.amber : prs.bg;
        return (
          <Fragment key={n}>
            {/* Le coupon plombé. */}
            <button
              type="button"
              onClick={() => onCycleAtr(n)}
              title={`ATR ${n} — ${ATR_HINT[n]}. ${couponGeste(n, armed, annul)}`}
              style={{
                width: 132,
                height: 76,
                borderRadius: prs.radius.md,
                background: prs.ticket,
                border: `1px solid ${armed || annul ? prs.borderAmber : prs.borderMid}`,
                boxShadow: `inset 0 0 0 4px ${prs.inset}`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: 8,
                padding: '0 14px',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{ font: `600 12.5px ${prsFont.mono}`, color: prs.amber }}>
                N° {state.coupons + n - 1}
              </span>
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  background: lamp,
                  border: `1px solid rgba(255,255,255,.18)`,
                  display: 'block',
                }}
              />
            </button>

            {/* Sa portée. Pour les deux annulateurs indirects, la plaque de
                transit est aussi le bouton de confirmation au terrain. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div
                style={{
                  background: prs.inset,
                  border: `1px solid ${prs.borderMid}`,
                  borderRadius: prs.radius.sm,
                  textAlign: 'center',
                  padding: '5px 0',
                  font: `700 13px ${prsFont.ui}`,
                  color: n === 1 ? prs.amber : prs.textDim,
                }}
              >
                {n === 1 ? 'Atr' : ATR_SCOPE[n]}
              </div>
              {n === 1 ? (
                <div
                  style={{
                    textAlign: 'center',
                    font: `600 13px ${prsFont.mono}`,
                    color: prs.textDim,
                    padding: '4px 0',
                  }}
                >
                  Z 89
                </div>
              ) : (
                <TransitPlate n={n} armed={armed} annul={annul} onConfirm={() => onAnnulAtr(n)} />
              )}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * Ce que fera le prochain clic sur le coupon.
 *
 * L'annulateur direct annule d'un seul geste — `atri()` fait
 * `batr1 = 1; bannul1 = 1; dtri();`. Les deux indirects ne font qu'**autoriser**
 * l'annulation (`atrz()`, `atre()`, « Cliquez pour autoriser l'annulation du
 * transit ») : c'est la plaque de transit qui la confirme ensuite.
 */
function couponGeste(n: 1 | 2 | 3, armed: boolean, annul: boolean): string {
  if (annul) return 'Clic : replacer le coupon.';
  if (armed) return 'Annulation autorisée — confirmez sur la plaque de transit.';
  return n === 1 ? 'Clic : annuler le transit.' : "Clic : autoriser l'annulation.";
}

/**
 * Plaque de transit T1 / T2.
 *
 * Ce sont les images du poste d'origine — `boutons/plaqueT1.gif` et
 * `plaqueT2.gif` — recopiées telles quelles plutôt que redessinées : elles
 * portent le schéma exact du transit que l'annulateur couvre.
 */
function TransitPlate({
  n,
  armed,
  annul,
  onConfirm,
}: {
  n: 2 | 3;
  armed: boolean;
  annul: boolean;
  onConfirm: () => void;
}) {
  return (
    <button
      type="button"
      onClick={armed ? onConfirm : undefined}
      disabled={!armed}
      title={
        annul
          ? `Transit T${n - 1} annulé.`
          : armed
            ? `Cliquez pour annuler le transit T${n - 1} — l'annulateur a été actionné.`
            : `Plaque de transit T${n - 1}. Actionnez d'abord l'annulateur.`
      }
      style={{
        background: prs.well,
        border: `1px solid ${annul ? prs.borderRed : armed ? prs.borderAmber : prs.border}`,
        borderRadius: prs.radius.sm,
        padding: 6,
        display: 'flex',
        justifyContent: 'center',
        cursor: armed ? 'pointer' : 'default',
        // Au repos la plaque n'est qu'un rappel du transit couvert ; elle
        // s'éclaire quand l'annulateur autorise à la presser.
        boxShadow: armed ? `0 0 0 3px ${prs.amberBg}` : 'none',
      }}
    >
      <img
        src={`/images/prs/plaqueT${n - 1}.gif`}
        alt={`Plaque de transit T${n - 1}`}
        width={80}
        height={58}
        style={{
          display: 'block',
          width: 88,
          height: 'auto',
          imageRendering: 'pixelated',
          opacity: annul ? 0.5 : 1,
          // Le GIF d'origine est un trait blanc sur fond noir. En thème clair
          // il ferait un timbre noir sur le panneau ivoire : on l'inverse, ce
          // qui lui rend justement l'aspect d'une plaque gravée. La variable
          // vaut `none` en sombre.
          filter: 'var(--prs-plaque-filtre)',
        }}
      />
    </button>
  );
}

// ===== Itinéraires ===========================================================

function RoutesPanel(p: PrsPupitreProps) {
  const { dispositifMode } = p;
  return (
    <Panel
      title="Itinéraires"
      accent="blue"
      aside={<DispositifHint mode={dispositifMode} />}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 72px)',
          // Une rangée de commandes, un filet d'espace, puis les trois rangées
          // d'itinéraires. Les hauteurs sont explicites pour que le filet ne
          // prenne pas la taille d'une rangée de boutons.
          // Commutateurs de fermeture, commandes du tableau, filet, puis les
          // trois rangées d'itinéraires. Les hauteurs sont déclarées pour que
          // le filet ne prenne pas la taille d'une rangée de boutons.
          gridTemplateRows: '72px 52px 8px repeat(3, 52px)',
          gap: 6,
        }}
      >
        {/* Fermeture des carrés : trois commutateurs à tourner, puis la clé
            Main-Moteur qui les jouxte sur le pupitre. */}
        {(['c81', 'c82', 'c84'] as const).map((sig) => (
          <CarreSwitch
            key={sig}
            sig={sig}
            fermé={p.state.fc[sig]}
            onClick={() => p.onToggleCarre(sig)}
          />
        ))}
        <CleMainMoteur prise={p.keyTaken} onToggle={p.onToggleKey} />
        <div />

        {/* Commandes agissant sur le tableau, au-dessus des itinéraires. */}
        <button
          type="button"
          onClick={p.onToggleTestAig}
          style={padButton(p.state.testAig)}
          title="Bascule : affiche le contrôle des aiguilles sur le TCO"
        >
          Test
          <br />
          aig
        </button>
        <button
          type="button"
          onMouseDown={() => p.onTestZones(true)}
          onMouseUp={() => p.onTestZones(false)}
          onMouseLeave={() => p.onTestZones(false)}
          style={padButton(p.state.testZones)}
          title="Maintenir : allume toutes les zones libres"
        >
          Test
          <br />
          Zone
        </button>
        <button
          type="button"
          onClick={p.onPressS81}
          style={padButton(p.state.bs81)}
          title="Ouverture de substitution du carré 81 sur AG-NU (fsub) : approche décelée, AG-NU formé, parcours libre"
        >
          S 81
        </button>
        <button
          type="button"
          onClick={p.onAckDi}
          disabled={p.state.di !== 1}
          style={padButton(p.state.di === 2, p.state.di !== 1)}
          title="Acquitte la sonnerie ; le voyant DI passe au fixe"
        >
          A.Sn.
          <br />
          Di
        </button>
        <div />

        <div style={{ gridColumn: '1 / -1' }} />

        {PUPITRE_GRID.map((id, i) =>
          id ? <RouteButton key={id} id={id} {...p} /> : <EmptyCell key={`empty-${i}`} />,
        )}
      </div>
      {dispositifMode && (
        <p style={hintStyle}>
          Un clic sur un bouton {dispositifMode.delta === 1 ? 'pose' : 'retire'} un{' '}
          {dispositifMode.kind.toUpperCase()} — maximum {DISPOSITIF_MAX} cumulés par bouton.
        </p>
      )}
    </Panel>
  );
}

/**
 * Clé Main-Moteur — `cle()` / `clea()` / `cleb()`, image `clem`.
 *
 * Retirée, elle déverrouille la manœuvre des aiguilles à pied d'œuvre :
 * `quXX()` n'ouvre la vue terrain que sous `clemm == 1`. Sans elle, aucune
 * aiguille ne se cale à main ni ne se renverse.
 */
function CleMainMoteur({ prise, onToggle }: { prise: boolean; onToggle: () => void }) {
  const metal = prise ? '#d9a94a' : '#7a6a45';
  return (
    <button
      type="button"
      onClick={onToggle}
      title={
        prise
          ? 'Clé Main-Moteur prise — la manœuvre au terrain est possible'
          : 'Prendre la clé Main-Moteur pour accéder à la manœuvre au terrain'
      }
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 5,
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
      }}
    >
      <span style={{ font: `600 12px ${prsFont.mono}`, color: prise ? prs.amber : prs.textDim }}>
        M/M
      </span>
      <svg width={52} height={52} viewBox="0 0 52 52" aria-hidden="true">
        {prise && <circle cx={26} cy={26} r={25} fill={prs.amber} opacity={0.16} />}
        {/* Panneton en bas, tige vers le haut, deux dents : la silhouette
            suffit à lire la clé à cette taille. */}
        <circle
          cx={26}
          cy={38}
          r={10}
          fill={metal}
          stroke={prise ? '#8f6c20' : '#5a4d33'}
          strokeWidth={1.5}
        />
        <circle cx={26} cy={38} r={3.6} fill={prs.panel} />
        <rect x={23.5} y={7} width={5} height={23} fill={metal} />
        <rect x={28.5} y={12} width={7} height={4} fill={metal} />
        <rect x={28.5} y={21} width={7} height={4} fill={metal} />
      </svg>
    </button>
  );
}
function EmptyCell() {
  return (
    <div
      style={{
        borderRadius: prs.radius.md,
        background: prs.inset,
        border: `1px solid ${prs.borderSoft}`,
      }}
    />
  );
}

function RouteButton({
  id,
  state,
  now,
  onPressRoute,
  onRouteMenu,
}: { id: RouteId } & PrsPupitreProps) {
  const r = ROUTE_BY_ID[id];
  const b = state.b[id];
  const established = state.established[id];
  // `bX == 3` : commande **enregistrée** ; `bX == 5` : tracé permanent
  // **surenregistré** derrière une autre commande. Ni l'un ni l'autre n'est un
  // refus : ils seront rejoués, l'enregistré d'abord, le surenregistré ensuite.
  const registered = b === 3 || b === 5;
  const overRegistered = b === 5;
  const underDmt = state.dmt?.route === id;
  const da = state.da[id];
  const dr = state.dr[id];
  const dsa = state.dsa[id];
  const remaining =
    underDmt && state.dmt ? Math.max(0, Math.ceil((state.dmt.dueAt - now) / 1000)) : 0;

  // Le bouton s'allume dans la couleur de son itinéraire : jaune pour une
  // destruction automatique, orange pour un tracé permanent. Enregistré, il
  // garde la même couleur et clignote (le GIF `…2.gif` de l'original est le
  // sprite allumé, animé sur deux images).
  // Chaque bouton a sa propre couleur au repos et sa propre couleur allumée :
  // D.A. bleu qui s'allume en blanc, T.P. neutre qui s'allume en orange.
  // Enregistré ou surenregistré, il clignote dans sa couleur allumée.
  const lamp = r.tpOf != null ? ROUTE_LAMP.tp : ROUTE_LAMP.da;
  const lit = established || registered || underDmt;
  const face = lit ? lamp.lit : lamp.rest;

  const bg: string = face.bg;
  const fg: string = face.fg;
  const shadow: string = face.glow;
  // La temporisation de destruction se signale par un liseré rouge, la lampe
  // restant allumée comme dans l'original.
  const border: string = underDmt ? prs.red : face.border;

  // Le détournement vers la pose ou le retrait d'un dispositif est décidé par
  // le moteur, comme le fait `tfX()` : un bouton sans dispositif se commande
  // normalement même en mode retrait.
  const handleClick = () => onPressRoute(id);

  return (
    <button
      type="button"
      onClick={handleClick}
      // Clic droit : pose et retrait des dispositifs sur ce bouton.
      onContextMenu={(e) => {
        e.preventDefault();
        onRouteMenu(id, e.clientX, e.clientY);
      }}
      title={r.hint}
      style={{
        position: 'relative',
        borderRadius: prs.radius.md,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        textAlign: 'center',
        font: `600 13px ${prsFont.ui}`,
        background: bg,
        border: `1px solid ${border}`,
        color: fg,
        boxShadow: shadow,
        cursor: 'pointer',
        padding: 2,
        animation: registered ? 'prs-blink 900ms steps(1, end) infinite' : undefined,
      }}
    >
      <span>{r.label}</span>
      {r.sub && (
        <span style={{ fontSize: 10, fontFamily: prsFont.mono, opacity: 0.8 }}>{r.sub}</span>
      )}
      {lit && (
        <span style={{ fontSize: 9.5, fontFamily: prsFont.mono, opacity: 0.9 }}>
          {underDmt
            ? `D.M.T. ${remaining}s`
            : overRegistered
              ? 'surenregistré'
              : registered
                ? 'enregistré'
                : 'établi'}
        </span>
      )}
      {(da > 0 || dr > 0 || dsa > 0) && (
        <span style={{ position: 'absolute', top: 3, right: 3, display: 'flex', gap: 2 }}>
          {da > 0 && <Badge color="#2b6cb0">{da}A</Badge>}
          {dr > 0 && <Badge color="#a9660b">{dr}R</Badge>}
          {dsa > 0 && <Badge color="#2f7a5b">{dsa}S</Badge>}
        </span>
      )}
    </button>
  );
}

function Badge({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span
      style={{
        fontSize: 8.5,
        lineHeight: '11px',
        padding: '0 3px',
        borderRadius: prs.radius.pill,
        background: color,
        // Blanc sur fond saturé : lisible aussi bien sur l'alvéole bleue au repos
        // que sur la lampe blanche allumée.
        color: '#ffffff',
        boxShadow: '0 0 0 1px rgba(0,0,0,.20)',
        fontWeight: 700,
        fontFamily: prsFont.mono,
      }}
    >
      {children}
    </span>
  );
}

function DispositifHint({ mode }: { mode: DispositifMode }) {
  if (!mode) return null;
  return (
    <span
      style={{
        font: `600 11px ${prsFont.mono}`,
        color: prs.amber,
        border: `1px solid ${prs.borderAmber}`,
        borderRadius: prs.radius.pill,
        padding: '3px 9px',
        whiteSpace: 'nowrap',
      }}
    >
      {mode.delta === 1 ? 'pose' : 'retrait'} {mode.kind.toUpperCase()}
    </span>
  );
}

// ===== Commandes =============================================================



/**
 * Commutateur de fermeture de carré.
 *
 * Redessiné d'après `boutons/fc0.gif` et `fc1.gif` du poste d'origine : un
 * bouton rotatif dont la poignée verticale porte une flèche, vers le bas au
 * repos et vers le haut une fois tourné, le corps passant du rouge sombre au
 * rouge vif. La rotation d'un demi-tour rend le geste lisible.
 */
function CarreSwitch({
  sig,
  fermé,
  onClick,
}: {
  sig: 'c81' | 'c82' | 'c84';
  fermé: boolean;
  onClick: () => void;
}) {
  const label = `${sig.slice(0, 1).toUpperCase()} ${sig.slice(1)}`;
  const corps = fermé ? '#c63a2e' : '#5e2724';
  const poignee = fermé ? '#ffd9d2' : '#c9a86a';

  return (
    <button
      type="button"
      onClick={onClick}
      title={`Commutateur de fermeture du ${label} — ${fermé ? 'tourné' : 'au repos'}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 5,
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
      }}
    >
      <span style={{ font: `600 12px ${prsFont.mono}`, color: fermé ? prs.red : prs.textDim }}>
        {label}
      </span>
      <svg width={52} height={52} viewBox="0 0 52 52" aria-hidden="true">
        {fermé && <circle cx={26} cy={26} r={25} fill={prs.red} opacity={0.18} />}
        <circle
          cx={26}
          cy={26}
          r={21}
          fill={corps}
          stroke={fermé ? prs.redSoft : '#8a6f3f'}
          strokeWidth={2}
        />
        {/* Poignée : verticale, pointe en bas au repos, en haut une fois tournée. */}
        <g
          transform={`rotate(${fermé ? 180 : 0}, 26, 26)`}
          style={{ transition: 'transform 220ms ease' }}
        >
          <rect x={22} y={9} width={8} height={28} rx={3} fill={poignee} />
          <path d="M26 43 L20.5 34 L31.5 34 Z" fill={poignee} />
        </g>
      </svg>
    </button>
  );
}

// ===== Position d'aiguille ==================================================

const posLabel = (p: AigPos) => (p === 'g' ? 'gauche' : 'droite');

// ===== À disposition + clé Main-Moteur =======================================

function DispositionPanel(p: PrsPupitreProps) {
  const { state, selectedAig, keyTaken } = p;
  const aig = AIGUILLES.find((a) => a.id === selectedAig) ?? null;

  return (
    <Panel title="À disposition" accent="amber">
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <select style={selectStyle} disabled defaultValue="">
            <option value="">Consignes… (non portées)</option>
          </select>
          <select
            style={selectStyle}
            value={p.imprime ?? ''}
            onChange={(e) => p.onSelectImprime(e.target.value || null)}
          >
            <option value="">Imprimés…</option>
            <option value="cba">Bulletin Cba</option>
            <option value="ordre">Ordre / Avis</option>
          </select>
          <select
            style={selectStyle}
            value={dispoValue(p.dispositifMode)}
            onChange={(e) => p.onSetDispositifMode(parseDispo(e.target.value))}
            title="Pose et retrait des dispositifs d'attention (D.A) et de réflection (D.R)"
          >
            <option value="none">Dispositifs divers…</option>
            <option value="da+">Poser les D.A</option>
            <option value="da-">Retirer les D.A</option>
            <option value="dr+">Poser les D.R</option>
            <option value="dr-">Retirer les D.R</option>
          </select>
        </div>
      </div>

      {/* Manœuvre au terrain, déverrouillée par la clé. */}
      <div style={{ borderTop: `1px solid ${prs.border}`, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Row label="Terrain">
          {AIGUILLES.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => p.onSelectAig(a.id)}
              style={chipButton(selectedAig === a.id)}
            >
              {a.label}
            </button>
          ))}
        </Row>
        {!keyTaken ? (
          <p style={hintStyle}>
            Prenez la clé Main-Moteur pour caler une aiguille à main et renverser son levier.
          </p>
        ) : !aig ? (
          <p style={hintStyle}>Sélectionnez une aiguille, ici ou sur le TCO.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <dl
              style={{
                margin: 0,
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto 1fr',
                gap: '2px 10px',
                fontSize: 11.5,
                fontFamily: prsFont.mono,
              }}
            >
              <dt style={dt}>Contrôle</dt>
              <dd style={dd}>
                {state.aig[aig.id] === 0 ? (
                  <span style={{ color: prs.red }}>absent</span>
                ) : (
                  posLabel(state.aig[aig.id] as AigPos)
                )}
              </dd>
              <dt style={dt}>Commande</dt>
              <dd style={dd}>{posLabel(state.cag[aig.id])}</dd>
              <dt style={dt}>Terrain</dt>
              <dd style={dd}>{posLabel(state.lev[aig.id])}</dd>
              <dt style={dt}>Mode</dt>
              <dd style={dd}>
                {state.mm[aig.id] === 0 ? (
                  'moteur'
                ) : (
                  <span style={{ color: prs.amber }}>à main</span>
                )}
              </dd>
            </dl>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => p.onToggleMainMoteur(aig.id)}
                style={chipButton(state.mm[aig.id] !== 0, prs.amber)}
              >
                {state.mm[aig.id] === 0 ? 'Prendre à main' : 'Rendre au moteur'}
              </button>
              <button
                type="button"
                onClick={() => p.onThrowLever(aig.id)}
                disabled={state.mm[aig.id] === 0}
                style={{
                  ...chipButton(false),
                  opacity: state.mm[aig.id] === 0 ? 0.4 : 1,
                  cursor: state.mm[aig.id] === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                Renverser le levier
              </button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

const dt = { color: prs.textFaint, margin: 0 };
const dd = { color: prs.text, margin: 0 };

function dispoValue(m: DispositifMode): string {
  if (!m) return 'none';
  return `${m.kind}${m.delta === 1 ? '+' : '-'}`;
}

function parseDispo(v: string): DispositifMode {
  switch (v) {
    case 'da+':
      return { kind: 'da', delta: 1 };
    case 'da-':
      return { kind: 'da', delta: -1 };
    case 'dr+':
      return { kind: 'dr', delta: 1 };
    case 'dr-':
      return { kind: 'dr', delta: -1 };
    default:
      return null;
  }
}
