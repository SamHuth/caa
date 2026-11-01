import { describe, expect, it } from 'vitest';
import { DECK_SIZE } from './cards';
import { type GameAction, type GameState, newGame, reduceGame, stackOf, topCard } from './game';
import { draw2, draw4, makeGame, num, reverse, skip, smiley, wild } from './testUtils';

function apply(s: GameState, a: GameAction) {
  const r = reduceGame(s, a);
  if (!r.ok) throw new Error(r.reason);
  return r;
}

describe('newGame', () => {
  it('deals hands and starts on a number card', () => {
    const { state } = newGame(4, 7, 123);
    expect(state.hands.every((h) => h.length === 7)).toBe(true);
    expect(topCard(state).kind).toBe('number');
    expect(state.drawPile.length + state.discard.length + 28).toBe(DECK_SIZE);
  });
});

describe('turn flow', () => {
  it('a number card passes the turn on', () => {
    const red5 = num('red', 5);
    const s = makeGame({ hands: [[red5, num('blue', 1)], [num('red', 1)], [num('red', 2)]], top: num('red', 3) });
    const { state } = apply(s, { type: 'play', player: 0, cardIds: [red5.id] });
    expect(state.current).toBe(1);
    expect(topCard(state)).toEqual(red5);
  });

  it('rejects plays out of turn that are not jump-ins', () => {
    const s = makeGame({ hands: [[num('red', 1)], [num('red', 5), num('red', 6)]], top: num('red', 3) });
    expect(reduceGame(s, { type: 'play', player: 1, cardIds: [s.hands[1][0].id] }).ok).toBe(false);
  });

  it('skip skips the next player', () => {
    const sk = skip('red');
    const s = makeGame({ hands: [[sk, num('blue', 1)], [num('red', 1)], [num('red', 2)]], top: num('red', 3) });
    const { state } = apply(s, { type: 'play', player: 0, cardIds: [sk.id] });
    expect(state.current).toBe(2);
  });

  it('skip with two players returns the turn', () => {
    const sk = skip('red');
    const s = makeGame({ hands: [[sk, num('blue', 1)], [num('red', 1)]], top: num('red', 3) });
    expect(apply(s, { type: 'play', player: 0, cardIds: [sk.id] }).state.current).toBe(0);
  });

  it('draw 2 stacks onto the next player, who takes it and is skipped', () => {
    const d2 = draw2('red');
    const s = makeGame({ hands: [[d2, num('blue', 1)], [num('red', 1)], [num('red', 2)]], top: num('red', 3) });
    let { state } = apply(s, { type: 'play', player: 0, cardIds: [d2.id] });
    expect(state.current).toBe(1);
    expect(stackOf(state)).toEqual({ count: 2 });
    expect(reduceGame(state, { type: 'play', player: 1, cardIds: [state.hands[1][0].id] }).ok).toBe(false);
    ({ state } = apply(state, { type: 'draw', player: 1 }));
    expect(state.hands[1]).toHaveLength(3);
    expect(state.current).toBe(2);
    expect(stackOf(state)).toBeNull();
  });

  it('wild waits for a colour then passes on', () => {
    const w = wild();
    const s = makeGame({ hands: [[w, num('blue', 1)], [num('red', 1)], [num('red', 2)]], top: num('red', 3) });
    let { state } = apply(s, { type: 'play', player: 0, cardIds: [w.id] });
    expect(state.phase).toBe('chooseColour');
    expect(reduceGame(state, { type: 'draw', player: 0 }).ok).toBe(false);
    ({ state } = apply(state, { type: 'chooseColour', player: 0, colour: 'blue' }));
    expect(state.colour).toBe('blue');
    expect(state.current).toBe(1);
  });

  it('draw 4 picks a colour, then the next player faces +4', () => {
    const d4 = draw4();
    const s = makeGame({ hands: [[d4, num('blue', 1)], [num('red', 1)], [num('red', 2)]], top: num('red', 3) });
    let { state } = apply(s, { type: 'play', player: 0, cardIds: [d4.id] });
    ({ state } = apply(state, { type: 'chooseColour', player: 0, colour: 'green' }));
    expect(state.current).toBe(1);
    ({ state } = apply(state, { type: 'draw', player: 1 }));
    expect(state.hands[1]).toHaveLength(5);
    expect(state.current).toBe(2);
  });

  it('a sum sets the new top from the last card', () => {
    const cards = [num('green', 2), num('red', 2), num('blue', 3)];
    const s = makeGame({ hands: [[...cards, num('yellow', 9)], [num('red', 1)]], top: num('green', 7) });
    const { state } = apply(s, { type: 'play', player: 0, cardIds: cards.map((c) => c.id) });
    expect(topCard(state)).toEqual(cards[2]);
    expect(state.colour).toBe('blue');
    expect(state.hands[0]).toHaveLength(1);
  });
});

describe('drawing', () => {
  it('draws one card per draw, with no limit, until the player can play', () => {
    const playable = num('red', 9);
    const dead = Array.from({ length: 12 }, () => num('blue', 5));
    const s = makeGame({ hands: [[num('blue', 1)], [num('red', 1)]], top: num('red', 3), drawPile: [playable, ...dead] });
    let state = s;
    for (let i = 0; i < 12; i++) state = apply(state, { type: 'draw', player: 0 }).state;
    expect(state.hands[0]).toHaveLength(13);
    expect(state.current).toBe(0);
    ({ state } = apply(state, { type: 'draw', player: 0 }));
    expect(state.hands[0].at(-1)).toEqual(playable);
    // Holding a playable card: no more drawing.
    expect(reduceGame(state, { type: 'draw', player: 0 }).ok).toBe(false);
    ({ state } = apply(state, { type: 'play', player: 0, cardIds: [playable.id] }));
    expect(state.current).toBe(1);
  });

  it('cannot draw while holding a playable card', () => {
    const s = makeGame({ hands: [[num('red', 1)], [num('red', 1)]], top: num('red', 3) });
    expect(reduceGame(s, { type: 'draw', player: 0 }).ok).toBe(false);
  });

  it('may draw when the only matching card is an action it cannot go out on', () => {
    const s = makeGame({ hands: [[skip('red')], [num('red', 1)]], top: num('red', 3) });
    expect(apply(s, { type: 'draw', player: 0 }).state.hands[0]).toHaveLength(2);
  });

  it('timeout draws 2 and passes', () => {
    const s = makeGame({ hands: [[num('blue', 1)], [num('red', 1)]], top: num('red', 3) });
    const { state } = apply(s, { type: 'timeout', player: 0 });
    expect(state.hands[0]).toHaveLength(3);
    expect(state.current).toBe(1);
  });

  it('timeout during a colour choice picks a colour without penalty', () => {
    const w = wild();
    const s = makeGame({ hands: [[w, num('blue', 1), num('blue', 2)], [num('red', 1)]], top: num('red', 3) });
    let { state } = apply(s, { type: 'play', player: 0, cardIds: [w.id] });
    ({ state } = apply(state, { type: 'timeout', player: 0 }));
    expect(state.colour).toBe('blue');
    expect(state.hands[0]).toHaveLength(2);
  });
});

describe('jump-in', () => {
  it('lets another player play the identical card and continues from them', () => {
    const top = num('red', 5);
    const jump = num('red', 5);
    const s = makeGame({
      hands: [[num('blue', 1)], [num('blue', 2)], [jump, num('green', 1)], [num('yellow', 2)]],
      top,
      current: 0,
    });
    const { state, events } = apply(s, { type: 'play', player: 2, cardIds: [jump.id] });
    expect(events[0]).toMatchObject({ type: 'play', jumpIn: true });
    expect(state.current).toBe(3);
  });

  it('applies the jumped-in card effect from the jumper', () => {
    const top = draw2('blue');
    const jump = draw2('blue');
    const s = makeGame({ hands: [[num('blue', 1)], [jump, num('green', 1)], [num('yellow', 2)]], top, current: 0 });
    const { state } = apply(s, { type: 'play', player: 1, cardIds: [jump.id] });
    expect(state.current).toBe(2);
    expect(stackOf(state)).toEqual({ count: 2 });
  });

  it('can win the game with a number jump-in', () => {
    const jump = num('red', 5);
    const s = makeGame({ hands: [[num('blue', 1)], [jump]], top: num('red', 5), current: 0 });
    const { state } = apply(s, { type: 'play', player: 1, cardIds: [jump.id] });
    expect(state.phase).toBe('over');
    expect(state.winner).toBe(1);
  });

  it('is blocked while a colour is being chosen', () => {
    const w = wild();
    const jump = wild();
    const s = makeGame({ hands: [[w, num('blue', 1)], [jump, num('green', 1)]], top: num('red', 3) });
    const { state } = apply(s, { type: 'play', player: 0, cardIds: [w.id] });
    expect(reduceGame(state, { type: 'play', player: 1, cardIds: [jump.id] }).ok).toBe(false);
  });
});

describe('stacking', () => {
  const setup = (top = num('red', 3)) => {
    const a = draw2('red');
    const b = draw2('green');
    const s = makeGame({ hands: [[a, num('blue', 1)], [b, num('blue', 2)], [num('yellow', 2), num('yellow', 3)]], top });
    return { s, a, b };
  };

  it('a draw 2 on a draw 2 stack adds 2 and passes it on', () => {
    const { s, a, b } = setup();
    let { state } = apply(s, { type: 'play', player: 0, cardIds: [a.id] });
    ({ state } = apply(state, { type: 'play', player: 1, cardIds: [b.id] }));
    expect(stackOf(state)).toEqual({ count: 4 });
    expect(state.current).toBe(2);
    ({ state } = apply(state, { type: 'draw', player: 2 }));
    expect(state.hands[2]).toHaveLength(6);
    expect(state.current).toBe(0);
  });

  it('draw 2s and draw 4s stack on each other', () => {
    const { s, a } = setup();
    const d4 = draw4();
    const d2 = draw2('yellow');
    s.hands[1].push(d4);
    s.hands[2].push(d2);
    let { state } = apply(s, { type: 'play', player: 0, cardIds: [a.id] });
    ({ state } = apply(state, { type: 'play', player: 1, cardIds: [d4.id] }));
    ({ state } = apply(state, { type: 'chooseColour', player: 1, colour: 'blue' }));
    expect(stackOf(state)).toEqual({ count: 6 });
    ({ state } = apply(state, { type: 'play', player: 2, cardIds: [d2.id] }));
    expect(stackOf(state)).toEqual({ count: 8 });
    expect(state.current).toBe(0);
  });

  it('draw 4s stack with each player choosing a colour', () => {
    const x = draw4();
    const y = draw4();
    const s = makeGame({ hands: [[x, num('blue', 1)], [y, num('blue', 2)], [num('yellow', 2)]], top: num('red', 3) });
    let { state } = apply(s, { type: 'play', player: 0, cardIds: [x.id] });
    ({ state } = apply(state, { type: 'chooseColour', player: 0, colour: 'green' }));
    ({ state } = apply(state, { type: 'play', player: 1, cardIds: [y.id] }));
    ({ state } = apply(state, { type: 'chooseColour', player: 1, colour: 'blue' }));
    expect(stackOf(state)).toEqual({ count: 8 });
    expect(state.current).toBe(2);
  });

  it('a jump-in adds to the stack and moves it past the jumper', () => {
    const top = draw2('red');
    const jump = draw2('red');
    const s = makeGame({ hands: [[num('blue', 1)], [num('blue', 2)], [jump, num('green', 1)], [num('yellow', 2)]], top, current: 1 });
    s.pendingDraw = 2;
    const { state } = apply(s, { type: 'play', player: 2, cardIds: [jump.id] });
    expect(stackOf(state)).toEqual({ count: 4 });
    expect(state.current).toBe(3);
  });

  it('timing out on a stack takes the stack', () => {
    const { s, a } = setup();
    let { state } = apply(s, { type: 'play', player: 0, cardIds: [a.id] });
    ({ state } = apply(state, { type: 'timeout', player: 1 }));
    expect(state.hands[1]).toHaveLength(4);
    expect(state.current).toBe(2);
  });
});

describe('smiley 8', () => {
  it('plays like a blue 8 and the next player draws 2, then takes their turn', () => {
    const sm = smiley();
    const s = makeGame({ hands: [[sm, num('red', 1)], [num('red', 1)], [num('red', 2)]], top: num('green', 8) });
    const { state } = apply(s, { type: 'play', player: 0, cardIds: [sm.id] });
    expect(state.colour).toBe('blue');
    expect(state.hands[1]).toHaveLength(3);
    expect(state.current).toBe(1);
    expect(stackOf(state)).toBeNull();
  });

  it('can be added to a draw stack for +2, in any colour, and is not drawn straight away', () => {
    const d2 = draw2('red');
    const sm = smiley();
    const s = makeGame({ hands: [[d2, num('red', 1)], [sm, num('red', 2)], [num('red', 3)]], top: num('red', 3) });
    let { state } = apply(s, { type: 'play', player: 0, cardIds: [d2.id] });
    ({ state } = apply(state, { type: 'play', player: 1, cardIds: [sm.id] }));
    expect(stackOf(state)).toEqual({ count: 4 });
    expect(state.hands[2]).toHaveLength(1);
    expect(state.current).toBe(2);
  });

  it('has no +2 when played as part of a double', () => {
    const sm = smiley();
    const plain = num('blue', 8);
    const s = makeGame({ hands: [[plain, sm, num('red', 1)], [num('red', 2)]], top: num('blue', 2) });
    const { state } = apply(s, { type: 'play', player: 0, cardIds: [plain.id, sm.id] });
    expect(state.hands[1]).toHaveLength(1);
  });
});

describe('reverse', () => {
  it('flips the turn order', () => {
    const rev = reverse('red');
    const s = makeGame({ hands: [[num('red', 1), num('blue', 9)], [rev, num('red', 2)], [num('red', 3)], [num('red', 4)]], top: num('red', 5), current: 1 });
    let { state } = apply(s, { type: 'play', player: 1, cardIds: [rev.id] });
    expect(state.direction).toBe(-1);
    expect(state.current).toBe(0);
    ({ state } = apply(state, { type: 'play', player: 0, cardIds: [state.hands[0][0].id] }));
    expect(state.current).toBe(3);
  });

  it('matches colour or another reverse', () => {
    const s = makeGame({ hands: [[reverse('blue'), num('red', 1)], [num('red', 2)]], top: reverse('red') });
    expect(reduceGame(s, { type: 'play', player: 0, cardIds: [s.hands[0][0].id] }).ok).toBe(true);
  });

  it('acts like a skip with two players', () => {
    const rev = reverse('red');
    const s = makeGame({ hands: [[rev, num('red', 1)], [num('red', 2)]], top: num('red', 5) });
    expect(apply(s, { type: 'play', player: 0, cardIds: [rev.id] }).state.current).toBe(0);
  });

  it('sends draw stacks the other way', () => {
    const rev = reverse('red');
    const d2 = draw2('red');
    const s = makeGame({ hands: [[rev, d2, num('red', 1)], [num('red', 2)], [num('red', 3)]], top: num('red', 5) });
    let { state } = apply(s, { type: 'play', player: 0, cardIds: [rev.id] });
    expect(state.current).toBe(2);
    state.current = 0; // pretend play came back round
    ({ state } = apply(state, { type: 'play', player: 0, cardIds: [d2.id] }));
    expect(state.current).toBe(2);
  });
});

describe('7 swap', () => {
  const setup = () => {
    const seven = num('red', 7);
    const s = makeGame({ hands: [[seven, num('blue', 1), num('blue', 2), num('blue', 3)], [num('red', 1)], [num('green', 1), num('green', 2)]], top: num('red', 3) });
    return { s, seven };
  };

  it('a single 7 lets the player swap hands with anyone', () => {
    const { s, seven } = setup();
    let { state } = apply(s, { type: 'play', player: 0, cardIds: [seven.id] });
    expect(state.phase).toBe('chooseSwap');
    expect(reduceGame(state, { type: 'draw', player: 0 }).ok).toBe(false);
    ({ state } = apply(state, { type: 'swap', player: 0, target: 1 }));
    expect(state.hands[0]).toHaveLength(1);
    expect(state.hands[1]).toHaveLength(3);
    expect(state.current).toBe(1);
  });

  it('is compulsory: timing out swaps with the smallest hand', () => {
    const { s, seven } = setup();
    const { state } = apply(s, { type: 'play', player: 0, cardIds: [seven.id] });
    const after = apply(state, { type: 'timeout', player: 0 }).state;
    expect(after.hands[0]).toHaveLength(1);
    expect(after.hands[1]).toHaveLength(3);
  });

  it('cannot swap with yourself', () => {
    const { s, seven } = setup();
    const { state } = apply(s, { type: 'play', player: 0, cardIds: [seven.id] });
    expect(reduceGame(state, { type: 'swap', player: 0, target: 0 }).ok).toBe(false);
  });

  it('a double 7 cancels the swap', () => {
    const a = num('red', 7);
    const b = num('red', 7);
    const s = makeGame({ hands: [[a, b, num('blue', 1)], [num('red', 1)]], top: num('red', 3) });
    const { state } = apply(s, { type: 'play', player: 0, cardIds: [a.id, b.id] });
    expect(state.phase).toBe('play');
    expect(state.current).toBe(1);
  });

  it('a sum ending in 7 does not swap', () => {
    const s = makeGame({ hands: [[num('red', 2), num('blue', 7), num('blue', 1)], [num('red', 1)]], top: num('red', 9) });
    const { state } = apply(s, { type: 'play', player: 0, cardIds: s.hands[0].slice(0, 2).map((c) => c.id) });
    expect(state.phase).toBe('play');
  });
});

describe('12 rotate', () => {
  it('a single 12 passes every hand to the next player in turn order', () => {
    const twelve = num('red', 12);
    const h1 = [num('blue', 1)];
    const h2 = [num('green', 1), num('green', 2)];
    const s = makeGame({ hands: [[twelve, num('yellow', 1), num('yellow', 2)], h1, h2], top: num('red', 3) });
    const { state } = apply(s, { type: 'play', player: 0, cardIds: [twelve.id] });
    expect(state.hands[1]).toHaveLength(2); // player 0's remaining hand
    expect(state.hands[2]).toEqual(h1);
    expect(state.hands[0]).toEqual(h2);
  });

  it('follows the reversed direction', () => {
    const twelve = num('red', 12);
    const h1 = [num('blue', 1)];
    const s = makeGame({ hands: [[twelve, num('yellow', 1), num('yellow', 2)], h1, [num('green', 1)]], top: num('red', 3) });
    s.direction = -1;
    const { state } = apply(s, { type: 'play', player: 0, cardIds: [twelve.id] });
    expect(state.hands[2]).toHaveLength(2);
    expect(state.hands[0]).toEqual(h1);
  });

  it('a double 12 cancels the rotation', () => {
    const a = num('red', 12);
    const b = num('red', 12);
    const s = makeGame({ hands: [[a, b, num('yellow', 1)], [num('blue', 1)], [num('green', 1)]], top: num('red', 3) });
    const { state } = apply(s, { type: 'play', player: 0, cardIds: [a.id, b.id] });
    expect(state.hands[0]).toHaveLength(1);
    expect(state.hands[0][0].colour).toBe('yellow');
  });
});

describe('empty draw pile', () => {
  // Pile is empty; nobody can play on a red 9 except where noted.
  const game = (hands: ReturnType<typeof num>[][], current = 0) =>
    makeGame({ hands, top: num('red', 9), drawPile: [], current });

  it('never reshuffles: a player who cannot play passes and is out', () => {
    const s = game([[num('blue', 1)], [num('green', 2)], [num('yellow', 3)]]);
    s.discard = [num('red', 4), num('red', 5), num('red', 9)];
    const { state, events } = apply(s, { type: 'draw', player: 0 });
    expect(events).toContainEqual({ type: 'out', player: 0 });
    expect(state.out[0]).toBe(true);
    expect(state.discard).toHaveLength(3);
    expect(state.current).toBe(1);
  });

  it('turns skip players who are out, and they cannot jump in', () => {
    const jump = num('red', 9);
    const s = game([[jump, num('blue', 1)], [num('green', 2)], [num('yellow', 3)], [num('green', 4)]], 1);
    s.out[2] = true;
    const { state } = apply(s, { type: 'draw', player: 1 });
    expect(state.current).toBe(3);
    const blocked = structuredClone(state);
    blocked.out[0] = true;
    expect(reduceGame(blocked, { type: 'play', player: 0, cardIds: [jump.id] }).ok).toBe(false);
  });

  it('when one player is left, the last person to play a card wins', () => {
    const play = num('red', 4);
    const s = game([[num('blue', 1)], [play, num('blue', 2)], [num('yellow', 3)]], 1);
    s.discard = [num('red', 9)];
    let { state } = apply(s, { type: 'play', player: 1, cardIds: [play.id] }); // top red 4
    ({ state } = apply(state, { type: 'draw', player: 2 }));
    expect(state.out[2]).toBe(true);
    const r = apply(state, { type: 'draw', player: 0 });
    expect(r.state.phase).toBe('over');
    expect(r.state.winner).toBe(1);
  });

  it('timing out or facing a stack with nothing to draw also knocks you out', () => {
    let s = game([[num('blue', 1)], [num('green', 2)], [num('yellow', 3)]]);
    expect(apply(s, { type: 'timeout', player: 0 }).state.out[0]).toBe(true);
    s = game([[num('blue', 1)], [num('green', 2)], [num('yellow', 3)]]);
    s.pendingDraw = 4;
    const { state } = apply(s, { type: 'draw', player: 0 });
    expect(state.out[0]).toBe(true);
    expect(state.pendingDraw).toBe(0);
  });

  it('a 7 cannot swap with a player who is out', () => {
    const seven = num('red', 7);
    const s = makeGame({ hands: [[seven, num('blue', 1)], [num('green', 2)], [num('yellow', 3)]], top: num('red', 3), drawPile: [] });
    s.out[1] = true;
    const { state } = apply(s, { type: 'play', player: 0, cardIds: [seven.id] });
    expect(reduceGame(state, { type: 'swap', player: 0, target: 1 }).ok).toBe(false);
    expect(apply(state, { type: 'swap', player: 0, target: 2 }).state.hands[0]).toHaveLength(1);
  });
});

describe('winning', () => {
  it('ends the game when a hand is emptied', () => {
    const last = num('red', 8);
    const s = makeGame({ hands: [[last], [num('red', 1)]], top: num('red', 3) });
    const { state, events } = apply(s, { type: 'play', player: 0, cardIds: [last.id] });
    expect(state.phase).toBe('over');
    expect(events).toContainEqual({ type: 'win', player: 0 });
    expect(reduceGame(state, { type: 'draw', player: 1 }).ok).toBe(false);
  });
});
