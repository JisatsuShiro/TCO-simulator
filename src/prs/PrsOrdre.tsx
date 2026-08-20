// Imprimé réglementaire « Ordre / Avis » — §10 de `docs/springfield-prs-spec.md`.
//
// Reproduit le formulaire `ordr` de `gaestro.html` et sa validation :
//
//   propo()     coche/décoche les 4 propositions et compose le libellé retenu ;
//   aigpa()     désigne l'aiguille de la proposition 3 et coche celle-ci ;
//   corordre()  exige le n° du train destinataire, puis fixe le masque
//               `com = com1 + 10·com2 + 100·com3 + 1000·com4` et `train2`.
//
// L'ordre reste ensuite **en attente** jusqu'à ce que le conducteur concerné le
// collationne : c'est le moteur de trafic qui répond (`comvi()` / `comvz()`),
// et c'est cette réponse qui autorise ou refuse la remise en marche.

import { useState } from 'react';
import { ORDRE_PROPOSITIONS } from './engine';
import type { OrdreDraft, PrsState } from './engine';
import { AIGUILLES } from './topology';
import type { AigId } from './topology';
import { Panel, Row } from './ui';
import { actionButton, selectStyle } from './styles';
import { prs, prsFont } from './theme';

export interface PrsOrdreProps {
  state: PrsState;
  onSend: (draft: OrdreDraft) => void;
  onCancel: () => void;
  /**
   * Numéro désigné au graphique de circulation.
   *
   * L'imprimé Ordre / Avis ne porte pas de signal : seul le destinataire se
   * recopie. L'original avait prévu la même chose — `rempordra()` et ses
   * sœurs sont bien câblées sur les cases du graphique — mais leur corps est
   * resté vide.
   */
  prefill?: { train: string };
}

export function PrsOrdre({ state, onSend, onCancel, prefill }: PrsOrdreProps) {
  const [train, setTrain] = useState(prefill?.train ?? '');
  const [checked, setChecked] = useState<[boolean, boolean, boolean, boolean]>([
    false,
    false,
    false,
    false,
  ]);
  const [aigpas, setAigpas] = useState<AigId | ''>('');

  const toggle = (i: number) =>
    setChecked((c) => {
      const next = [...c] as [boolean, boolean, boolean, boolean];
      next[i] = !next[i];
      return next;
    });

  const pending = state.ordre.com > 0;

  return (
    <Panel title="Imprimé — Ordre / Avis">
      <Row label={`Ordre n° ${state.ordre.no}`}>
        <label style={labelStyle}>
          N° du train
          <input
            value={train}
            onChange={(e) => setTrain(e.target.value)}
            inputMode="numeric"
            placeholder="135359"
            style={{ ...selectStyle, width: 110, marginLeft: 8 }}
          />
        </label>
      </Row>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
        {ORDRE_PROPOSITIONS.map((p, i) => (
          <label key={p.bit} style={{ ...labelStyle, alignItems: 'flex-start', gap: 8 }}>
            <input type="checkbox" checked={checked[i]} onChange={() => toggle(i)} />
            <span>
              {p.text}
              {p.bit === 100 && (
                <select
                  value={aigpas}
                  onChange={(e) => {
                    const v = e.target.value as AigId | '';
                    setAigpas(v);
                    // `aigpa()` coche la proposition 3 dès qu'une aiguille est
                    // désignée.
                    if (v) setChecked((c) => [c[0], c[1], true, c[3]]);
                  }}
                  style={{ ...selectStyle, width: 'auto', marginLeft: 8 }}
                >
                  <option value="">aiguille…</option>
                  {AIGUILLES.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              )}
            </span>
          </label>
        ))}
      </div>

      <Row label="Transmission">
        <button
          type="button"
          style={actionButton('amber')}
          onClick={() => {
            onSend({ train, checked, aigpas: aigpas || null });
            setChecked([false, false, false, false]);
          }}
        >
          Transmettre
        </button>
        <button type="button" style={actionButton()} onClick={onCancel} disabled={!pending}>
          Annuler l’ordre
        </button>
        <span style={{ font: `11.5px ${prsFont.mono}`, color: pending ? prs.amber : prs.textFaint }}>
          {pending
            ? `En attente du collationnement du ${state.ordre.train}`
            : 'Aucun ordre en attente'}
        </span>
      </Row>

      <p style={{ ...hintText, marginTop: 10 }}>
        Le conducteur ne collationne que lorsque son train est joignable. Un ordre verbal ne
        relève pas un train arrêté devant un carré fermé : il répondra qu’il faut « plus qu’un
        ordre verbal », et un bulletin Cba après franchissement.
      </p>
    </Panel>
  );
}

const labelStyle = {
  display: 'flex',
  alignItems: 'center',
  font: `13px ${prsFont.ui}`,
  color: prs.textDim,
  cursor: 'pointer',
} as const;

const hintText = {
  font: `11.5px/1.5 ${prsFont.ui}`,
  color: prs.textFaint,
  margin: 0,
  maxWidth: 560,
} as const;
