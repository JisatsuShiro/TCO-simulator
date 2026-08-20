// Les imprimés réglementaires, en fenêtre modale.
//
// Le panneau « À disposition » de l'original portait un sélecteur :
//
//   <select name="bulletins" onchange="fbull()">
//     <option value="1">Bulletin Cba
//     <option value="2">Ordres / avis
//     <!--<option value="3">Verif. installation-->   ← retirée par l'auteur
//   </select>
//
// `fbull()` ne fait qu'une chose de plus que d'ouvrir l'imprimé : il le **remet
// à blanc** — décoche les mentions, vide les champs — avant de le présenter.
//
// Sortir un imprimé est un geste rare et délibéré, et le remplir demande de
// l'attention : la fenêtre se place au centre et prend la main, le temps de
// choisir puis de rédiger. On revient au poste en la refermant.

import { useEffect, useRef, useState } from 'react';
import { PrsCba } from './PrsCba';
import { PrsOrdre } from './PrsOrdre';
import { PrsSaat } from './PrsSaat';
import { CBA_TRANSMISSIONS } from './engine';
import type { CbaDraft, OrdreDraft, PrsState, SaatCell } from './engine';
import { prs, prsFont } from './theme';

/**
 * Ce que désigne chaque case du graphique — `rempautocba…()`.
 *
 * Le signal est celui devant lequel ce train est arrêté, et le mode de
 * transmission découle de l'endroit où il se trouve : on remet la feuille en
 * main propre à celui qui est sous la fenêtre du poste, on appelle les autres
 * par téléphone ou par radio.
 */
const DESIGNATION: Partial<Record<SaatCell, { signal: string; trans: string }>> = {
  // `rempautocbaa()` : `numsignal = "C 81"; menta(); mente();`
  v1ag: { signal: 'C 81', trans: CBA_TRANSMISSIONS[2] },
  // `rempautocbab()` : `"C 82"; menta(); mentd();`
  v2n2: { signal: 'C 82', trans: CBA_TRANSMISSIONS[1] },
  // `rempautocbac()` : `"C 84"; menta(); mentd();`
  nu: { signal: 'C 84', trans: CBA_TRANSMISSIONS[1] },
};

/**
 * La voie mère a deux signaux selon d'où vient le train — `rempautocbam()` :
 * `if (trpresvm==1) {"Cv 85"} else {"Cv 88"}`. Un train **annoncé** sur la voie
 * mère est arrêté au Cv 85 ; un train qui s'y engage depuis la voie centrale
 * bute sur le Cv 88.
 */
const designerVoieMere = (trpresvm: boolean) => ({
  signal: trpresvm ? 'Cv 85' : 'Cv 88',
  trans: CBA_TRANSMISSIONS[0],
});

/** Vue courante de la fenêtre : le choix, ou l'un des deux imprimés. */
export type ImprimeVue = 'choix' | 'cba' | 'ordre';

/** Les deux imprimés encore offerts par le poste. */
const IMPRIMES = [
  {
    id: 'cba',
    label: 'Bulletin Cba',
    hint: 'Autorise un train à franchir un carré fermé et à marcher à vue jusqu’à la fin du canton.',
  },
  {
    id: 'ordre',
    label: 'Ordre / Avis',
    hint: 'Quatre propositions à remettre à un conducteur : arrêt, point kilométrique, marche au pas, reprise.',
  },
] as const;

export interface PrsImprimesProps {
  state: PrsState;
  vue: ImprimeVue;
  onVue: (v: ImprimeVue) => void;
  onSendCba: (draft: CbaDraft) => void;
  onCancelCba: () => void;
  onSendOrdre: (draft: OrdreDraft) => void;
  onCancelOrdre: () => void;
  onClose: () => void;
}

export function PrsImprimes({
  state,
  vue,
  onVue,
  onSendCba,
  onCancelCba,
  onSendOrdre,
  onCancelOrdre,
  onClose,
}: PrsImprimesProps) {
  // Feuille pré-remplie par le graphique. La clé s'incrémente à chaque
  // désignation, pour rejouer la recopie même sur le même train.
  const [prefill, setPrefill] = useState<{
    cle: number;
    train: string;
    signal: string;
    trans: string | null;
  } | null>(null);

  const designer = (cell: SaatCell, num: string) => {
    const d = cell === 'vm' ? designerVoieMere(state.trpresvm) : DESIGNATION[cell];
    setPrefill((p) => ({
      cle: (p?.cle ?? 0) + 1,
      train: num,
      signal: d?.signal ?? '',
      trans: d?.trans ?? null,
    }));
  };
  // La page se re-rend à chaque tick d'horloge ; on garde une référence stable
  // vers la fermeture pour que l'écouteur ne soit pas reposé sans cesse.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const surChoix = vue === 'choix';

  return (
    <div
      // Le fond assombri ferme la fenêtre, comme un pas en arrière.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'rgba(4,7,11,.62)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        overflowY: 'auto',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={surChoix ? 'Choix de l’imprimé réglementaire' : 'Imprimé réglementaire'}
        style={{
          width: surChoix ? 'min(560px, 100%)' : 'min(940px, 100%)',
          maxHeight: '100%',
          overflowY: 'auto',
          background: prs.panel,
          border: `1px solid ${prs.borderStrong}`,
          borderRadius: prs.radius.md,
          boxShadow: '0 18px 50px rgba(0,0,0,.55)',
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span
            style={{
              font: `600 12px ${prsFont.mono}`,
              color: prs.textFaint,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
            }}
          >
            Imprimés réglementaires
          </span>
          {!surChoix && (
            <button type="button" onClick={() => onVue('choix')} style={lien}>
              ← Choisir un autre imprimé
            </button>
          )}
        </div>

        {surChoix ? (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {IMPRIMES.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => onVue(i.id)}
                style={{
                  flex: '1 1 220px',
                  textAlign: 'left',
                  padding: '12px 14px',
                  borderRadius: prs.radius.md,
                  background: prs.button,
                  border: `1px solid ${prs.borderStrong}`,
                  color: prs.text,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5,
                }}
              >
                <span style={{ font: `600 15px ${prsFont.ui}` }}>{i.label}</span>
                <span style={{ font: `12px/16px ${prsFont.ui}`, color: prs.textFaint }}>
                  {i.hint}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Le graphique de circulation, en désignation : c'est le
                `saatb` que l'original pose à côté de l'imprimé. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ font: `11px ${prsFont.mono}`, color: prs.textFaint }}>
                Cliquez la circulation destinataire
              </span>
              <PrsSaat state={state} onChange={() => undefined} onPick={designer} nu />
            </div>

            <div style={{ flex: '1 1 420px', minWidth: 340 }}>
              {/* `key` : désigner une circulation remonte l'imprimé, qui
                  repart de la feuille pré-remplie. */}
              {vue === 'cba' ? (
                <PrsCba
                  key={prefill?.cle ?? 0}
                  state={state}
                  onSend={onSendCba}
                  onCancel={onCancelCba}
                  prefill={prefill ? { ...prefill, carre: true } : undefined}
                />
              ) : (
                <PrsOrdre
                  key={prefill?.cle ?? 0}
                  state={state}
                  onSend={onSendOrdre}
                  onCancel={onCancelOrdre}
                  prefill={prefill ?? undefined}
                />
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={pied}>
            {surChoix ? 'Fermer' : 'Ranger l’imprimé'}
          </button>
        </div>
      </div>
    </div>
  );
}

const lien = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  color: prs.textDim,
  font: `12px ${prsFont.ui}`,
  cursor: 'pointer',
  textDecoration: 'underline',
} as const;

const pied = {
  padding: '7px 14px',
  borderRadius: prs.radius.sm,
  background: 'transparent',
  border: `1px solid ${prs.borderStrong}`,
  color: prs.textDim,
  font: `13px ${prsFont.ui}`,
  cursor: 'pointer',
} as const;
