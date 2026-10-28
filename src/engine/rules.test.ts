import { describe, expect, it } from 'vitest';
import { DECK_SIZE, buildDeck, cardPoints } from './cards';
import { validateJumpIn, validatePlay } from './rules';
import { draw2, draw4, num, skip, wild } from './testUtils';

const pile = (top = num('green', 7), colour = top.colour!) => ({ top, colour });

describe('deck', () => {
  it('has 136 cards with one smiley blue 8', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(DECK_SIZE);
    expect(new Set(deck.map((c) => c.id)).size).toBe(DECK_SIZE);
    expect(deck.filter((c) => c.smiley)).toEqual([expect.objectContaining({ colour: 'blue', value: 8 })]);
    expect(deck.filter((c) => c.kind === 'wild')).toHaveLength(4);
    expect(deck.filter((c) => c.kind === 'draw4')).toHaveLength(4);
    expect(deck.filter((c) => c.kind === 'reverse')).toHaveLength(8);
    expect(deck.filter((c) => c.colour === 'red' && c.value === 12)).toHaveLength(2);
  });

  it('scores cards', () => {
    expect(cardPoints(num('red', 9))).toBe(9);
    expect(cardPoints(skip('red'))).toBe(10);
    expect(cardPoints(draw2('red'))).toBe(10);
    expect(cardPoints(wild())).toBe(20);
    expect(cardPoints(draw4())).toBe(20);
  });
});

describe('single plays', () => {
  it('matches colour', () => expect(validatePlay([num('green', 2)], pile(), 5).ok).toBe(true));
  it('matches number', () => expect(validatePlay([num('red', 7)], pile(), 5).ok).toBe(true));
  it('rejects a mismatch', () => expect(validatePlay([num('red', 2)], pile(), 5).ok).toBe(false));
  it('allows wilds anywhere', () => {
    expect(validatePlay([wild()], pile(), 5).ok).toBe(true);
    expect(validatePlay([draw4()], pile(), 5).ok).toBe(true);
  });
  it('matches action type across colours', () => {
    expect(validatePlay([skip('red')], pile(skip('blue')), 5).ok).toBe(true);
    expect(validatePlay([draw2('red')], pile(draw2('blue')), 5).ok).toBe(true);
    expect(validatePlay([skip('red')], pile(draw2('blue')), 5).ok).toBe(false);
  });
  it('uses the chosen colour after a wild', () => {
    expect(validatePlay([num('blue', 3)], pile(wild(), 'blue'), 5).ok).toBe(true);
    expect(validatePlay([num('red', 3)], pile(wild(), 'blue'), 5).ok).toBe(false);
  });
});

describe('doubles', () => {
  it('allows two identical number cards', () => {
    expect(validatePlay([num('green', 3), num('green', 3)], pile(), 5)).toEqual({ ok: true, kind: 'double' });
    expect(validatePlay([num('red', 7), num('red', 7)], pile(), 5).ok).toBe(true);
  });
  it('rejects same number, different colour', () => {
    expect(validatePlay([num('green', 3), num('red', 3)], pile(), 5).ok).toBe(false);
  });
  it('rejects a pair that does not match the pile', () => {
    expect(validatePlay([num('red', 3), num('red', 3)], pile(), 5).ok).toBe(false);
  });
  it('rejects doubled actions and wilds', () => {
    expect(validatePlay([skip('green'), skip('green')], pile(), 5).ok).toBe(false);
    expect(validatePlay([draw2('green'), draw2('green')], pile(), 5).ok).toBe(false);
    expect(validatePlay([wild(), wild()], pile(), 5).ok).toBe(false);
    expect(validatePlay([draw4(), draw4()], pile(), 5).ok).toBe(false);
  });
});

describe('sums', () => {
  it('allows number cards adding up to the pile number when the first matches colour', () => {
    expect(validatePlay([num('green', 2), num('red', 2), num('blue', 3)], pile(), 5)).toEqual({ ok: true, kind: 'sum' });
  });
  it('requires the first card to match the colour', () => {
    expect(validatePlay([num('red', 2), num('green', 2), num('blue', 3)], pile(), 5).ok).toBe(false);
  });
  it('requires the exact total', () => {
    expect(validatePlay([num('green', 2), num('red', 2)], pile(), 5).ok).toBe(false);
    expect(validatePlay([num('green', 4), num('red', 4)], pile(), 5).ok).toBe(false);
  });
  it('rejects non-number cards', () => {
    expect(validatePlay([num('green', 7), skip('green')], pile(), 5).ok).toBe(false);
  });
  it('needs a number on the pile', () => {
    expect(validatePlay([num('green', 1), num('red', 1)], pile(skip('green')), 5).ok).toBe(false);
  });
});

describe('finishing', () => {
  it('cannot go out on an action or wild', () => {
    expect(validatePlay([skip('green')], pile(), 1).ok).toBe(false);
    expect(validatePlay([draw2('green')], pile(), 1).ok).toBe(false);
    expect(validatePlay([wild()], pile(), 1).ok).toBe(false);
    expect(validatePlay([draw4()], pile(), 1).ok).toBe(false);
  });
  it('can go out on a number, double or sum', () => {
    expect(validatePlay([num('green', 1)], pile(), 1).ok).toBe(true);
    expect(validatePlay([num('green', 7), num('green', 7)], pile(), 2).ok).toBe(true);
    expect(validatePlay([num('green', 5), num('red', 2)], pile(), 2).ok).toBe(true);
  });
});

describe('jump-in', () => {
  it('requires the exact same card', () => {
    expect(validateJumpIn([num('green', 7)], pile(), 5).ok).toBe(true);
    expect(validateJumpIn([num('red', 7)], pile(), 5).ok).toBe(false);
    expect(validateJumpIn([num('green', 6)], pile(), 5).ok).toBe(false);
  });
  it('accepts any card type', () => {
    expect(validateJumpIn([wild()], pile(wild(), 'red'), 5).ok).toBe(true);
    expect(validateJumpIn([draw4()], pile(draw4(), 'red'), 5).ok).toBe(true);
    expect(validateJumpIn([skip('blue')], pile(skip('blue')), 5).ok).toBe(true);
    expect(validateJumpIn([wild()], pile(draw4(), 'red'), 5).ok).toBe(false);
  });
  it('only allows single cards', () => {
    expect(validateJumpIn([num('green', 7), num('green', 7)], pile(), 5).ok).toBe(false);
  });
});
