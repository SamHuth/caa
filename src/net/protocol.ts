import type { Colour } from '../engine/cards';
import type { MatchEvent, Settings } from '../engine/match';
import type { PlayerView } from '../engine/view';

/** Emoji reactions anyone at the table can send; they float up from the sender's avatar. */
export const REACTIONS = {
  lol: '😂',
  cheeky: '😜',
  angry: '😡',
  sad: '😢',
  skull: '💀',
  beer: '🍺',
  golf: '🏌️',
  fire: '🔥',
  clown: '🤡',
  eyes: '👀',
  party: '🎉',
} as const;

export type ReactionKey = keyof typeof REACTIONS;

export const isReaction = (key: unknown): key is ReactionKey => typeof key === 'string' && Object.hasOwn(REACTIONS, key);

/** Each game opens with a countdown, then the first card flips off the draw pile onto the centre pile. */
export const COUNTDOWN_MS = 3000;
export const CARD_FLIP_MS = 700;

/** Actions a player's client can request (the seat is implied by the connection). */
export type ClientAction =
  | { type: 'play'; cardIds: number[] }
  | { type: 'draw' }
  | { type: 'chooseColour'; colour: Colour }
  | { type: 'swap'; target: number };

export interface Avatar {
  emoji: string;
  /** Background colour, one of the profile palette's hex values. */
  colour: string;
}

export interface SeatInfo {
  name: string;
  avatar: Avatar;
  cpu: boolean;
  /** false when a human has dropped and a CPU is covering their seat. */
  connected: boolean;
}

export interface ClientView extends PlayerView {
  seats: SeatInfo[];
  /** Remaining time for the current actor's turn, measured on the host when sent. */
  turnMsLeft: number | null;
  /** Countdown to the next game after a game/round ends. */
  nextGameMs: number | null;
  /** How long the current game has been running (stops when it ends). */
  gameElapsedMs: number;
  /** Time left before play opens: the countdown plus the first card's flip. Null once play is open. */
  countdownMs: number | null;
  /** Seat that won the previous game, shown with a crown. */
  champion: number | null;
}

export interface LobbyPlayer {
  name: string;
  avatar: Avatar;
  ready: boolean;
  host: boolean;
  connected: boolean;
}

export interface LobbyInfo {
  code: string;
  settings: Settings;
  players: LobbyPlayer[];
  /** Index into players for the receiving client. */
  you: number;
}

export type HostMsg =
  | { t: 'lobby'; lobby: LobbyInfo }
  | { t: 'state'; view: ClientView; events: MatchEvent[] }
  | { t: 'reject'; reason: string }
  | { t: 'react'; seat: number; react: ReactionKey }
  | { t: 'ping'; ts: number }
  | { t: 'closed'; reason: string };

export type GuestMsg =
  | { t: 'join'; name: string; avatar: Avatar; token: string }
  | { t: 'ready'; ready: boolean }
  | { t: 'action'; action: ClientAction }
  | { t: 'react'; react: ReactionKey }
  | { t: 'pong'; ts: number }
  | { t: 'leave' };

/** What the game screen talks to: an in-page HostSession or a WebRTC link to the host. */
export interface Transport {
  send(action: ClientAction): void;
  react(key: ReactionKey): void;
  onMessage(fn: (msg: HostMsg) => void): void;
  leave(): void;
  /** Only available to the host. */
  rematch?(): void;
}
