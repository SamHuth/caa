import { describe, expect, it } from 'vitest';
import { DECK_SIZE } from './cards';
import { cpuColour, cpuJumpIn, cpuMove } from './cpu';
import { activePlayers, nextPlayer, pileOf, smallestOtherHand, stackOf } from './game';
import { type Difficulty, DEFAULT_SETTINGS, type MatchState, newMatch, reduceMatch } from './match';
import { rand } from './rng';

/** Play whole matches CPU vs CPU, checking invariants after every action. */
function simulate(seed: number, players: number, difficulty: Difficulty) {
  let { state: m } = newMatch(
    { ...DEFAULT_SETTINGS, playerCount: players, cpuDifficulty: difficulty, roundScoreLimit: 100, bestOf: 3 },
    seed,
  );
  const r = { rng: seed };
  const rnd = () => rand(r);
  let steps = 0;

  const step = (next: MatchState) => {
    m = next;
    steps++;
    const g = m.game;
    const total = g.drawPile.length + g.discard.length + g.hands.reduce((s, h) => s + h.length, 0);
    expect(total).toBe(DECK_SIZE);
    const ids = new Set([...g.drawPile, ...g.discard, ...g.hands.flat()].map((c) => c.id));
    expect(ids.size).toBe(DECK_SIZE);
  };

  while (m.phase !== 'matchOver') {
    expect(steps).toBeLessThan(50_000);
    if (m.phase !== 'playing') {
      const res = reduceMatch(m, { type: 'nextGame' });
      expect(res.ok).toBe(true);
      if (res.ok) step(res.state);
      continue;
    }
    const g = m.game;

    // Occasionally let someone jump in.
    if (g.phase === 'play' && rnd() < 0.3) {
      const jumper = Math.floor(rnd() * players);
      const jump = cpuJumpIn(g.hands[jumper], pileOf(g), stackOf(g), difficulty, rnd);
      if (jump && jumper !== g.current && !g.out[jumper]) {
        const res = reduceMatch(m, { type: 'play', player: jumper, cardIds: [jump.cardId] });
        expect(res.ok).toBe(true);
        if (res.ok) step(res.state);
        continue;
      }
    }

    const p = g.chooser ?? g.current;
    if (g.phase === 'chooseSwap') {
      const res = reduceMatch(m, { type: 'swap', player: p, target: smallestOtherHand(g, p) });
      expect(res.ok).toBe(true);
      if (res.ok) step(res.state);
      continue;
    }
    if (g.phase === 'chooseColour') {
      const res = reduceMatch(m, { type: 'chooseColour', player: p, colour: cpuColour(g.hands[p]) });
      expect(res.ok).toBe(true);
      if (res.ok) step(res.state);
      continue;
    }
    const move = cpuMove({
      hand: g.hands[p],
      pile: pileOf(g),
      stack: stackOf(g),
      difficulty,
      nextHandCount: g.hands[nextPlayer(g)].length,
      minOtherHandCount: Math.min(...activePlayers(g).filter((i) => i !== p).map((i) => g.hands[i].length)),
      rand: rnd,
    });
    const action = { ...move, player: p };
    const res = reduceMatch(m, action);
    if (!res.ok) throw new Error(`seed ${seed}: ${res.reason} ${JSON.stringify(action)}`);
    step(res.state);
  }
  return m;
}

describe('simulation', () => {
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    it(`plays full ${difficulty} matches without illegal states`, () => {
      for (let seed = 1; seed <= 40; seed++) {
        const m = simulate(seed * 7919, 2 + (seed % 7), difficulty);
        expect(m.lastResult?.matchWinner).not.toBeNull();
      }
    });
  }
});
