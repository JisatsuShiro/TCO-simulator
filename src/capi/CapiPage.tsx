// Page CAPI : connexion au serveur, choix de la gare, puis l'écran du poste.
//
// Les identifiants sont vérifiés par le serveur (`server/capi.js`) ; la ligne
// est partagée entre tous les opérateurs connectés.

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { EcranCapi } from './EcranCapi';
import { FOND, MENU_FOND, MENU_TEXTE, TRAIT, trait } from './couleurs';
import { LIGNE } from './ligne';
import { useCapiRoom } from './useCapiRoom';

function ConnexionCapi() {
  const [utilisateur, setUtilisateur] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const status = useCapiRoom((st) => st.status);
  const erreur = useCapiRoom((st) => st.erreur);
  const connecter = useCapiRoom((st) => st.connecter);

  const champ: CSSProperties = {
    padding: '10px 12px',
    fontSize: 18,
    fontFamily: 'inherit',
    background: '#111',
    color: TRAIT,
    border: `1px solid ${TRAIT}`,
    borderRadius: 4,
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: FOND,
        color: TRAIT,
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          connecter(utilisateur, motDePasse);
        }}
        style={{
          border: trait,
          borderRadius: 8,
          padding: 28,
          width: 320,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 400 }}>Connexion CAPI</h2>
        <input
          aria-label="Utilisateur"
          placeholder="Utilisateur"
          autoComplete="username"
          autoFocus
          value={utilisateur}
          onChange={(e) => setUtilisateur(e.target.value)}
          style={champ}
        />
        <input
          aria-label="Mot de passe"
          placeholder="Mot de passe"
          type="password"
          autoComplete="current-password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          style={champ}
        />
        {erreur && (
          <div role="alert" style={{ color: '#ff6b6b', fontSize: 14 }}>
            {erreur}
          </div>
        )}
        <button
          type="submit"
          disabled={status === 'connexion'}
          style={{
            padding: '10px 16px',
            fontSize: 18,
            fontFamily: 'inherit',
            background: MENU_FOND,
            color: MENU_TEXTE,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {status === 'connexion' ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}

function ChoixGare() {
  const occupes = useCapiRoom((st) => st.occupes);
  const erreur = useCapiRoom((st) => st.erreur);
  const prendre = useCapiRoom((st) => st.prendre);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sélection de la gare"
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: FOND,
        color: TRAIT,
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      }}
    >
      <div
        style={{
          border: trait,
          borderRadius: 8,
          padding: 28,
          minWidth: 320,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 400 }}>Sélectionnez votre gare</h2>
        {LIGNE.map((g, i) => {
          const prise = occupes.includes(i);
          return (
            <button
              key={g.code}
              type="button"
              disabled={prise}
              onClick={() => prendre(i)}
              style={{
                padding: '10px 16px',
                fontSize: 20,
                fontFamily: 'inherit',
                background: prise ? '#444' : MENU_FOND,
                color: prise ? '#999' : MENU_TEXTE,
                border: 'none',
                cursor: prise ? 'not-allowed' : 'pointer',
              }}
            >
              {g.nom}
              {prise ? ' (occupée)' : ''}
            </button>
          );
        })}
        {erreur && (
          <div role="alert" style={{ color: '#ff6b6b', fontSize: 14 }}>
            {erreur}
          </div>
        )}
      </div>
    </div>
  );
}

export function CapiPage() {
  const status = useCapiRoom((st) => st.status);

  // Quitter la page libère la gare et, avec le dernier opérateur, la ligne.
  useEffect(() => () => useCapiRoom.getState().quitter(), []);

  if (status === 'assis') return <EcranCapi />;
  if (status === 'choix') return <ChoixGare />;
  return <ConnexionCapi />;
}
