// Imprimé réglementaire « Bulletin Cba » — §10 de `docs/springfield-prs-spec.md`.
//
// Reproduit le formulaire `cba` de `gaestro.html` et sa validation `verifcba()` :
// n° de train, n° de signal, nature du signal (`cbar1`) et mode de transmission
// (`cbar2`) sont tous obligatoires. Le n° de signal est normalisé : « 81 »,
// « c81 », « C 81 » désignent le même carré, « cv88 » / « C 88 » / « 88 » le
// Cv 88.
//
// Comme sur l'imprimé papier, on **raye la mention inutile** : les deux
// premières cases sont exclusives (le signal carré / le guidon d'arrêt), les
// trois suivantes aussi (délivré directement / transmis par téléphone /
// transmis par radio).
//
// C'est le seul document qui autorise un conducteur à franchir un carré fermé,
// et le seul qui relève un train l'ayant déjà franchi — un ordre verbal n'y
// suffit pas.

import { useState } from 'react';
import { CBA_TRANSMISSIONS } from './engine';
import type { CbaDraft, PrsState } from './engine';
import { Panel, Row } from './ui';
import { actionButton, selectStyle } from './styles';
import { prs, prsFont } from './theme';

export interface PrsCbaProps {
  state: PrsState;
  onSend: (draft: CbaDraft) => void;
  onCancel: () => void;
  /**
   * Feuille pré-remplie par le graphique de circulation.
   *
   * La fenêtre remonte l'imprimé à chaque désignation — `key={cle}` — si bien
   * que ces valeurs sont simplement l'état de départ. Désigner une circulation
   * repart donc d'une feuille neuve, comme `rempautocbaa()` qui réécrit le
   * numéro, le signal et les deux mentions d'un coup.
   */
  prefill?: { train: string; signal: string; carre: boolean; trans: string | null };
}

export function PrsCba({ state, onSend, onCancel, prefill }: PrsCbaProps) {
  const [train, setTrain] = useState(prefill?.train ?? '');
  const [signal, setSignal] = useState(prefill?.signal ?? '');
  const [carre, setCarre] = useState(prefill?.carre ?? true);
  const [trans, setTrans] = useState<string | null>(prefill?.trans ?? null);

  const pending = state.cba.pending;

  return (
    <Panel title="Imprimé — Bulletin Cba">
      <Row label={`Autorisation n° ${state.cba.no}`}>
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
        <label style={labelStyle}>
          N° du signal
          <input
            value={signal}
            onChange={(e) => setSignal(e.target.value)}
            placeholder="C 81"
            style={{ ...selectStyle, width: 90, marginLeft: 8 }}
          />
        </label>
      </Row>

      <Row label="Nature du signal">
        <Mention on={carre} onClick={() => setCarre(true)}>
          le signal carré
        </Mention>
        <Mention on={!carre} onClick={() => setCarre(false)}>
          le guidon d’arrêt
        </Mention>
      </Row>

      <Row label="Mode de transmission">
        {CBA_TRANSMISSIONS.map((m) => (
          <Mention key={m} on={trans === m} onClick={() => setTrans(m)}>
            {m}
          </Mention>
        ))}
      </Row>

      <Row label="Transmission">
        <button
          type="button"
          style={actionButton('amber')}
          onClick={() => onSend({ train, signal, carre, trans })}
        >
          Transmettre
        </button>
        <button type="button" style={actionButton()} onClick={onCancel} disabled={!pending}>
          Annuler le bulletin
        </button>
        <span style={{ font: `11.5px ${prsFont.mono}`, color: pending ? prs.amber : prs.textFaint }}>
          {pending
            ? `En attente de prise en compte par le ${state.cba.train}`
            : 'Aucun bulletin en attente'}
        </span>
      </Row>

      <p style={hintText}>
        Le conducteur ne prend le bulletin en compte que s’il est arrêté devant le signal
        désigné. Une erreur de n° de train ou de signal lui fait signaler la faute, et le
        bulletin est perdu.
      </p>
    </Panel>
  );
}

/**
 * Mention de l'imprimé : celle qui n'est pas retenue est **rayée**, comme les
 * sprites `mentionN0/N1.gif` de l'original.
 */
function Mention({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'transparent',
        border: `1px solid ${on ? prs.borderAmber : prs.borderMid}`,
        borderRadius: prs.radius.sm,
        padding: '4px 9px',
        font: `12.5px ${prsFont.ui}`,
        color: on ? prs.amberSoft : prs.textFaint,
        textDecoration: on ? 'none' : 'line-through',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

const labelStyle = {
  display: 'flex',
  alignItems: 'center',
  font: `13px ${prsFont.ui}`,
  color: prs.textDim,
} as const;

const hintText = {
  font: `11.5px/1.5 ${prsFont.ui}`,
  color: prs.textFaint,
  margin: '10px 0 0',
  maxWidth: 560,
} as const;
