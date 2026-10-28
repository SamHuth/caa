import { type Card, type Colour, isAction, isWild, sameFace } from './cards';

export interface Pile {
  top: Card;
  /** Active colour: the top card's colour, or the colour chosen for a wild. */
  colour: Colour;
}

export type PlayKind = 'single' | 'double' | 'sum';
export type PlayCheck = { ok: true; kind: PlayKind } | { ok: false; reason: string };

const fail = (reason: string): PlayCheck => ({ ok: false, reason });

export function canPlaySingle(card: Card, pile: Pile): boolean {
  if (isWild(card)) return true;
  if (card.colour === pile.colour) return true;
  if (card.kind === 'number') return pile.top.kind === 'number' && card.value === pile.top.value;
  // Skip on skip, reverse on reverse, draw 2 on draw 2.
  return card.kind === pile.top.kind;
}

/**
 * Validate a normal-turn play. `cards` is in the order the player selected them;
 * the last card becomes the new top of the pile.
 */
export function validatePlay(cards: Card[], pile: Pile, handSize: number): PlayCheck {
  if (cards.length === 0) return fail('Select a card first');
  if (new Set(cards.map((c) => c.id)).size !== cards.length) return fail('Duplicate card');

  let kind: PlayKind;
  if (cards.length === 1) {
    if (!canPlaySingle(cards[0], pile)) return fail("That card doesn't match the colour or number");
    kind = 'single';
  } else if (cards.length === 2 && sameFace(cards[0], cards[1])) {
    if (cards[0].kind !== 'number') return fail('Only number cards can be doubled');
    if (!canPlaySingle(cards[0], pile)) return fail("That pair doesn't match the colour or number");
    kind = 'double';
  } else {
    if (cards.some((c) => c.kind !== 'number')) return fail('Combos can only use number cards');
    if (pile.top.kind !== 'number') return fail('Sums need a number card on the pile');
    if (cards[0].colour !== pile.colour) return fail(`The first card of a sum must be ${pile.colour}`);
    const sum = cards.reduce((s, c) => s + c.value!, 0);
    if (sum !== pile.top.value) return fail(`Those add up to ${sum}, not ${pile.top.value}`);
    kind = 'sum';
  }

  if (cards.length === handSize && isAction(cards[cards.length - 1])) {
    return fail("You can't go out on an action or wild card");
  }
  return { ok: true, kind };
}

/** Validate an out-of-turn jump-in: a single card identical to the top card. */
export function validateJumpIn(cards: Card[], pile: Pile, handSize: number): PlayCheck {
  if (cards.length !== 1) return fail('Jump in with a single identical card');
  if (!sameFace(cards[0], pile.top)) return fail('Not your turn — you can only jump in with the exact same card');
  if (handSize === 1 && isAction(cards[0])) return fail("You can't go out on an action or wild card");
  return { ok: true, kind: 'single' };
}

export type DrawKind = 'draw2' | 'draw4';

/** Penalty waiting for the current player: they add a matching draw card or take it all. */
export interface DrawStack {
  kind: DrawKind;
  count: number;
}

/** Cards that start or add to a draw stack. (The Smiley 8's +2 is immediate and never stacks.) */
export function stackKind(card: Card): DrawKind | null {
  return card.kind === 'draw2' || card.kind === 'draw4' ? card.kind : null;
}

export const drawAmount = (kind: DrawKind) => (kind === 'draw2' ? 2 : 4);

export interface PlayContext {
  pile: Pile;
  handSize: number;
  /** false for a jump-in */
  isTurn: boolean;
  stack: DrawStack | null;
}

/** The single source of truth for whether a submitted play is legal. */
export function checkPlay(cards: Card[], ctx: PlayContext): PlayCheck {
  const { pile, handSize, isTurn, stack } = ctx;
  if (!stack) return isTurn ? validatePlay(cards, pile, handSize) : validateJumpIn(cards, pile, handSize);

  // Facing a stack: only a matching draw card can be added.
  const need = stack.kind === 'draw2' ? 'a Draw 2' : 'a Draw 4';
  if (cards.length !== 1 || stackKind(cards[0]) !== stack.kind) {
    return fail(isTurn ? `Stack ${need} or take +${stack.count}` : `Only ${need} can jump in on a stack`);
  }
  if (!isTurn && !sameFace(cards[0], pile.top)) return fail('Jump-ins must be the exact same card');
  if (handSize === 1 && isAction(cards[0])) return fail("You can't go out on an action or wild card");
  return { ok: true, kind: 'single' };
}
