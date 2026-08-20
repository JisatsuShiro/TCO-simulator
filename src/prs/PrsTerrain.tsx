// Manœuvre d'une aiguille à pied d'œuvre, en fenêtre sur le TCO.
//
// Le poste d'origine y accède par le tableau : `quuna()` … `qucinqb()`, câblées
// sur les figures d'aiguille, n'ouvrent la vue terrain que sous la clé —
//
//   function quuna() { if (clemm==1) { … location.href="#terrain"; } }
//
// — et cette vue montre deux images : `taig`, l'aiguille vue du sol dans sa
// position réelle, et `lev`, le levier que l'on renverse d'un clic. Le
// commutateur `mm` bascule entre commande au moteur et calage à main.
//
// L'original quittait le TCO pour une page à part. Ici la fenêtre s'ouvre à
// l'endroit cliqué : l'aiguilleur garde le tableau sous les yeux pendant qu'il
// manœuvre au sol, et voit le contrôle se perdre au moment où il le perd.
//
// Sans la clé, un clic sur l'aiguille ne l'ouvre pas : c'est elle, et elle
// seule, qui autorise la manœuvre au sol.

import { useEffect, useRef } from 'react';
import { AIGUILLES } from './topology';
import type { AigId, AigPos } from './topology';
import type { PrsState } from './engine';
import { prs, prsFont } from './theme';

export interface TerrainState {
  aig: AigId;
  x: number;
  y: number;
}

export interface PrsTerrainProps {
  menu: TerrainState;
  state: PrsState;
  onToggleMainMoteur: (id: AigId) => void;
  onThrowLever: (id: AigId) => void;
  onClose: () => void;
}

const posLabel = (p: AigPos) => (p === 'g' ? 'gauche' : 'droite');

export function PrsTerrain({
  menu,
  state,
  onToggleMainMoteur,
  onThrowLever,
  onClose,
}: PrsTerrainProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  // La page se re-rend à chaque tick d'horloge ; on garde une référence stable
  // vers la fermeture pour que les écouteurs ne soient pas reposés sans cesse.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  // Fermeture au clic ailleurs ou sur Échap. Les écouteurs sont posés **au
  // tick suivant** : sans ce délai, l'effet s'exécute pendant que le clic
  // d'ouverture remonte encore vers `window`, et la fenêtre se referme sans
  // jamais s'afficher.
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close.current();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    const attach = () => window.addEventListener('mousedown', away);
    const h = window.setTimeout(attach, 0);
    window.addEventListener('keydown', key);
    return () => {
      window.clearTimeout(h);
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', key);
    };
  }, []);

  const def = AIGUILLES.find((a) => a.id === menu.aig);
  if (!def) return null;

  const aig = menu.aig;
  const controle = state.aig[aig];
  const commande = state.cag[aig];
  const terrain = state.lev[aig];
  const aMain = state.mm[aig] !== 0;
  // Le contrôle suit-il le levier ? C'est ce que l'aiguilleur vient vérifier.
  // Renverser une aiguille calée à main le lui fait perdre : la commande reste
  // où elle était, le levier part ailleurs, et le poste ne contrôle plus rien.
  const perteControle = controle === 0;
  const discordance = controle !== 0 && controle !== terrain;
  const alerte = perteControle || discordance;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Manœuvre au terrain de l'aiguille ${def.label}`}
      style={{
        position: 'fixed',
        left: Math.min(menu.x + 2, window.innerWidth - 300),
        top: Math.min(menu.y + 2, window.innerHeight - 300),
        zIndex: 60,
        width: 276,
        background: prs.panel,
        border: `1px solid ${prs.borderAmber}`,
        borderRadius: prs.radius.md,
        boxShadow: '0 10px 30px rgba(0,0,0,.45)',
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div
        style={{
          font: `600 11px ${prsFont.mono}`,
          color: prs.amber,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
        }}
      >
        Terrain — aiguille {def.label}
      </div>

      <CommutateurMoteurMain aMain={aMain} onChoisir={() => onToggleMainMoteur(aig)} />

      <LevierAuSol pos={terrain} aMain={aMain} onThrow={() => onThrowLever(aig)} />

      <dl
        style={{
          margin: 0,
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: '3px 12px',
          fontSize: 11.5,
          fontFamily: prsFont.mono,
        }}
      >
        <dt style={dt}>Contrôle au poste</dt>
        <dd style={dd}>
          {controle === 0 ? (
            <span style={{ color: prs.red }}>absent</span>
          ) : (
            posLabel(controle as AigPos)
          )}
        </dd>
        <dt style={dt}>Commande</dt>
        <dd style={dd}>{posLabel(commande)}</dd>
        <dt style={dt}>Levier au sol</dt>
        <dd style={dd}>
          <span style={{ color: discordance ? prs.amber : prs.text }}>{posLabel(terrain)}</span>
        </dd>
        <dt style={dt}>Mode</dt>
        <dd style={dd}>{aMain ? <span style={{ color: prs.amber }}>à main</span> : 'moteur'}</dd>
      </dl>

      <p
        style={{
          margin: 0,
          font: `11px ${prsFont.ui}`,
          color: alerte ? prs.amber : prs.textFaint,
          lineHeight: '15px',
        }}
      >
        {perteControle
          ? 'Contrôle perdu : le poste ne sait plus où est cette aiguille, et le TCO n’en montre plus la position.'
          : discordance
            ? 'Le levier ne suit plus le contrôle affiché au poste : le tableau ment tant que l’aiguille reste dans cet état.'
            : aMain
              ? 'Cliquez le levier pour renverser l’aiguille.'
              : 'Passez sur « Main » pour manœuvrer le levier.'}
      </p>
    </div>
  );
}

/**
 * Commutateur Moteur / Main — image `mm` de l'original, `moteur.gif` et
 * `main.gif`, que `mmaig()` fait basculer.
 *
 * Calée à main, l'aiguille échappe à la commande du poste : le moteur ne la
 * reprendra qu'une fois le commutateur rendu, et seulement si le levier se
 * retrouve dans la position commandée.
 */
function CommutateurMoteurMain({
  aMain,
  onChoisir,
}: {
  aMain: boolean;
  onChoisir: () => void;
}) {
  const choix = (main: boolean) => {
    const actif = main === aMain;
    return (
      <button
        key={main ? 'main' : 'moteur'}
        type="button"
        role="radio"
        aria-checked={actif}
        // `mmaig()` bascule : rester sur sa position n'a rien à commuter.
        onClick={actif ? undefined : onChoisir}
        title={
          main
            ? 'Caler l’aiguille à main : elle échappe à la commande du poste'
            : 'Rendre l’aiguille à la commande moteur'
        }
        style={{
          flex: 1,
          padding: '6px 0',
          border: 'none',
          borderRadius: prs.radius.sm,
          background: actif ? (main ? prs.amberBg : prs.button) : 'transparent',
          boxShadow: actif ? `inset 0 0 0 1px ${main ? prs.borderAmber : prs.borderStrong}` : 'none',
          color: actif ? (main ? prs.amber : prs.text) : prs.textFaint,
          font: `600 12px ${prsFont.mono}`,
          cursor: actif ? 'default' : 'pointer',
        }}
      >
        {main ? 'Main' : 'Moteur'}
      </button>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ font: `11px ${prsFont.mono}`, color: prs.textFaint }}>Commutateur M/M</span>
      <div
        role="radiogroup"
        aria-label="Mode de manœuvre de l’aiguille"
        style={{
          display: 'flex',
          gap: 3,
          padding: 3,
          background: prs.inset,
          border: `1px solid ${prs.borderStrong}`,
          borderRadius: prs.radius.md,
        }}
      >
        {choix(false)}
        {choix(true)}
      </div>
    </div>
  );
}

/**
 * Le levier de manœuvre, image `lev` de l'original — `levg.gif` / `levd.gif`.
 *
 * Il bascule d'un clic, mais seulement quand l'aiguille est calée à main :
 * `levaig()` ne fait rien sur une aiguille restée au moteur.
 */
function LevierAuSol({
  pos,
  aMain,
  onThrow,
}: {
  pos: AigPos;
  aMain: boolean;
  onThrow: () => void;
}) {
  const gauche = pos === 'g';
  return (
    <button
      type="button"
      onClick={aMain ? onThrow : undefined}
      disabled={!aMain}
      title={
        aMain ? 'Cliquez pour manœuvrer l’aiguille' : 'Aiguille au moteur : le levier est verrouillé'
      }
      aria-label={`Levier de manœuvre, position ${posLabel(pos)}`}
      style={{
        background: prs.inset,
        border: `1px solid ${aMain ? prs.borderAmber : prs.borderStrong}`,
        borderRadius: prs.radius.sm,
        padding: 4,
        cursor: aMain ? 'pointer' : 'not-allowed',
        opacity: aMain ? 1 : 0.55,
      }}
    >
      <svg width={248} height={78} viewBox="0 0 150 82" aria-hidden="true">
        {/* Le ballast et la traverse porte-levier. */}
        <rect x={0} y={62} width={150} height={20} fill="#1b232f" />
        <rect x={58} y={54} width={34} height={9} rx={2} fill="#3a4657" />
        <circle cx={75} cy={56} r={4.5} fill="#5c6b80" />
        <g
          transform={`rotate(${gauche ? -38 : 38}, 75, 56)`}
          style={{ transition: 'transform 260ms ease' }}
        >
          <rect x={72} y={8} width={6} height={48} rx={2} fill={aMain ? '#d9a94a' : '#7a6a45'} />
          <circle cx={75} cy={8} r={7} fill={aMain ? '#e6c377' : '#8b7a52'} />
        </g>
        {/* Repères des deux positions. */}
        <text
          x={24}
          y={54}
          textAnchor="middle"
          fontSize={11}
          fontFamily={prsFont.mono}
          fill={gauche ? prs.amber : prs.textFaint}
        >
          gauche
        </text>
        <text
          x={126}
          y={54}
          textAnchor="middle"
          fontSize={11}
          fontFamily={prsFont.mono}
          fill={gauche ? prs.textFaint : prs.amber}
        >
          droite
        </text>
      </svg>
    </button>
  );
}

const dt = { color: prs.textFaint, margin: 0 };
const dd = { color: prs.text, margin: 0 };
