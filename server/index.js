// Serveur relais WebSocket pour le cantonnement multijoueur de Voie Libre.
//
// Rôle : mettre en relation deux (ou trois) opérateurs partageant un même
// « code de partie ». Les navigateurs ne pouvant pas se parler directement,
// ce process relaie les messages entre les membres d'une même room.
//
// Phase 1 (présence) : join / leave / presence + réservation de gare
// (une gare ne peut être prise que par un seul membre dans une room).
// Phase 2 (préparée, non utilisée côté client) : routage des trains entre
// gares voisines via le message `train`.
//
// Déploiement : écoute en local (127.0.0.1:8081 par défaut). Apache l'expose
// en wss://DOMAINE/canton via mod_proxy_wstunnel. Voir README.md.
//
// État volontairement en mémoire (pas de persistance) : une room disparaît
// quand son dernier membre se déconnecte. C'est suffisant pour des sessions
// de formation éphémères.

import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 8081;
const HOST = process.env.HOST || '127.0.0.1';

// Gares ouvertes au cantonnement — doit rester synchronisé avec
// src/net/gares.ts côté front.
const GARES = ['Clelles', 'Vif', 'Monestier'];

const HEARTBEAT_INTERVAL_MS = 30_000;
const CLOCK_BROADCAST_INTERVAL_MS = 1000;

/**
 * rooms: Map<code, Room>
 * Room = { code, members: Map<clientId, Member>, clock: RoomClock }
 * Member = { id, gare, name, ws }
 * RoomClock = { simTime, speed, anchorMs }
 *   - simTime : temps simulé (ms epoch) au dernier « settle ».
 *   - speed   : 0 = pause ; 1 = temps réel ; 2/5/10 = accéléré.
 *   - anchorMs: Date.now() réel au dernier settle (référence d'avancée).
 * L'horloge est autoritative : n'importe quel membre peut changer la vitesse
 * (message `clock-set`) ; le serveur la diffuse à toute la room.
 */
const rooms = new Map();

let nextClientId = 1;

function log(...args) {
  // Horodatage simple pour les logs serveur (suivi sur le VPS).
  console.log(new Date().toISOString(), ...args);
}

function send(ws, message) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/** Sérialise les membres d'une room sans exposer la socket. */
function serializeMembers(room) {
  return [...room.members.values()].map((m) => ({
    id: m.id,
    gare: m.gare,
    name: m.name,
  }));
}

// ===== Horloge de room =====

/** Temps simulé courant : avance avec le temps réel quand speed > 0. */
function currentSimTime(room) {
  const c = room.clock;
  if (c.speed > 0) {
    return c.simTime + (Date.now() - c.anchorMs) * c.speed;
  }
  return c.simTime;
}

/** Fige le temps simulé courant et ré-ancre (avant tout changement de vitesse). */
function settleClock(room) {
  room.clock.simTime = currentSimTime(room);
  room.clock.anchorMs = Date.now();
}

function clockMessage(room) {
  return { t: 'clock', simTime: Math.round(currentSimTime(room)), speed: room.clock.speed };
}

function broadcastClock(room) {
  const msg = clockMessage(room);
  for (const m of room.members.values()) send(m.ws, msg);
}

function handleClockSet(ws, msg) {
  const room = ws.roomCode ? rooms.get(ws.roomCode) : undefined;
  if (!room) return;
  settleClock(room);
  if (typeof msg.simTime === 'number' && Number.isFinite(msg.simTime)) {
    room.clock.simTime = msg.simTime;
  }
  if (typeof msg.speed === 'number' && Number.isFinite(msg.speed) && msg.speed >= 0) {
    room.clock.speed = msg.speed;
  }
  broadcastClock(room);
}

/** Diffuse la présence courante à tous les membres de la room. */
function broadcastPresence(room) {
  const members = serializeMembers(room);
  for (const m of room.members.values()) {
    send(m.ws, { t: 'presence', members });
  }
}

/** Retire un client de sa room (le cas échéant) et nettoie la room vide. */
function removeClient(ws) {
  const { roomCode, clientId } = ws;
  if (!roomCode || !clientId) return;
  const room = rooms.get(roomCode);
  ws.roomCode = undefined;
  if (!room) return;
  // Ne retire que si le membre stocké est bien CETTE socket : après une reprise
  // (même clientId, nouvelle socket), la fermeture tardive de l'ancienne socket
  // ne doit pas supprimer le membre courant.
  const member = room.members.get(clientId);
  if (!member || member.ws !== ws) return;
  room.members.delete(clientId);
  if (room.members.size === 0) {
    rooms.delete(roomCode);
    log(`room ${roomCode} supprimée (vide)`);
  } else {
    broadcastPresence(room);
  }
}

function handleJoin(ws, msg) {
  const code = typeof msg.code === 'string' ? msg.code.trim().toUpperCase() : '';
  const gare = typeof msg.gare === 'string' ? msg.gare : '';
  const name = typeof msg.name === 'string' ? msg.name.slice(0, 40) : '';

  if (!code) {
    send(ws, { t: 'error', code: 'bad-code', message: 'Code de partie manquant.' });
    return;
  }
  if (!GARES.includes(gare)) {
    send(ws, { t: 'error', code: 'bad-gare', message: 'Gare inconnue.' });
    return;
  }

  // Identité stable fournie par le client (sinon on en attribue une).
  const clientId =
    typeof msg.clientId === 'string' && msg.clientId ? msg.clientId : String(nextClientId++);

  // Si cette socket était déjà dans une room (re-join), on l'en retire d'abord.
  removeClient(ws);

  let room = rooms.get(code);
  if (!room) {
    room = {
      code,
      members: new Map(),
      // Horloge initialisée à l'heure courante, en pause.
      clock: { simTime: Date.now(), speed: 0, anchorMs: Date.now() },
    };
    rooms.set(code, room);
    log(`room ${code} créée`);
  }

  // Reprise : un membre de MÊME identité (reconnexion, double-effet StrictMode)
  // est remplacé — on le retire AVANT le contrôle de gare pour ne pas se voir
  // refuser sa propre gare. Son ancienne socket est neutralisée et fermée.
  const prev = room.members.get(clientId);
  if (prev) {
    room.members.delete(clientId);
    if (prev.ws !== ws) {
      prev.ws.roomCode = undefined;
      try {
        prev.ws.close();
      } catch {
        /* socket déjà morte */
      }
    }
  }

  // Réservation de gare : refus si déjà occupée par un AUTRE membre.
  for (const m of room.members.values()) {
    if (m.gare === gare) {
      send(ws, {
        t: 'error',
        code: 'gare-taken',
        gare,
        message: `La gare ${gare} est déjà occupée dans cette partie.`,
      });
      return;
    }
  }

  ws.clientId = clientId;
  ws.roomCode = code;
  const member = { id: clientId, gare, name, ws };
  room.members.set(clientId, member);

  send(ws, {
    t: 'joined',
    you: { id: member.id, gare: member.gare, name: member.name },
    members: serializeMembers(room),
  });
  // Aligne tout de suite le nouvel arrivant sur l'horloge de la room.
  send(ws, clockMessage(room));
  broadcastPresence(room);
  log(`client ${ws.clientId} a rejoint ${code} en gare ${gare} (${room.members.size} membres)`);
}

// Phase 2 (préparé) : relaie un train vers le membre détenant la gare cible.
function handleTrain(ws, msg) {
  const room = ws.roomCode ? rooms.get(ws.roomCode) : undefined;
  if (!room) return;
  const toGare = msg.toGare;
  for (const m of room.members.values()) {
    if (m.gare === toGare && m.ws !== ws) {
      send(m.ws, { t: 'train', from: ws.clientId, fromGare: room.members.get(ws.clientId)?.gare, train: msg.train });
      return;
    }
  }
  // Aucun opérateur sur la gare cible : le train « disparaît » (gare non tenue).
  send(ws, { t: 'train-undelivered', toGare });
}

function handleMessage(ws, raw) {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    send(ws, { t: 'error', code: 'bad-json', message: 'Message illisible.' });
    return;
  }
  switch (msg.t) {
    case 'join':
      handleJoin(ws, msg);
      break;
    case 'leave':
      removeClient(ws);
      break;
    case 'ping':
      send(ws, { t: 'pong' });
      break;
    case 'clock-set':
      handleClockSet(ws, msg);
      break;
    case 'train':
      handleTrain(ws, msg);
      break;
    default:
      send(ws, { t: 'error', code: 'unknown-type', message: `Type inconnu: ${msg.t}` });
  }
}

const wss = new WebSocketServer({ host: HOST, port: PORT });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  ws.on('message', (raw) => handleMessage(ws, raw));
  ws.on('close', () => removeClient(ws));
  ws.on('error', () => removeClient(ws));
});

// Heartbeat : détecte et coupe les sockets mortes (onglet fermé brutalement,
// réseau perdu) pour que la présence reste exacte.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      ws.terminate();
    }
  }
}, HEARTBEAT_INTERVAL_MS);

// Diffusion de l'horloge : 1×/s pour les rooms en marche (speed > 0). En pause,
// aucun trafic (l'état est figé ; un arrivant est aligné via le message `clock`
// envoyé au join, et chaque `clock-set` rediffuse immédiatement).
const clockTick = setInterval(() => {
  for (const room of rooms.values()) {
    if (room.clock.speed > 0 && room.members.size > 0) {
      broadcastClock(room);
    }
  }
}, CLOCK_BROADCAST_INTERVAL_MS);

wss.on('close', () => {
  clearInterval(heartbeat);
  clearInterval(clockTick);
});

log(`Serveur cantonnement à l'écoute sur ws://${HOST}:${PORT}`);
