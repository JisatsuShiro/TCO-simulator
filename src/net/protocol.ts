// Types des messages échangés avec le serveur relais de cantonnement.
//
// Miroir TypeScript du protocole implémenté en JS dans `server/index.js`.
// Tout message est un objet JSON discriminé par le champ `t`.

import type { Gare } from './gares';

/** Un membre connecté dans une partie (room). */
export interface Member {
  id: string;
  gare: Gare;
  name: string;
}

/** Train sérialisé pour le handoff entre gares. */
export interface TrainPayload {
  /** Numéro de train conservé d'une gare à l'autre (optionnel). */
  name?: string;
  direction: 'pair' | 'impair';
  size: 'Petit' | 'Moyen' | 'Grand';
  speed: number;
  /** Item d'entrée sur la gare réceptrice (startingPoint). */
  startingPoint: string;
}

// ===== Client → Serveur =====

export interface JoinMessage {
  t: 'join';
  code: string;
  gare: Gare;
  name?: string;
  /** Identité stable du client (reprise propre lors d'une reconnexion). */
  clientId?: string;
}

export interface LeaveMessage {
  t: 'leave';
}

export interface PingMessage {
  t: 'ping';
}

export interface TrainOutMessage {
  t: 'train';
  toGare: Gare;
  train: TrainPayload;
}

/** Changement d'horloge (vitesse/pause, éventuellement réglage du temps). */
export interface ClockSetMessage {
  t: 'clock-set';
  speed?: number;
  simTime?: number;
}

export type ClientMessage =
  | JoinMessage
  | LeaveMessage
  | PingMessage
  | TrainOutMessage
  | ClockSetMessage;

// ===== Serveur → Client =====

export interface JoinedMessage {
  t: 'joined';
  you: Member;
  members: Member[];
}

export interface PresenceMessage {
  t: 'presence';
  members: Member[];
}

export type ServerErrorCode =
  | 'bad-code'
  | 'bad-gare'
  | 'gare-taken'
  | 'bad-json'
  | 'unknown-type';

export interface ErrorMessage {
  t: 'error';
  code: ServerErrorCode;
  message: string;
  gare?: Gare;
}

export interface PongMessage {
  t: 'pong';
}

export interface TrainInMessage {
  t: 'train';
  from: string;
  fromGare: Gare;
  train: TrainPayload;
}

export interface TrainUndeliveredMessage {
  t: 'train-undelivered';
  toGare: Gare;
}

/** État d'horloge autoritatif diffusé par le serveur. */
export interface ClockMessage {
  t: 'clock';
  simTime: number;
  speed: number;
}

export type ServerMessage =
  | JoinedMessage
  | PresenceMessage
  | ErrorMessage
  | PongMessage
  | TrainInMessage
  | TrainUndeliveredMessage
  | ClockMessage;
