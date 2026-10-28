import { describe, expect, it } from 'vitest';
import { cardPoints } from './cards';
import { cpuColour, cpuMove, enumeratePlays } from './cpu';
import { pileOf } from './game';
import { DEFAULT_SETTINGS, type MatchAction, type MatchState, type Settings, newMatch, reduceMatch } from './match';
import { makeGame, num, skip, wild } from './testUtils';

function apply(m: MatchState, a: MatchAction) {
  const r = reduceMatch(m, a);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

function rigged(settings: Partial<Settings> = {}): MatchState {
  const { state } = newMatch({ ...DEFAULT_SETTINGS, playerCount: 3, ...settings }, 1);
  const last = num('red', 4);
  state.game = makeGame({
    hands: [[last], [num('blue', 9), skip('green')], [wild(), num('yellow', 0)]],
    top: num('red', 1),
  });
  return state;
}

describe('scoring', () => {
  it('winner scores the points left in every other hand', () => {
    const start = rigged();
    const m = apply(start, { type: 'play', player: 0, cardIds: [start.game.hands[0][0].id] });
    expect(m.phase).toBe('gameOver');
    expect(m.lastResult).toMatchObject({ winner: 0, points: 9 + 10 + 20 + 0 });
    expect(m.scores).toEqual([39, 0, 0]);
  });

  it('reaching the score limit wins the round and resets scores next game', () => {
    const start = rigged({ roundScoreLimit: 30, bestOf: 3 });
    let m = apply(start, { type: 'play', player: 0, cardIds: [start.game.hands[0][0].id] });
    expect(m.phase).toBe('roundOver');
    expect(m.roundWins).toEqual([1, 0, 0]);
    m = apply(m, { type: 'nextGame' });
    expect(m.round).toBe(2);
    expect(m.scores).toEqual([0, 0, 0]);
    expect(m.phase).toBe('playing');
  });

  it('winning enough rounds wins the match', () => {
    const start = rigged({ roundScoreLimit: 30, bestOf: 3 });
    start.roundWins = [1, 0, 0];
    const m = apply(start, { type: 'play', player: 0, cardIds: [start.game.hands[0][0].id] });
    expect(m.phase).toBe('matchOver');
    expect(m.lastResult?.matchWinner).toBe(0);
    expect(reduceMatch(m, { type: 'nextGame' }).ok).toBe(false);
  });
});

describe('last player standing', () => {
  it('wins and scores only the other hands', () => {
    const { state } = newMatch({ ...DEFAULT_SETTINGS, playerCount: 3 }, 1);
    state.game = makeGame({ hands: [[num('blue', 1)], [num('blue', 9), num('green', 4)], [num('yellow', 3)]], top: num('red', 9), drawPile: [], current: 0 });
    state.game.lastPlayer = 1;
    state.game.out[2] = true;
    const m = apply(state, { type: 'draw', player: 0 });
    expect(m.lastResult).toMatchObject({ winner: 1, lastStanding: true, points: 1 + 3, leftover: [1, 13, 3] });
    expect(m.scores).toEqual([0, 4, 0]);
  });
});

describe('cpu', () => {
  it('finds sum combos on hard', () => {
    const hand = [num('green', 2), num('red', 2), num('blue', 3), num('yellow', 11)];
    const g = makeGame({ hands: [hand, []], top: num('green', 7) });
    const plays = enumeratePlays(hand, pileOf(g), null, { doubles: true, sums: true });
    expect(plays.some((p) => p.length === 3)).toBe(true);
  });

  it('draws when nothing is playable', () => {
    const g = makeGame({ hands: [[num('blue', 1)], []], top: num('red', 3) });
    const move = cpuMove({
      hand: g.hands[0],
      pile: pileOf(g),
      stack: null,
      difficulty: 'hard',
      nextHandCount: 5, minOtherHandCount: 5,
      rand: Math.random,
    });
    expect(move).toEqual({ type: 'draw' });
  });

  it('prefers dumping high points on medium', () => {
    const hand = [num('red', 1), num('red', 12), num('blue', 4)];
    const g = makeGame({ hands: [hand, []], top: num('red', 3) });
    const move = cpuMove({ hand, pile: pileOf(g), stack: null, difficulty: 'medium', nextHandCount: 5, minOtherHandCount: 5, rand: () => 0 });
    expect(move).toEqual({ type: 'play', cardIds: [hand[1].id] });
  });

  it('picks its most common colour', () => {
    expect(cpuColour([num('blue', 1), num('blue', 2), num('red', 1)])).toBe('blue');
  });

  it('never picks a play that scores fewer points than an alternative on medium', () => {
    const hand = [num('red', 2), num('red', 9)];
    const g = makeGame({ hands: [hand, []], top: num('red', 3) });
    const move = cpuMove({ hand, pile: pileOf(g), stack: null, difficulty: 'medium', nextHandCount: 5, minOtherHandCount: 5, rand: () => 0 });
    const ids = move?.type === 'play' ? move.cardIds : [];
    expect(cardPoints(hand.find((c) => c.id === ids[0])!)).toBe(9);
  });
});
