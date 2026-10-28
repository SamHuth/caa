import type { Card, Colour } from './cards';
import { type GameState, stackOf } from './game';
import type { GameResult, MatchEvent, MatchState, Settings } from './match';
import type { DrawStack } from './rules';

/** What one seat is allowed to see. Other players' hands are reduced to counts. */
export interface PlayerView {
  you: number;
  hand: Card[];
  handCounts: number[];
  top: Card;
  colour: Colour;
  drawCount: number;
  current: number;
  gamePhase: GameState['phase'];
  direction: 1 | -1;
  matchPhase: MatchState['phase'];
  /** Player picking a colour or a hand to swap with. */
  chooser: number | null;
  drawnThisTurn: number;
  /** Players knocked out of this game (passed after the draw pile ran out). */
  out: boolean[];
  /** Draw penalty stacked on the current player, if any. */
  stack: DrawStack | null;
  turn: number;
  scores: number[];
  roundWins: number[];
  round: number;
  gameNumber: number;
  settings: Settings;
  lastResult: GameResult | null;
}

export function redact(m: MatchState, seat: number): PlayerView {
  const g = m.game;
  return {
    you: seat,
    hand: g.hands[seat],
    handCounts: g.hands.map((h) => h.length),
    top: g.discard[g.discard.length - 1],
    colour: g.colour,
    drawCount: g.drawPile.length,
    current: g.current,
    gamePhase: g.phase,
    direction: g.direction,
    matchPhase: m.phase,
    chooser: g.chooser,
    drawnThisTurn: g.drawnThisTurn,
    out: g.out,
    stack: stackOf(g),
    turn: g.turn,
    scores: m.scores,
    roundWins: m.roundWins,
    round: m.round,
    gameNumber: m.gameNumber,
    settings: m.settings,
    lastResult: m.lastResult,
  };
}

/** Strip the identity of cards drawn by other players. */
export function redactEvents(events: MatchEvent[], seat: number): MatchEvent[] {
  return events.map((e) => (e.type === 'draw' && e.player !== seat ? { ...e, cards: undefined } : e));
}
