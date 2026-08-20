// Ce que le poste met sous les yeux de l'aiguilleur.
//
// Le poste d'origine passe tout en `alert()` — 745 dans `gaestro.js` :
//
//   function ttrois()
//   { … alert(dial()); … }
//   function taquatreat()
//   { … dsoalert(); alert("… je viens de dérailler sur l'aiguille 85b !"); … }
//
// La modale **bloque** tout jusqu'au clic. C'est brutal, et c'est juste sur le
// fond : ni un conducteur arrêté au carré ni un déraillement n'attendent qu'on
// veuille bien les lire. Mais bloquer ne se transpose pas — le poste tourne ici
// sur une horloge réelle, et deux trains peuvent parler à la même minute ; une
// modale par message gèlerait la gare à chaque incident.
//
// Ils s'empilent donc en bas à droite, chacun se fermant d'un clic. Ils restent
// tant qu'on ne les a pas pris : rien ne se perd de vue, et le poste continue
// de tourner pendant qu'on décide.

import type { MessageKind, PosteMessage } from './engine';
import { prs, prsFont } from './theme';

/**
 * Deux tons, deux gravités.
 *
 * L'appel est ambré comme le reste du poste : il demande une réponse. L'incident
 * est rouge et se lit sans guillemets — ce n'est pas quelqu'un qui parle, c'est
 * la gare qui s'arrête.
 */
const TONS: Record<MessageKind, { titre: string; accent: string; cite: boolean; pris: string }> = {
  appel: { titre: 'Appel', accent: prs.amber, cite: true, pris: 'Reçu' },
  incident: { titre: 'Incident', accent: '#e5484d', cite: false, pris: 'Pris en compte' },
};

export interface PrsAppelsProps {
  messages: PosteMessage[];
  onAcquitter: (seq: number) => void;
}

export function PrsAppels({ messages, onAcquitter }: PrsAppelsProps) {
  if (messages.length === 0) return null;

  return (
    <div
      // `aria-live` : le message arrive sans que rien n'ait été cliqué.
      role="log"
      aria-live="polite"
      aria-label="Messages du poste"
      style={{
        position: 'fixed',
        right: 18,
        bottom: 18,
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        width: 'min(380px, calc(100vw - 36px))',
        pointerEvents: 'none',
      }}
    >
      {messages.map((m) => (
        <Message key={m.seq} message={m} onAcquitter={onAcquitter} />
      ))}
    </div>
  );
}

function Message({
  message,
  onAcquitter,
}: {
  message: PosteMessage;
  onAcquitter: (seq: number) => void;
}) {
  const ton = TONS[message.kind];

  return (
    <div
      style={{
        pointerEvents: 'auto',
        background: prs.panel,
        border: `1px solid ${ton.accent}`,
        borderLeft: `3px solid ${ton.accent}`,
        borderRadius: prs.radius.md,
        boxShadow: '0 10px 30px rgba(0,0,0,.5)',
        padding: '11px 13px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div
        style={{
          font: `600 11px ${prsFont.mono}`,
          color: ton.accent,
          letterSpacing: 0.7,
          textTransform: 'uppercase',
        }}
      >
        {/* La réplique nomme déjà le train — « Salut, le 135359 arrêté devant
            le C 81 fermé » — l'en-tête ne le répète pas, il le repère : quatre
            messages peuvent tenir l'écran en même temps. */}
        {ton.titre} · {message.num}
      </div>
      <p style={{ margin: 0, font: `13px/18px ${prsFont.ui}`, color: prs.text }}>
        {ton.cite ? `« ${message.text} »` : message.text}
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => onAcquitter(message.seq)}
          style={{
            padding: '5px 12px',
            borderRadius: prs.radius.sm,
            background: 'transparent',
            border: `1px solid ${prs.borderStrong}`,
            color: prs.textDim,
            font: `12px ${prsFont.ui}`,
            cursor: 'pointer',
          }}
        >
          {ton.pris}
        </button>
      </div>
    </div>
  );
}
