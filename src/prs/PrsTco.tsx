// Tableau de Contrôle Optique du PRS de Springfield.
//
// Rendu conforme à la maquette Claude Design « PRS TCO — Voie Libre » :
// schéma épuré 1560 × 400, quatre voies horizontales reliées par des obliques,
// aiguilles en triangle plein, pastilles de zone rectangulaires, signaux en
// potence. Toute la géométrie vient de `./topology`, tout l'état de `./engine`.

import { AIGUILLES, DECOR_SIGNALS, ENDPOINTS, LAMPS, LINES, SIGNALS, TCO_HEIGHT, TCO_WIDTH, ZAPS, ZONES, pointOnDiagonal, trackSegments, zoneLength, diagSegments } from './topology';
import type { AigDef, AigId, LampDef, SignalDef, ZoneDef } from './topology';
import type { PrsState } from './engine';
import { ZONE_FAULT_OF_ZONE, displayedZoneState } from './engine';
import type { FaultTarget } from './engine';
import { ZONE_FILL, ZONE_STATE_LABEL, prs, prsFont } from './theme';

/** Gris d'extinction commun à tous les voyants au repos. */
const OFF = '#3a4657';

export interface PrsTcoProps {
  state: PrsState;
  /** Clic sur une aiguille — sélectionne la vue « terrain ». */
  /**
   * Clic sur une aiguille. La position du curseur sert à ouvrir la fenêtre de
   * manœuvre au terrain à l'endroit même où l'on a cliqué.
   */
  onSelectAig?: (id: AigId, at: { x: number; y: number }) => void;
  selectedAig?: AigId | null;
  /**
   * Clic droit sur une pastille de zone, une aiguille ou un signal : ouvre le
   * menu des dérangements applicables à cet élément, à la position du curseur.
   */
  onContextFault?: (target: FaultTarget, at: { x: number; y: number }) => void;
}

export function PrsTco({ state, onSelectAig, selectedAig, onContextFault }: PrsTcoProps) {
  return (
    <div
      style={{
        background: prs.panel,
        border: `1px solid ${prs.border}`,
        borderRadius: prs.radius.lg,
        padding: '10px 14px 4px',
      }}
    >
      <svg
        viewBox={`0 0 ${TCO_WIDTH} ${TCO_HEIGHT}`}
        style={{ width: '100%', display: 'block' }}
        role="img"
        aria-label="Tableau de contrôle optique du PRS de Springfield"
      >
        {/* Secteurs d'aiguille, en fond. */}
        <g fill={prs.switchFill}>
          {AIGUILLES.map((a) => (
            <path key={a.id} d={sectorPath(a)} />
          ))}
        </g>

        <TrackLayer />

        <g>
          {AIGUILLES.map((a) => (
            <SwitchDots key={a.id} aig={a} state={state} />
          ))}
        </g>

        <g>
          {ZONES.map((z) => (
            <ZoneBar key={z.id} zone={z} state={state} onContext={onContextFault} />
          ))}
        </g>

        <EndpointLayer />

        <g>
          {SIGNALS.map((s) => (
            <Signal key={s.id} def={s} state={state} onContext={onContextFault} />
          ))}
          {DECOR_SIGNALS.map((s) => (
            <Signal key={s.label} def={{ ...s, id: 'c81' }} state={state} decorative />
          ))}
        </g>

        <ZapLayer state={state} />
        <LampLayer state={state} />

        {/* Libellés de zone. */}
        <g fill={prs.amber} fontSize={12.5} fontFamily={prsFont.mono}>
          {ZONES.filter((z) => z.label && z.place.on === 'line').map((z) => {
            const p = z.place as Extract<ZoneDef['place'], { on: 'line' }>;
            return (
              <text
                key={z.id}
                x={p.cx}
                y={LINES[p.line].y + (z.labelBelow ? 20 : -14)}
                textAnchor="middle"
              >
                {z.label}
              </text>
            );
          })}
        </g>

        {/* Libellés d'aiguille. */}
        <g fill={prs.label} fontSize={12} fontFamily={prsFont.ui}>
          {AIGUILLES.map((a) => (
            <text key={a.id} x={a.labelX} y={a.labelY} textAnchor={a.labelAnchor}>
              {a.label}
            </text>
          ))}
        </g>

        {/* Libellés de signal. */}
        <g fill={prs.textDim} fontSize={13} fontFamily={prsFont.mono}>
          {SIGNALS.map((s) => (
            <text key={s.id} x={s.labelX} y={s.labelY} textAnchor={s.labelAnchor}>
              {s.label}
            </text>
          ))}
          {DECOR_SIGNALS.map((s) => (
            <text key={s.label} x={s.labelX} y={s.labelY} textAnchor={s.labelAnchor}>
              {s.label}
            </text>
          ))}
          <text x={104} y={346}>S 12,9</text>
        </g>

        <DecorLayer />

        {/* Cibles de clic des aiguilles, au-dessus de tout le reste. */}
        <SwitchHitAreas
          onSelect={onSelectAig}
          selected={selectedAig ?? null}
          state={state}
          onContext={onContextFault}
        />
      </svg>
      <Legend />
    </div>
  );
}

// ===== Voies =================================================================

function TrackLayer() {
  return (
    <g fill="none" stroke={prs.line} strokeWidth={2.4} strokeLinecap="square">
      {trackSegments('m').map((seg, i) => (
        <line key={`m-${seg.id ?? i}`} x1={seg.x1} y1={LINES.m.y} x2={seg.x2} y2={LINES.m.y} />
      ))}
      <line x1={LINES.m.bufferAt} y1={LINES.m.y - 16} x2={LINES.m.bufferAt} y2={LINES.m.y + 16} />
      {(['v1', 'v2', 'nu'] as const).flatMap((id) =>
        trackSegments(id).map((seg, i) => (
          <line
            key={`${id}-${seg.id ?? i}`}
            x1={seg.x1}
            y1={LINES[id].y}
            x2={seg.x2}
            y2={LINES[id].y}
          />
        )),
      )}
      <line x1={LINES.nu.bufferAt} y1={LINES.nu.y - 16} x2={LINES.nu.bufferAt} y2={LINES.nu.y + 16} />
      {(['d85', 'd81', 'd83a', 'd82'] as const).flatMap((d) =>
        diagSegments(d).map((seg, i) => (
          <line key={`${d}-${seg.id ?? i}`} x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2} />
        )),
      )}

    </g>
  );
}

// ===== Aiguilles =============================================================

type Pt = [number, number];

/** Longueur de chaque branche : `arm`, sauf réglage particulier. */
function arms(a: AigDef) {
  return { s: a.armStraight ?? a.arm, d: a.armDeviate ?? a.arm };
}

function branchEnds(a: AigDef) {
  const r = arms(a);
  const s: [number, number] = [a.x + a.vecStraight[0] * r.s, a.y + a.vecStraight[1] * r.s];
  const d: [number, number] = [a.x + a.vecDeviate[0] * r.d, a.y + a.vecDeviate[1] * r.d];
  return { s, d };
}

function trianglePoints(a: AigDef): string {
  const { s, d } = branchEnds(a);
  return `${a.x},${a.y} ${s[0]},${s[1]} ${d[0]},${d[1]}`;
}

/**
 * Rayon intérieur du secteur : le cœur de l'aiguille — là où les branches se
 * séparent — reste dégagé. Le TCO d'origine fait de même, son gris ne
 * commençant qu'à 5 ou 6 px du cœur sur une oblique de 121.
 */
const SECTOR_INNER = 6;

/** Rayon du cercle circonscrit à trois points. */
function circumradius(p: Pt, q: Pt, r: Pt): number {
  const a = Math.hypot(p[0] - q[0], p[1] - q[1]);
  const b = Math.hypot(q[0] - r[0], q[1] - r[1]);
  const c = Math.hypot(r[0] - p[0], r[1] - p[1]);
  const area = Math.abs((p[0] * (q[1] - r[1]) + q[0] * (r[1] - p[1]) + r[0] * (p[1] - q[1])) / 2);
  return area < 1e-6 ? Math.max(a, b, c) / 2 : (a * b * c) / (4 * area);
}

/**
 * Le secteur d'aiguille : les deux branches depuis le cœur, refermées par un
 * arc — la forme du poste d'origine, dont le bord extérieur est arrondi.
 *
 * Le bord passe par un point de la bissectrice posé à la distance de la plus
 * longue branche. À branches égales on retrouve l'arc centré sur le cœur ;
 * à branches inégales le secteur reste bombé au lieu de se pincer sur la
 * corde, ce qui laisse la place aux deux lampes de position.
 */
function sectorPath(a: AigDef): string {
  const { s, d } = branchEnds(a);
  // Sens de l'arc : produit vectoriel des deux branches, en repère écran
  // (y vers le bas), donc positif = horaire.
  const cross = (s[0] - a.x) * (d[1] - a.y) - (s[1] - a.y) * (d[0] - a.x);
  const sweep = cross > 0 ? 1 : 0;

  const r = arms(a);
  const bx = a.vecStraight[0] + a.vecDeviate[0];
  const by = a.vecStraight[1] + a.vecDeviate[1];
  const bn = Math.hypot(bx, by) || 1;
  const reach = Math.max(r.s, r.d);
  const m: Pt = [a.x + (bx / bn) * reach, a.y + (by / bn) * reach];

  const rad = circumradius(s, m, d);
  // Flèche de l'arc : au-delà du rayon, c'est l'arc majeur qui passe par `m`.
  const sag = Math.hypot(m[0] - (s[0] + d[0]) / 2, m[1] - (s[1] + d[1]) / 2);
  const large = sag > rad ? 1 : 0;

  // Bord intérieur : un arc centré sur le cœur, parcouru en sens inverse de
  // l'extérieur — d'où le drapeau de balayage complémenté.
  const i0: Pt = [a.x + a.vecStraight[0] * SECTOR_INNER, a.y + a.vecStraight[1] * SECTOR_INNER];
  const i1: Pt = [a.x + a.vecDeviate[0] * SECTOR_INNER, a.y + a.vecDeviate[1] * SECTOR_INNER];

  const n = (v: number) => Math.round(v * 100) / 100;
  return (
    `M${n(i0[0])},${n(i0[1])} L${n(s[0])},${n(s[1])}` +
    ` A${n(rad)},${n(rad)} 0 ${large},${sweep} ${n(d[0])},${n(d[1])}` +
    ` L${n(i1[0])},${n(i1[1])}` +
    ` A${SECTOR_INNER},${SECTOR_INNER} 0 0,${1 - sweep} ${n(i0[0])},${n(i0[1])} Z`
  );
}

// Valeurs relevées sur le TCO d'origine, rapportées à l'échelle du port : sur
// une oblique de 121 px, la lampe fait 8 px de diamètre, se pose à 27 px du
// cœur le long de sa branche et rentre de 5 à 9 px dans le secteur. Les deux
// lampes d'une même aiguille n'y sont séparées que de 3 px.

/** Rayon d'une lampe de position, sertissage compris. */
const LAMP_R = 4;
/** Vide minimal à laisser entre les deux lampes d'une même aiguille. */
const LAMP_MIN_GAP = 2.5;
/**
 * Rentrée de la lampe vers l'intérieur du secteur. Elle ne dégage pas
 * entièrement le trait de voie — l'original non plus, sa lampe déborde de
 * 0,7 px — mais elle assied la lampe dans le secteur au lieu de l'enfiler sur
 * la branche.
 */
const LAMP_INSET = 8;

/**
 * Centre des deux lampes : à 85 % du bras sur leur branche, puis rentrées vers
 * l'intérieur du secteur pour dégager le trait de voie.
 *
 * La rentrée cède devant l'écartement des branches : les aiguilles 83a et 82
 * n'ouvrent que de 28,5°, et les rentrer de 7 px ferait se toucher les deux
 * lampes. On prend donc ce que l'ouverture laisse, au plus `LAMP_INSET`.
 */
function lampCentres(a: AigDef): { straight: [number, number]; deviate: [number, number] } {
  const r = arms(a);
  const us = a.vecStraight;
  const ud = a.vecDeviate;

  // Composante de l'autre branche orthogonale à celle-ci : la direction qui
  // pointe vers l'intérieur du secteur.
  const inward = (u: readonly [number, number], v: readonly [number, number]) => {
    const k = u[0] * v[0] + u[1] * v[1];
    const x = v[0] - k * u[0];
    const y = v[1] - k * u[1];
    const n = Math.hypot(x, y) || 1;
    return [x / n, y / n] as const;
  };
  const ps = inward(us, ud);
  const pd = inward(ud, us);

  // Écart entre les deux lampes : `A + inset · B`, donc son carré est un
  // trinôme en `inset`. On garde la plus grande rentrée qui laisse encore
  // `LAMP_MIN_GAP` de vide.
  const A = [us[0] * r.s * 0.85 - ud[0] * r.d * 0.85, us[1] * r.s * 0.85 - ud[1] * r.d * 0.85];
  const B = [ps[0] - pd[0], ps[1] - pd[1]];
  const bb = B[0] * B[0] + B[1] * B[1];
  const ab = A[0] * B[0] + A[1] * B[1];
  const min = 2 * LAMP_R + LAMP_MIN_GAP;
  const disc = ab * ab - bb * (A[0] * A[0] + A[1] * A[1] - min * min);
  // Discriminant négatif : la contrainte ne peut jamais être violée, la
  // rentrée nominale passe.
  const limit = bb > 1e-6 && disc > 0 ? (-ab - Math.sqrt(disc)) / bb : LAMP_INSET;
  const inset = Math.max(0, Math.min(LAMP_INSET, limit));

  return {
    straight: [
      a.x + us[0] * r.s * 0.85 + ps[0] * inset,
      a.y + us[1] * r.s * 0.85 + ps[1] * inset,
    ],
    deviate: [a.x + ud[0] * r.d * 0.85 + pd[0] * inset, a.y + ud[1] * r.d * 0.85 + pd[1] * inset],
  };
}

/** Une lampe de position, sertie dans le secteur d'aiguille. */
function SwitchLamp({ at: [cx, cy], on }: { at: [number, number]; on: boolean }) {
  return (
    <>
      {on && <circle cx={cx} cy={cy} r={7.5} fill={prs.switchLampOn} opacity={0.16} />}
      <circle
        cx={cx}
        cy={cy}
        r={LAMP_R - 0.5}
        fill={on ? prs.switchLampOn : prs.switchLampOff}
        stroke={prs.switchLampBezel}
        strokeWidth={1}
      />
    </>
  );
}

/**
 * Les deux lampes de position d'une aiguille, une par branche.
 *
 * Comme sur le poste réel, la position n'est lisible que sous « test des
 * aiguilles » (`testaigi()` / `testaigo()` du code d'origine) : hors test les
 * deux lampes restent éteintes, et une aiguille dont le contrôle est perdu a
 * exactement le même aspect — c'est le voyant DI qui la signale.
 *
 */
function SwitchDots({ aig, state }: { aig: AigDef; state: PrsState }) {
  const centres = lampCentres(aig);
  const pos = state.aig[aig.id];
  const show = state.testAig && pos !== 0;

  return (
    <g style={{ pointerEvents: 'none' }}>
      <SwitchLamp at={centres.straight} on={show && pos === aig.straight} />
      <SwitchLamp at={centres.deviate} on={show && pos !== aig.straight} />
      {/* Aiguille calée à la main : sans équivalent sur le poste d'origine,
          mais l'information n'apparaît nulle part ailleurs. */}
      {state.mm[aig.id] !== 0 && (
        <rect x={aig.x - 3.5} y={aig.y - 3.5} width={7} height={7} rx={1} fill={prs.amber} />
      )}
    </g>
  );
}

/** Zone de clic transparente au-dessus de chaque aiguille. */
function SwitchHitAreas({
  onSelect,
  selected,
  state,
  onContext,
}: {
  onSelect?: (id: AigId, at: { x: number; y: number }) => void;
  selected: AigId | null;
  state: PrsState;
  onContext?: (target: FaultTarget, at: { x: number; y: number }) => void;
}) {
  return (
    <g>
      {AIGUILLES.map((a) => (
        <g key={a.id}>
          {selected === a.id && (
            <circle cx={a.x} cy={a.y} r={20} fill="none" stroke={prs.blue} strokeWidth={1.5} />
          )}
          {state.faults.aig?.id === a.id && (
            <circle cx={a.x} cy={a.y} r={20} fill="none" stroke={prs.red} strokeWidth={1.6} />
          )}
          {/*
            Cible de clic : toute la figure de contrôle de l'aiguille, et pas
            seulement son pivot. Le triangle couvre la pointe et les deux
            branches ; le trait transparent épais leur donne de la largeur,
            pointes arrondies comprises.
          */}
          <polygon
            points={trianglePoints(a)}
            fill="transparent"
            stroke="transparent"
            strokeWidth={16}
            strokeLinejoin="round"
            style={{ cursor: onSelect ? 'pointer' : 'default' }}
            onClick={onSelect ? (e) => onSelect(a.id, { x: e.clientX, y: e.clientY }) : undefined}
            onContextMenu={
              onContext
                ? (e) => {
                    e.preventDefault();
                    onContext({ kind: 'aig', id: a.id }, { x: e.clientX, y: e.clientY });
                  }
                : undefined
            }
          >
            <title>
              {`Aiguille ${a.label} — contrôle ${
                state.aig[a.id] === 0 ? 'ABSENT' : state.aig[a.id] === 'g' ? 'gauche' : 'droite'
              }${state.mm[a.id] !== 0 ? ' · calée à main' : ''}${state.clemm ? ' · clic : manœuvre au terrain' : ''} · clic droit : dérangement`}
            </title>
          </polygon>
        </g>
      ))}
    </g>
  );
}

// ===== Zones =================================================================

function ZoneBar({
  zone,
  state,
  onContext,
}: {
  zone: ZoneDef;
  state: PrsState;
  onContext?: (target: FaultTarget, at: { x: number; y: number }) => void;
}) {
  const v = displayedZoneState(state, zone.id);
  const fill = ZONE_FILL[v];
  const key = ZONE_FAULT_OF_ZONE[zone.id];
  const title =
    `${zone.label ?? zone.id} — ${ZONE_STATE_LABEL[v].toLowerCase()}` +
    (key ? ' · clic droit : dérangement' : '');

  const len = zoneLength(zone);
  const bar = (cx: number, cy: number) => {
    const x = cx - len / 2;
    return (
      <>
        <rect x={x} y={cy - 4} width={len} height={8} rx={1.5} fill={fill}>
          <title>{title}</title>
        </rect>
        {/* Cible de clic droit : la pastille ne fait que 9 px de haut. */}
        {onContext && key && (
          <rect
            x={x - 3}
            y={cy - 11}
            width={len + 6}
            height={22}
            fill="transparent"
            onContextMenu={(e) => {
              e.preventDefault();
              onContext({ kind: 'zone', id: zone.id }, { x: e.clientX, y: e.clientY });
            }}
          >
            <title>{title}</title>
          </rect>
        )}
      </>
    );
  };

  if (zone.place.on === 'line') {
    const { line, cx } = zone.place;
    return <g>{bar(cx, LINES[line].y)}</g>;
  }

  const { diag, t: at } = zone.place;
  const p = pointOnDiagonal(diag, at);
  return <g transform={`rotate(${p.angle}, ${p.x}, ${p.y})`}>{bar(p.x, p.y)}</g>;
}

// ===== Origines / destinations ===============================================

function EndpointLayer() {
  return (
    <g>
      <g fill={prs.panel} stroke={prs.endpointStroke} strokeWidth={1.6}>
        {ENDPOINTS.map((e) => (
          <circle key={e.label} cx={e.x} cy={e.y} r={14} />
        ))}
      </g>
      <g fill={prs.labelSoft} fontSize={12} fontWeight={600} textAnchor="middle" fontFamily={prsFont.ui}>
        {ENDPOINTS.map((e) => (
          <text key={e.label} x={e.x} y={e.y + 4}>
            {e.label}
          </text>
        ))}
      </g>
    </g>
  );
}

// ===== Signaux ===============================================================

function Signal({
  def,
  state,
  decorative,
  onContext,
}: {
  def: SignalDef;
  state: PrsState;
  decorative?: boolean;
  onContext?: (target: FaultTarget, at: { x: number; y: number }) => void;
}) {
  // Un signal décoratif appartient au poste voisin : Springfield ne le
  // commande pas et n'en **répète pas l'aspect**. Son feu reste donc éteint —
  // le montrer rouge laisserait croire à un carré fermé que l'aiguilleur
  // pourrait ouvrir.
  const closed = decorative ? false : state.signalsDisplay[def.id] === 1;
  const faulted = !decorative && state.faults.signal?.id === def.id;
  const clickable = !decorative && onContext != null;
  const lying = decorative ? false : state.signalsDisplay[def.id] !== state.signals[def.id];

  return (
    <g transform={def.dx ? `translate(${def.dx}, 0)` : undefined}>
      <path
        d={`M${def.x} ${def.y} L${def.x} ${def.elbowY} L${def.armX} ${def.elbowY}`}
        stroke={prs.line}
        strokeWidth={1.8}
        fill="none"
      />
      <circle
        cx={def.lampX}
        cy={def.lampY}
        r={7}
        fill={closed ? prs.red : prs.inset}
        // Cerclé de gris, le feu se lit comme non répété : ni ouvert, ni fermé.
        stroke={decorative ? OFF : def.violet ? '#c9b6f0' : '#f6e9e4'}
        strokeWidth={1.4}
      >
        <title>
          {decorative
            ? `${def.label} — signal du poste voisin : Springfield n'en répète pas l'aspect`
            : `${def.label} — ${closed ? 'fermé' : 'ouvert'}${
                lying ? ' · dérangement : le tableau ment' : ''
              } · clic droit : dérangement`}
        </title>
      </circle>
      {faulted && (
        <circle
          cx={def.lampX}
          cy={def.lampY}
          r={13}
          fill="none"
          stroke={prs.red}
          strokeWidth={1.6}
        />
      )}
      {/* Cible de clic droit : la lampe ne fait que 7 px de rayon. */}
      {clickable && (
        <circle
          cx={def.lampX}
          cy={def.lampY}
          r={17}
          fill="transparent"
          onContextMenu={(ev) => {
            ev.preventDefault();
            onContext({ kind: 'signal', id: def.id }, { x: ev.clientX, y: ev.clientY });
          }}
        >
          <title>{`${def.label} — clic droit : dérangement`}</title>
        </circle>
      )}
      {lying && (
        <circle
          cx={def.lampX}
          cy={def.lampY}
          r={10.5}
          fill="none"
          stroke={prs.amber}
          strokeWidth={1.2}
          strokeDasharray="2.5 2.5"
        />
      )}
    </g>
  );
}

// ===== Zones d'approche ======================================================

function ZapLayer({ state }: { state: PrsState }) {
  return (
    <g>
      {ZAPS.map((z) => {
        const v = state.zap[z.id];
        // Vert = pas d'approche (état normal), rouge = enclenchement actif,
        // ambre = approche décelée et libérable.
        const fill = v === 0 ? prs.green : v === 1 ? prs.red : prs.amber;
        return (
          <g key={z.id}>
            <circle cx={z.x} cy={z.y} r={5} fill={fill}>
              <title>
                {`${z.id} — ${
                  v === 0
                    ? "pas d'approche"
                    : v === 1
                      ? "enclenchement d'approche actif"
                      : 'approche décelée, libérable'
                }`}
              </title>
            </circle>
            <text x={z.labelX} y={z.labelY} fill={prs.label} fontSize={12} fontFamily={prsFont.ui}>
              ZAP
            </text>
          </g>
        );
      })}
    </g>
  );
}

// ===== Voyants ===============================================================

function lampAppearance(
  key: LampDef['key'],
  s: PrsState,
): { fill: string; blink: boolean; title: string } {
  switch (key) {
    case 'vaum':
      return {
        fill: s.vaum === 1 ? prs.green : OFF,
        blink: false,
        title: `Autorisation AU-M — ${s.vaum === 1 ? 'disponible' : 'prise'}`,
      };
    case 'vauac':
      return {
        fill: s.vauac === 1 ? prs.green : OFF,
        blink: false,
        title: `Autorisation d'accès EP MOE — ${s.vauac === 1 ? 'accordée' : 'non accordée'}`,
      };
    case 'di':
      return {
        fill: s.di === 0 ? OFF : prs.red,
        blink: s.di === 1,
        title:
          s.di === 0
            ? "Pas de dérangement d'isolement"
            : s.di === 1
              ? "Dérangement d'isolement — non acquitté"
              : "Dérangement d'isolement — acquitté",
      };
    case 'atr': {
      const annul = s.atrAnnul.some(Boolean);
      const armed = s.atrArmed.some(Boolean);
      return {
        fill: annul ? prs.red : armed ? prs.amber : OFF,
        blink: annul,
        title: annul
          ? 'Annulation de transit active'
          : armed
            ? 'Annulateur actionné'
            : 'Annulateurs au repos',
      };
    }
    case 'annv1':
      return {
        fill: s.annv1 ? prs.blue : OFF,
        blink: false,
        title: `Annonce voie 1 — ${s.annv1 ? 'reçue' : 'aucune'}`,
      };
    case 'annv2':
      return {
        fill: s.annv2 ? prs.blue : OFF,
        blink: false,
        title: `Annonce voie 2 — ${s.annv2 ? 'reçue' : 'aucune'}`,
      };
  }
}

function LampLayer({ state }: { state: PrsState }) {
  return (
    <g>
      {LAMPS.map((l) => {
        const a = lampAppearance(l.key, state);
        return (
          <g key={l.key}>
            <circle cx={l.x} cy={l.y} r={5} fill={a.fill}>
              {a.blink && (
                <animate attributeName="opacity" values="1;0.2;1" dur="1s" repeatCount="indefinite" />
              )}
              <title>{a.title}</title>
            </circle>
            <text
              x={l.labelX}
              y={l.labelY}
              textAnchor={l.anchor}
              fill={prs.label}
              fontSize={12}
              fontFamily={prsFont.ui}
            >
              {l.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// ===== Habillage =============================================================

function DecorLayer() {
  return (
    <g>
      <text x={160} y={50} fill={prs.textMuted} fontSize={12.5} fontStyle="italic" fontFamily={prsFont.ui}>
        EP MOE
      </text>
      <text x={60} y={158} fill={prs.text} fontSize={17} fontWeight={600} fontFamily={prsFont.ui}>V1</text>
      <text x={60} y={308} fill={prs.text} fontSize={17} fontWeight={600} fontFamily={prsFont.ui}>V2</text>

      <rect x={620} y={20} width={58} height={22} rx={4} fill="#1e2836" stroke={prs.borderStrong} />
      <text x={649} y={35} fill={prs.textDim} fontSize={12} textAnchor="middle" fontFamily={prsFont.mono}>
        PRS
      </text>
      <text x={760} y={40} fill={prs.text} fontSize={24} fontWeight={600} letterSpacing={1} fontFamily={prsFont.ui}>
        PRS
      </text>
      <text x={826} y={40} fill={prs.textMuted} fontSize={23} letterSpacing={1.5} fontFamily={prsFont.ui}>
        SPRINGFIELD
      </text>

      <rect x={1170} y={80} width={70} height={26} rx={5} fill="#1e2836" stroke={prs.borderStrong} />
      <text x={1205} y={98} fill={prs.amber} fontSize={14} fontWeight={600} textAnchor="middle" fontFamily={prsFont.ui}>
        BV
      </text>

      <g stroke={prs.textMuted} strokeWidth={1.6} fill="none">
        <path d="M1490 74 L1520 74 M1508 66 L1520 74 L1508 82" />
        <path d="M230 246 L200 246 M212 238 L200 246 L212 254" />
      </g>
      <text x={1488} y={66} fill={prs.textDim} fontSize={14} textAnchor="end" letterSpacing={0.8} fontFamily={prsFont.ui}>
        SHELBYVILLE
      </text>
      <text x={238} y={251} fill={prs.textDim} fontSize={14} letterSpacing={0.8} fontFamily={prsFont.ui}>
        CAPITAL CITY
      </text>
    </g>
  );
}

// ===== Légende ===============================================================

function Legend() {
  const items: { color: string; label: string }[] = [
    { color: ZONE_FILL[0], label: 'Zone libre' },
    { color: ZONE_FILL[1], label: 'Itinéraire tracé' },
    { color: ZONE_FILL[2], label: 'Zone occupée' },
    { color: prs.red, label: 'Signal fermé' },
    { color: prs.green, label: 'Voyant normal' },
  ];
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 18,
        padding: '10px 2px 6px',
        fontFamily: prsFont.mono,
        fontSize: 11,
        color: prs.textFaint,
      }}
    >
      {items.map((i) => (
        <span key={i.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <span
            style={{
              width: 16,
              height: 8,
              borderRadius: 2,
              background: i.color,
              display: 'inline-block',
            }}
          />
          {i.label}
        </span>
      ))}
      <span style={{ marginLeft: 'auto', color: prs.textFaint }}>
        Positions d'aiguille visibles sous « Test aig »
      </span>
    </div>
  );
}
