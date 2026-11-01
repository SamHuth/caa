import { handPoints } from './cards';
import { type GameAction, type GameEvent, type GameState, type Reduced, newGame, reduceGame } from './game';
import type { Seeded } from './rng';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Settings {
  playerCount: number;
  cpuDifficulty: Difficulty;
  /** Seconds per turn. */
  turnTimer: number;
  /** Cards dealt to each player, or 'max' to deal out the whole deck. */
  handSize: number | 'max';
  roundScoreLimit: number;
  bestOf: number;
}

export const LIMITS = {
  playerCount: [2, 8],
  turnTimer: [5, 30],
  handSize: [5, 10],
  roundScoreLimit: [50, 500],
  bestOf: [1, 7],
} as const;

export const DEFAULT_SETTINGS: Settings = {
  playerCount: 4,
  cpuDifficulty: 'medium',
  turnTimer: 15,
  handSize: 7,
  roundScoreLimit: 100,
  bestOf: 3,
};

export function roundsToWin(bestOf: number): number {
  return Math.ceil(bestOf / 2);
}

export interface GameResult {
  winner: number;
  /** Sum of the other players' hands. */
  points: number;
  /** Won by being the last to play once everyone else was out, rather than by emptying their hand. */
  lastStanding: boolean;
  /** Set when this game also won the round. */
  roundWinner: number | null;
  matchWinner: number | null;
  /** Hand points left with each player, for the scoreboard. */
  leftover: number[];
}

/**
 * game  = one hand, until someone has 0 cards (or is the last player still in)
 * round = games until someone's score reaches roundScoreLimit
 * match = best of N rounds
 */
export interface MatchState extends Seeded {
  settings: Settings;
  game: GameState;
  scores: number[];
  roundWins: number[];
  round: number;
  gameNumber: number;
  phase: 'playing' | 'gameOver' | 'roundOver' | 'matchOver';
  lastResult: GameResult | null;
}

export type MatchAction = GameAction | { type: 'nextGame' };

export type MatchEvent =
  | GameEvent
  | { type: 'gameOver'; result: GameResult }
  | { type: 'newGame'; round: number; gameNumber: number };

export function newMatch(settings: Settings, seed: number): { state: MatchState; events: MatchEvent[] } {
  const n = settings.playerCount;
  const { state: game, events } = newGame(n, settings.handSize, seed);
  return {
    state: {
      rng: seed ^ 0x5bd1e995,
      settings,
      game,
      scores: Array(n).fill(0),
      roundWins: Array(n).fill(0),
      round: 1,
      gameNumber: 1,
      phase: 'playing',
      lastResult: null,
    },
    events: [{ type: 'newGame', round: 1, gameNumber: 1 }, ...events],
  };
}

export function reduceMatch(prev: MatchState, action: MatchAction): Reduced<MatchState, MatchEvent> {
  if (action.type === 'nextGame') {
    if (prev.phase !== 'gameOver' && prev.phase !== 'roundOver') return { ok: false, reason: 'Game still in progress' };
    const s = structuredClone(prev);
    if (s.phase === 'roundOver') {
      s.round++;
      s.gameNumber = 1;
      s.scores.fill(0);
    } else {
      s.gameNumber++;
    }
    s.rng = (s.rng * 1664525 + 1013904223) | 0;
    const n = s.settings.playerCount;
    const { state: game, events } = newGame(n, s.settings.handSize, s.rng);
    s.game = game;
    s.phase = 'playing';
    return { ok: true, state: s, events: [{ type: 'newGame', round: s.round, gameNumber: s.gameNumber }, ...events] };
  }

  if (prev.phase !== 'playing') return { ok: false, reason: 'Game is over' };
  const r = reduceGame(prev.game, action);
  if (!r.ok) return r;
  const s: MatchState = { ...prev, game: r.state, scores: [...prev.scores], roundWins: [...prev.roundWins] };
  const events: MatchEvent[] = r.events;

  if (r.state.phase === 'over') {
    const winner = r.state.winner!;
    const leftover = r.state.hands.map(handPoints);
    const points = leftover.reduce((sum, p, i) => (i === winner ? sum : sum + p), 0);
    s.scores[winner] += points;
    const lastStanding = r.state.hands[winner].length > 0;
    const result: GameResult = { winner, points, lastStanding, roundWinner: null, matchWinner: null, leftover };
    s.phase = 'gameOver';
    if (s.scores[winner] >= s.settings.roundScoreLimit) {
      s.roundWins[winner]++;
      result.roundWinner = winner;
      s.phase = 'roundOver';
      if (s.roundWins[winner] >= roundsToWin(s.settings.bestOf)) {
        result.matchWinner = winner;
        s.phase = 'matchOver';
      }
    }
    s.lastResult = result;
    events.push({ type: 'gameOver', result });
  }
  return { ok: true, state: s, events };
}
