// Écran d'un poste CAPI, d'après l'article 3 et la capture de la maquette :
// neuf zones (E1 à E9) et une barre des menus. Il ne fait que relire l'état de
// la ligne (`ligne.ts`) et la session de l'opérateur (`session.ts`).

import { useEffect, useReducer, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  ALERTE,
  FOND,
  GRIS,
  MENU_FOND,
  MENU_TEXTE,
  POSTE_LOCAL,
  SENS_IMPAIR,
  SENS_PAIR,
  TRAIT,
  trait,
} from './couleurs';
import {
  LIGNE,
  cantonEntre,
  horloge,
  maintenanceProche,
  messagesVisibles,
  voisins,
} from './ligne';
import type { Canton, Ligne, Sens, TrainCanton } from './ligne';
import { aideDeCle } from './menus';
import { menusDuPoste, nouvelleSession, toucher } from './session';
import type { Session } from './session';
import { maintenantServeur, useCapiRoom } from './useCapiRoom';

/** Largeur fixe de la fenêtre de dialogue : celle du dialogue précédent et du dialogue en cours. */
const LARGEUR_DIALOGUE = 452;
const VERSION_LOGICIEL = 'V 2.8';

const COULEUR_ALARME = { 1: TRAIT, 2: SENS_IMPAIR, 3: ALERTE } as const;

const p2 = (n: number) => String(n).padStart(2, '0');

function formaterDate(d: Date): string {
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${p2(d.getFullYear() % 100)}`;
}

function formaterHeure(d: Date): string {
  return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

function nomPoste(i: number): string {
  return `${LIGNE[i].nom.toUpperCase()} (${LIGNE[i].code})`;
}

const texte: CSSProperties = { color: TRAIT, fontSize: 32, fontWeight: 300 };

export function EcranCapi() {
  const ligne = useCapiRoom((st) => st.ligne);
  const poste = useCapiRoom((st) => st.poste);
  const jouer = useCapiRoom((st) => st.jouer);
  const [session] = useState<Session>(nouvelleSession);
  const [panneau, setPanneau] = useState(false);
  const [reel, setReel] = useState(maintenantServeur);
  const [, rafraichir] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const id = window.setInterval(() => setReel(maintenantServeur()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Le clavier appartient au poste tenu. La session (curseur, saisie, alarmes)
  // reste locale ; les dialogues validés partent au serveur.
  useEffect(() => {
    if (ligne == null || poste == null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Un contrôle du simulateur qui a gardé le focus ne doit pas confisquer le
      // clavier de l'opérateur : on le lui reprend à la première frappe.
      if (e.target instanceof HTMLElement && e.target.closest('[data-capi-panneau]')) e.target.blur();
      const maintenant = maintenantServeur();
      if (toucher(ligne, poste, session, e.key, maintenant, { jouer, rafraichir })) {
        e.preventDefault();
        setReel(maintenant);
        rafraichir();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [ligne, poste, session, jouer]);

  if (ligne == null || poste == null) return null;

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: FOND,
        color: TRAIT,
        fontFamily: '"Segoe UI", system-ui, sans-serif',
        position: 'relative',
      }}
    >
      <style>{'@keyframes capi-clignote { 50% { opacity: 0; } }'}</style>
      <Poste ligne={ligne} i={poste} session={session} reel={reel} />
      <button
        type="button"
        aria-label="Simulateur"
        title="Simulateur"
        data-capi-panneau
        onClick={() => setPanneau((v) => !v)}
        style={{
          position: 'absolute',
          top: 6,
          left: 6,
          zIndex: 20,
          width: 28,
          height: 28,
          opacity: 0.45,
          background: 'transparent',
          color: TRAIT,
          border: `1px solid ${TRAIT}`,
          borderRadius: 4,
          cursor: 'pointer',
        }}
      >
        ⚙
      </button>
      {panneau && <PanneauSimulateur ligne={ligne} poste={poste} />}
    </div>
  );
}

// ---- Le poste ---------------------------------------------------------------

interface PosteProps {
  ligne: Ligne;
  i: number;
  session: Session;
  reel: number;
}

function Poste({ ligne, i, session, reel }: PosteProps) {
  const etat = ligne.postes[i];
  const { gauche, droite } = voisins(ligne, i);
  const cantonG = etat.enService && gauche != null ? cantonEntre(ligne, gauche, i) : undefined;
  const cantonD = etat.enService && droite != null ? cantonEntre(ligne, i, droite) : undefined;
  const maintenant = horloge(ligne, reel);
  const hs = !etat.enService;
  const couleurVoisin = hs ? GRIS : TRAIT;

  return (
    <>
      {/* Bandeau : E7 / E5 | E9 | E8 / E6 */}
      <div style={{ display: 'flex', height: 216, borderBottom: trait, flexShrink: 0 }}>
        <Demi
          cote="gauche"
          ligne={ligne}
          i={i}
          voisin={gauche}
          canton={etat.maintenance ? undefined : cantonG}
          couleur={couleurVoisin}
        />
        <div
          style={{
            flex: 1,
            borderLeft: trait,
            borderRight: trait,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
            paddingTop: 14,
          }}
        >
          <div style={{ ...texte, color: POSTE_LOCAL }}>{nomPoste(i)}</div>
          <div style={{ ...texte, display: 'flex', gap: 36 }}>
            <span>{formaterDate(maintenant)}</span>
            <span>{formaterHeure(maintenant)}</span>
          </div>
          {etat.maintenance && <div style={{ ...texte, fontSize: 20 }}>{VERSION_LOGICIEL}</div>}
          {hs && !etat.maintenance && (
            <div style={{ ...texte, fontSize: 18, textAlign: 'center', lineHeight: 1.2 }}>
              POSTE EN SITUATION
              <br />
              CESSATION DE SERVICE
            </div>
          )}
        </div>
        <Demi
          cote="droite"
          ligne={ligne}
          i={i}
          voisin={droite}
          canton={etat.maintenance ? undefined : cantonD}
          couleur={couleurVoisin}
        />
      </div>

      {/* E3 | E4 : messages échangés avec les postes encadrants */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative' }}>
        <Messages canton={cantonG} reel={reel} />
        <div style={{ width: 2, background: TRAIT, flexShrink: 0 }} />
        <Messages canton={cantonD} reel={reel} />
        {session.vue === 'etat' && <EtatLigne ligne={ligne} />}
        {session.info.length > 0 && !session.vue && (
          <div style={{ position: 'absolute', left: 16, bottom: 8, color: MENU_FOND, fontSize: 20 }}>
            {session.info.map((t) => (
              <div key={t}>{t}</div>
            ))}
          </div>
        )}
      </div>

      <BarreMenus ligne={ligne} i={i} session={session} />
      <Dialogue session={session} />
    </>
  );
}

/** Moitié du bandeau : nom du poste encadrant (E7/E8), blocage, maintenance et fenêtres de trains (E5/E6). */
function Demi({
  cote,
  ligne,
  i,
  voisin,
  canton,
  couleur,
}: {
  cote: Sens;
  ligne: Ligne;
  i: number;
  voisin: number | null;
  canton: Canton | undefined;
  couleur: string;
}) {
  const enMaintenance = canton ? maintenanceProche(ligne, i, cote) : null;
  const [premier, second] = canton?.trains ?? [];
  // La première fenêtre est du côté du poste vers lequel le train se dirige.
  const fenetres: Array<TrainCanton | undefined> = premier?.vers === 'gauche' ? [premier, second] : [second, premier];

  const blocage = canton && canton.ib.length > 0 && (
    <div
      role="img"
      aria-label="Symbole de blocage"
      style={{
        width: 110,
        height: 44,
        background: '#d01010',
        color: '#fff',
        fontSize: 28,
        lineHeight: '44px',
        textAlign: 'center',
        flexShrink: 0,
      }}
    >
      {canton.ib.includes(canton.a) ? '◄' : ''}
      {canton.ib.includes(canton.a) && canton.ib.includes(canton.b) ? ' ' : ''}
      {canton.ib.includes(canton.b) ? '►' : ''}
    </div>
  );
  const emplacementBlocage = <div style={{ width: 110, height: 44, flexShrink: 0 }}>{blocage}</div>;
  const maintenance = (
    <div style={{ flex: 1, color: ALERTE, fontSize: 22, lineHeight: '44px', textAlign: 'center' }}>
      {enMaintenance != null ? `(${LIGNE[enMaintenance].code}) MAINTENANCE` : ''}
    </div>
  );

  return (
    <div style={{ flex: 1.6, display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          height: 68,
          borderBottom: trait,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 36,
          color: couleur,
          ...texte,
        }}
      >
        {voisin != null && (
          <>
            <span>{LIGNE[voisin].nom.toUpperCase()}</span>
            <span>({LIGNE[voisin].code})</span>
          </>
        )}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {cote === 'gauche' ? (
            <>
              {emplacementBlocage}
              {maintenance}
            </>
          ) : (
            <>
              {maintenance}
              {emplacementBlocage}
            </>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 28 }}>
          {fenetres.map((t, k) => (
            <FenetreTrain key={k} train={t} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FenetreTrain({ train }: { train: TrainCanton | undefined }) {
  const couleur = train?.vers === 'droite' ? SENS_IMPAIR : SENS_PAIR;
  const numero = train ? `${train.numero}${train.cle ? '+' : ''}` : '';
  return (
    <div
      style={{
        width: 210,
        height: 44,
        border: train ? `1px solid ${TRAIT}` : `1px dashed ${GRIS}`,
        color: couleur,
        fontSize: 26,
        lineHeight: '42px',
        textAlign: 'center',
        whiteSpace: 'nowrap',
        animation: train?.clignote ? 'capi-clignote 1s step-end infinite' : undefined,
      }}
    >
      {train && (train.vers === 'gauche' ? `◄ ${numero}` : `${numero} ►`)}
    </div>
  );
}

function Messages({ canton, reel }: { canton: Canton | undefined; reel: number }) {
  const messages = canton ? messagesVisibles(canton, reel) : [];
  return (
    <div style={{ flex: 1, padding: '12px 16px', fontSize: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {messages.map((m, k) => (
        <div key={`${k}-${m.texte}`}>{m.texte}</div>
      ))}
    </div>
  );
}

function EtatLigne({ ligne }: { ligne: Ligne }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: FOND,
        padding: 24,
        fontSize: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ color: MENU_FOND }}>Etat de la ligne</div>
      {LIGNE.map((g, k) => {
        const etat = ligne.postes[k];
        const situation = etat.maintenance ? 'en maintenance' : etat.enService ? 'en service' : 'cessation de service';
        return (
          <div key={g.code} style={{ display: 'flex', gap: 24 }}>
            <span style={{ width: 70 }}>{g.code}</span>
            <span style={{ width: 260 }}>{g.nom}</span>
            <span style={{ width: 260 }}>{situation}</span>
            <span style={{ color: etat.liaisonCro ? TRAIT : ALERTE }}>
              liaison CAPI/CRO {etat.liaisonCro ? 'en marche' : 'à l’arrêt'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---- Barre des menus et zone de dialogue ------------------------------------

function BarreMenus({ ligne, i, session }: { ligne: Ligne; i: number; session: Session }) {
  const menus = menusDuPoste(ligne, i);
  return (
    <div style={{ display: 'flex', background: MENU_FOND, flexShrink: 0, position: 'relative', zIndex: 5 }}>
      {menus.map((m, k) => {
        const actif = k === session.menu;
        return (
          <div
            key={m.nom}
            aria-current={actif || undefined}
            style={{
              flex: 1,
              position: 'relative',
              textAlign: 'center',
              padding: '4px 0',
              fontSize: 24,
              background: actif ? MENU_TEXTE : undefined,
              color: actif ? MENU_FOND : MENU_TEXTE,
              borderLeft: k === 0 ? 'none' : `1px solid ${FOND}`,
              whiteSpace: 'nowrap',
            }}
          >
            {m.nom}
            {actif && session.ouvert && (
              <ul
                role="menu"
                style={{
                  position: 'absolute',
                  top: '100%',
                  [k >= menus.length / 2 ? 'right' : 'left']: 0,
                  margin: 0,
                  padding: 0,
                  listStyle: 'none',
                  width: 'max-content',
                  background: MENU_FOND,
                  border: `1px solid ${FOND}`,
                  textAlign: 'left',
                  zIndex: 10,
                }}
              >
                {m.items.map((it, n) => (
                  <li
                    key={it.cle || it.libelle}
                    role="menuitem"
                    aria-current={n === session.item || undefined}
                    style={{
                      padding: '3px 14px',
                      fontSize: 20,
                      background: n === session.item ? MENU_TEXTE : undefined,
                      color: n === session.item ? MENU_FOND : MENU_TEXTE,
                    }}
                  >
                    <b style={{ display: 'inline-block', width: 34 }}>{it.cle}</b>
                    {it.libelle}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Dialogue({ session }: { session: Session }) {
  const cle = session.saisie.slice(0, 2);
  const suite = session.saisie.slice(2);
  const cellule: CSSProperties = {
    height: 42,
    background: MENU_FOND,
    color: MENU_TEXTE,
    fontSize: 24,
    lineHeight: '42px',
    whiteSpace: 'pre',
  };

  return (
    <div
      style={{
        position: 'relative',
        height: 230,
        flexShrink: 0,
        padding: '0 0 8px 24px',
        display: 'flex',
        gap: 24,
      }}
    >
      {/* E1 : dialogue en cours et dialogue précédent */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 6, minWidth: 0 }}>
        <div style={{ marginLeft: 20, height: 22, color: MENU_FOND, fontSize: 16 }}>
          {aideDeCle(cle)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            aria-hidden="true"
            style={{
              width: 0,
              height: 0,
              borderTop: '20px solid transparent',
              borderBottom: '20px solid transparent',
              borderLeft: '20px solid #e01010',
            }}
          />
          <div style={{ ...cellule, width: 54, paddingLeft: 6 }}>{cle}</div>
          <div style={{ width: 2, height: 42, background: FOND }} />
          <div style={{ ...cellule, width: LARGEUR_DIALOGUE - 56, paddingLeft: 8, boxSizing: 'border-box', overflow: 'hidden' }}>
            {suite}
            {session.saisie.length > 0 && <span style={{ animation: 'capi-clignote 1s step-end infinite' }}>▌</span>}
          </div>
        </div>
        <div style={{ ...cellule, marginLeft: 20, width: LARGEUR_DIALOGUE, paddingLeft: 8, boxSizing: 'border-box', overflow: 'hidden' }}>
          {session.precedent}
        </div>
      </div>

      {/* E2 : alarmes, la plus récente en tête */}
      <ul
        aria-label="Alarmes"
        style={{
          margin: '0 24px 0 auto',
          padding: 0,
          listStyle: 'none',
          alignSelf: 'flex-end',
          width: '36%',
          fontSize: 18,
        }}
      >
        {session.alarmes.slice(0, 6).map((a, k) => (
          <li
            key={`${a.heure}-${k}-${a.n}`}
            style={{
              padding: '0 8px',
              background: k === session.sel ? COULEUR_ALARME[a.niveau] : undefined,
              color: k === session.sel ? MENU_TEXTE : COULEUR_ALARME[a.niveau],
            }}
          >
            {k === 5 && session.alarmes.length > 6 ? '* ' : ''}
            {a.n} : {a.libelle}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- Simulateur ---------------------------------------------------------------

/**
 * Commandes physiques qu'un opérateur manipule hors du clavier CAPI : sélecteur
 * de régime gare, bouchon de maintenance, commutateur LIAISON CAPI / CRO. Elles
 * ne concernent que le poste tenu et passent par le serveur.
 */
function PanneauSimulateur({ ligne, poste }: { ligne: Ligne; poste: number }) {
  const commande = useCapiRoom((st) => st.commande);
  const etat = ligne.postes[poste];
  const ligneChamp = (children: ReactNode) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>{children}</label>
  );

  return (
    <div
      data-capi-panneau
      style={{
        position: 'absolute',
        top: 40,
        left: 6,
        zIndex: 20,
        width: 280,
        padding: 14,
        background: '#1a1a1a',
        border: `1px solid ${TRAIT}`,
        borderRadius: 6,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <strong style={{ fontSize: 14 }}>Simulateur · {LIGNE[poste].nom}</strong>
      {LIGNE[poste].temporaire &&
        ligneChamp(
          <>
            <input
              type="checkbox"
              checked={etat.selecteurEnService}
              onChange={(e) => commande('selecteur', e.target.checked)}
            />
            Sélecteur de régime gare sur ES
          </>,
        )}
      {ligneChamp(
        <>
          <input type="checkbox" checked={etat.bouchon} onChange={(e) => commande('bouchon', e.target.checked)} />
          Bouchon de maintenance en place
        </>,
      )}
      {ligneChamp(
        <>
          <input
            type="checkbox"
            checked={etat.liaisonCro}
            onChange={(e) => commande('liaison', e.target.checked)}
          />
          Liaison CAPI / CRO en marche
        </>,
      )}
    </div>
  );
}
