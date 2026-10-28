import { type Card, type Colour, cardPoints, isAction, isWild, sameFace } from './cards';
import { favouriteColour } from './game';
import type { Difficulty } from './match';
import { type DrawStack, type Pile, canPlaySingle, checkPlay } from './rules';

export type CpuMove = { type: 'play'; cardIds: number[] } | { type: 'draw' };

export interface CpuContext {
  hand: Card[];
  pile: Pile;
  stack: DrawStack | null;
  difficulty: Difficulty;
  /** Whether another card may be drawn this turn. */
  canDraw: boolean;
  /** Hand size of the player who plays after this CPU. */
  nextHandCount: number;
  /** Smallest hand among the other players (makes a 7 swap tempting). */
  minOtherHandCount: number;
  rand: () => number;
}

const MAX_SUM_CARDS = 5;

/** All legal plays from a hand, optionally including doubles and sum combos. */
export function enumeratePlays(hand: Card[], pile: Pile, stack: DrawStack | null, opts: { doubles: boolean; sums: boolean }): Card[][] {
  const ctx = { pile, handSize: hand.length, isTurn: true, stack };
  if (stack) return hand.filter((c) => checkPlay([c], ctx).ok).map((c) => [c]);

  const plays: Card[][] = hand.filter((c) => canPlaySingle(c, pile)).map((c) => [c]);

  if (opts.doubles) {
    for (let i = 0; i < hand.length; i++) {
      for (let j = i + 1; j < hand.length; j++) {
        if (sameFace(hand[i], hand[j]) && hand[i].kind === 'number' && canPlaySingle(hand[i], pile)) {
          plays.push([hand[i], hand[j]]);
        }
      }
    }
  }

  if (opts.sums && pile.top.kind === 'number') {
    const target = pile.top.value!;
    const numbers = hand.filter((c) => c.kind === 'number');
    for (const first of numbers) {
      if (first.colour !== pile.colour || first.value! > target) continue;
      const rest = numbers.filter((c) => c !== first);
      const combo: Card[] = [];
      const search = (start: number, remaining: number) => {
        if (remaining === 0 && combo.length > 0) plays.push(orderSum(first, combo, hand));
        if (combo.length >= MAX_SUM_CARDS - 1) return;
        for (let i = start; i < rest.length; i++) {
          if (rest[i].value! > remaining) continue;
          combo.push(rest[i]);
          search(i + 1, remaining - rest[i].value!);
          combo.pop();
        }
      };
      search(0, target - first.value!);
    }
  }

  return plays.filter((p) => checkPlay(p, ctx).ok);
}

/** End the sum on a card whose colour the CPU still holds most of. */
function orderSum(first: Card, rest: Card[], hand: Card[]): Card[] {
  const used = new Set([first.id, ...rest.map((c) => c.id)]);
  const fav = favouriteColour(hand.filter((c) => !used.has(c.id)));
  const sorted = [...rest].sort((a, b) => Number(a.colour === fav) - Number(b.colour === fav));
  return [first, ...sorted];
}

const points = (cards: Card[]) => cards.reduce((s, c) => s + cardPoints(c), 0);

export function cpuMove(ctx: CpuContext): CpuMove | null {
  const { hand, pile, difficulty, rand } = ctx;
  const plays = enumeratePlays(hand, pile, ctx.stack, {
    doubles: difficulty !== 'easy',
    sums: difficulty === 'hard',
  });
  // Facing a stack with nothing to add: take it.
  if (plays.length === 0) return ctx.stack || ctx.canDraw ? { type: 'draw' } : null;

  let best: Card[];
  if (difficulty === 'easy') {
    best = plays[Math.floor(rand() * plays.length)];
  } else {
    const score = (p: Card[]) => {
      let s = points(p) + p.length * 4 + rand();
      if (difficulty === 'hard') {
        const last = p[p.length - 1];
        const threatening = ctx.nextHandCount <= 3;
        if (isWild(last) && !threatening) s -= 30; // save wilds for later
        if ((isAction(last) || last.smiley) && last.kind !== 'wild' && threatening) s += 20; // hit the leader
        const swapGain = hand.length - p.length - ctx.minOtherHandCount;
        if (p.length === 1 && last.value === 7 && swapGain > 1) s += 10 + swapGain * 3; // steal a small hand
      }
      return s;
    };
    best = plays.reduce((a, b) => (score(b) > score(a) ? b : a));
  }
  return { type: 'play', cardIds: best.map((c) => c.id) };
}

export function cpuColour(hand: Card[]): Colour {
  return favouriteColour(hand);
}

/** After a single 7: swap with the smallest other hand, if it beats keeping ours. */
export function cpuSwapTarget(hands: Card[][], me: number): number | null {
  let best: number | null = null;
  hands.forEach((h, i) => {
    if (i !== me && h.length < hands[me].length && (best === null || h.length < hands[best].length)) best = i;
  });
  return best;
}

const JUMP_IN: Record<Difficulty, { chance: number; min: number; max: number }> = {
  easy: { chance: 0.35, min: 4000, max: 6500 },
  medium: { chance: 0.75, min: 1200, max: 2000 },
  hard: { chance: 1, min: 400, max: 900 },
};

/** Decide whether a CPU jumps in on the current top card, and after how long. */
export function cpuJumpIn(hand: Card[], pile: Pile, stack: DrawStack | null, difficulty: Difficulty, rand: () => number) {
  const card = hand.find((c) => checkPlay([c], { pile, handSize: hand.length, isTurn: false, stack }).ok);
  const cfg = JUMP_IN[difficulty];
  if (!card || rand() > cfg.chance) return null;
  return { cardId: card.id, delayMs: cfg.min + rand() * (cfg.max - cfg.min) };
}

const MOVE_DELAY: Record<Difficulty, [number, number]> = {
  easy: [2000, 3200],
  medium: [800, 1400],
  hard: [600, 1100],
};

export function cpuThinkMs(difficulty: Difficulty, rand: () => number): number {
  const [min, max] = MOVE_DELAY[difficulty];
  return min + rand() * (max - min);
}
