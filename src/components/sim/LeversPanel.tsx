// Panneau des leviers — interaction principale du PRS.
//
// Click sur un levier → dispatch `toggleLever`. Si une garde refuse
// (incompatibilité, EAP/EPA actif, zone occupée…), Gessie échoue
// silencieusement — on reproduit ce comportement, mais on ajoute un flash
// rouge sur le levier pour donner un feedback minimal.
//
// Visuel : badge "+" (plus, position au repos) ou "−" (minus, position
// active = itinéraire ouvert/aiguille basculée). Cliquer bascule.

import { useState } from 'react';
import { useGessieStore } from '../../store/useGessieStore';

export function LeversPanel() {
  const data = useGessieStore((s) => s.player.data);
  const toggleLever = useGessieStore((s) => s.toggleLever);
  const [refused, setRefused] = useState<string | null>(null);

  if (!data) return null;

  const levers = Object.values(data.levers).sort((a, b) => {
    // Tri naturel : numérique d'abord, puis alpha
    const na = parseInt(a.id, 10);
    const nb = parseInt(b.id, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    if (!isNaN(na)) return -1;
    if (!isNaN(nb)) return 1;
    return a.id.localeCompare(b.id);
  });

  const handleClick = (id: string, positionBefore: 'plus' | 'minus') => {
    toggleLever(id);
    // Vérifie si la position a changé pour détecter un refus silencieux
    setTimeout(() => {
      const after = useGessieStore.getState().player.data?.levers[id]?.position;
      if (after === positionBefore) {
        setRefused(id);
        setTimeout(() => setRefused(null), 600);
      }
    }, 0);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        padding: 12,
        background: '#1a242f',
        borderTop: '1px solid #34495e',
        maxHeight: 200,
        overflowY: 'auto',
      }}
    >
      {levers.map((l) => {
        const isMinus = l.position === 'minus';
        const isRefused = refused === l.id;
        return (
          <button
            key={l.id}
            onClick={() => handleClick(l.id, l.position)}
            title={`${l.affectations.join(', ')}\n${l.keyholes ? Object.keys(l.keyholes).length + ' clé(s)' : ''}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              padding: '4px 10px',
              fontSize: 12,
              fontFamily: 'monospace',
              borderRadius: 3,
              border: `1px solid ${isRefused ? '#e74c3c' : isMinus ? '#f39c12' : '#7f8c8d'}`,
              background: isRefused ? '#7f1d1d' : isMinus ? '#d35400' : '#34495e',
              color: '#ecf0f1',
              cursor: 'pointer',
              minWidth: 64,
              transition: 'background 120ms, border-color 120ms',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>{l.id}</span>
              <span style={{ opacity: 0.7 }}>{isMinus ? '−' : '+'}</span>
            </span>
            {l.affectations.length > 0 && (
              <span
                style={{
                  fontSize: 10,
                  opacity: 0.75,
                  maxWidth: 120,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {l.affectations.join(', ')}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
