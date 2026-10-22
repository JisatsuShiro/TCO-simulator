// Ligne CAPI partagée entre les opérateurs (Voie Libre).
//
// Une seule ligne pour tous les joueurs : le serveur détient l'état, joue les
// dialogues avec le moteur de `src/capi` (compilé dans ./engine par
// `npm run build`) et rediffuse l'état aux postes tenus. L'horloge est celle du
// serveur. La ligne disparaît quand le dernier opérateur la quitte.
//
// Protocole (messages JSON, champ `t`), préfixé `capi-` :
//   client → serveur : capi-login {user, password}
//                      capi-prendre {poste}
//                      capi-dialogue {id, saisie}
//                      capi-commande {cle, valeur}
//                      capi-quitter
//   serveur → client : capi-auth, capi-occupation {occupes},
//                      capi-assis {poste}, capi-etat {ligne, occupes, serveurMs},
//                      capi-resultat {id, resultat}, capi-erreur {code, message}

import { executer } from './engine/dialogues.js';
import { LIGNE, creerLigneDeSession, liberer, reconstruireCantons } from './engine/ligne.js';

const UTILISATEUR = process.env.CAPI_USER || 'rennesp2';
const MOT_DE_PASSE = process.env.CAPI_PASSWORD || 'rennesp2';
const ECHECS_MAX = 5;
const SAISIE_MAX = 80;

/** Ligne en cours, `null` tant que personne n'est assis. */
let ligne = null;
/** poste (indice dans LIGNE) → socket de l'opérateur. */
const sieges = new Map();
/** Sockets ayant donné les bons identifiants. */
const authentifies = new Set();

function send(ws, message) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function erreur(ws, code, message) {
  send(ws, { t: 'capi-erreur', code, message });
}

function occupes() {
  return [...sieges.keys()].sort((a, b) => a - b);
}

function posteDe(ws) {
  for (const [i, s] of sieges) if (s === ws) return i;
  return null;
}

function diffuser() {
  const liste = occupes();
  for (const ws of authentifies) {
    if (posteDe(ws) == null) send(ws, { t: 'capi-occupation', occupes: liste });
  }
  if (ligne == null) return;
  const message = { t: 'capi-etat', ligne, occupes: liste, serveurMs: Date.now() };
  for (const ws of sieges.values()) send(ws, message);
}

function login(ws, msg) {
  if (msg.user === UTILISATEUR && msg.password === MOT_DE_PASSE) {
    ws.capiEchecs = 0;
    authentifies.add(ws);
    send(ws, { t: 'capi-auth' });
    send(ws, { t: 'capi-occupation', occupes: occupes() });
    return;
  }
  ws.capiEchecs = (ws.capiEchecs ?? 0) + 1;
  erreur(ws, 'auth', 'Utilisateur ou mot de passe incorrect.');
  if (ws.capiEchecs >= ECHECS_MAX) ws.close();
}

function prendre(ws, msg) {
  if (!authentifies.has(ws)) return erreur(ws, 'auth', 'Connexion requise.');
  if (posteDe(ws) != null) return erreur(ws, 'deja-assis', 'Vous tenez déjà un poste.');
  const i = msg.poste;
  if (!Number.isInteger(i) || i < 0 || i >= LIGNE.length) {
    return erreur(ws, 'poste-inconnu', 'Gare inconnue.');
  }
  if (sieges.has(i)) {
    erreur(ws, 'poste-pris', `La gare ${LIGNE[i].nom} est déjà tenue par un autre opérateur.`);
    send(ws, { t: 'capi-occupation', occupes: occupes() });
    return;
  }
  if (ligne == null) ligne = creerLigneDeSession();
  sieges.set(i, ws);
  mettreEnService(i);
  send(ws, { t: 'capi-assis', poste: i });
  diffuser();
}

/**
 * Un poste temporaire tenu entre en service à l'arrivée de son opérateur, par le
 * dialogue ES lui-même : s'il y a une annonce, un blocage ou une maintenance dans
 * le canton qu'il scinderait, le dialogue est refusé et le poste reste en
 * cessation de service, comme à la reprise d'une gare réelle.
 */
function mettreEnService(i) {
  if (!LIGNE[i].temporaire) return;
  const poste = ligne.postes[i];
  poste.selecteurEnService = true;
  if (!executer(ligne, i, 'ES', Date.now()).ok) poste.selecteurEnService = false;
}

function dialogue(ws, msg) {
  const i = posteDe(ws);
  if (i == null || ligne == null) return erreur(ws, 'pas-assis', 'Aucun poste tenu.');
  const saisie = typeof msg.saisie === 'string' ? msg.saisie.slice(0, SAISIE_MAX) : '';
  const resultat = executer(ligne, i, saisie, Date.now());
  send(ws, { t: 'capi-resultat', id: msg.id, resultat });
  diffuser();
}

/** Commandes physiques du poste tenu : sélecteur de régime gare, bouchon, liaison CAPI/CRO. */
function commande(ws, msg) {
  const i = posteDe(ws);
  if (i == null || ligne == null) return erreur(ws, 'pas-assis', 'Aucun poste tenu.');
  if (typeof msg.valeur !== 'boolean') return;
  const poste = ligne.postes[i];
  switch (msg.cle) {
    case 'selecteur':
      if (LIGNE[i].temporaire) poste.selecteurEnService = msg.valeur;
      break;
    case 'bouchon':
      poste.bouchon = msg.valeur;
      break;
    case 'liaison':
      poste.liaisonCro = msg.valeur;
      break;
    default:
      return;
  }
  diffuser();
}

/** Libère le poste de `ws` et retire la socket ; la ligne disparaît avec le dernier opérateur. */
export function retirerCapi(ws) {
  authentifies.delete(ws);
  const i = posteDe(ws);
  if (i == null) return;
  sieges.delete(i);
  if (sieges.size === 0) {
    ligne = null;
  } else if (ligne != null) {
    liberer(ligne, i);
    reconstruireCantons(ligne);
  }
  diffuser();
}

export function gererCapi(ws, msg) {
  switch (msg.t) {
    case 'capi-login':
      return login(ws, msg);
    case 'capi-prendre':
      return prendre(ws, msg);
    case 'capi-dialogue':
      return dialogue(ws, msg);
    case 'capi-commande':
      return commande(ws, msg);
    case 'capi-quitter':
      return retirerCapi(ws);
    default:
      return erreur(ws, 'unknown-type', `Type inconnu: ${msg.t}`);
  }
}
