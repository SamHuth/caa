import { type Card, type Colour, COLOURS, buildDeck } from './cards';
import { type DrawKind, type DrawStack, type Pile, canPlaySingle, checkPlay, drawAmount, stackKind } from './rules';
import { type Seeded, randInt, shuffle } from './rng';

/** One hand of play, ending when someone empties their hand. */
export interface GameState extends Seeded {
  hands: Card[][];
  drawPile: Card[];
  /** Last element is the top of the pile. */
  discard: Card[];
  colour: Colour;
  current: number;
  /** 1 = clockwise (seat order), -1 after an odd number of reverses. */
  direction: 1 | -1;
  /** chooseColour after a wild / draw 4; chooseSwap after a single 7. */
  phase: 'play' | 'chooseColour' | 'chooseSwap' | 'over';
  /** Player making the colour or swap choice. */
  chooser: number | null;
  /** Stacked draw penalty facing the current player (0 = none). */
  pendingDraw: number;
  pendingKind: DrawKind | null;
  /** Cards the current player has drawn this turn, one per draw (max MAX_DRAW). */
  drawnThisTurn: number;
  winner: number | null;
  /** Increments whenever the turn changes hands; used to invalidate timers. */
  turn: number;
}

export type GameAction =
  | { type: 'play'; player: number; cardIds: number[] }
  /** Draw one card — or, when facing a stack, take the whole stack. */
  | { type: 'draw'; player: number }
  | { type: 'chooseColour'; player: number; colour: Colour }
  /** After a single 7: swap hands with `target`, or null to keep your own. */
  | { type: 'swap'; player: number; target: number | null }
  | { type: 'timeout'; player: number };

export type GameEvent =
  | { type: 'play'; player: number; cards: Card[]; jumpIn: boolean }
  | { type: 'draw'; player: number; count: number; cards?: Card[]; reason: 'draw' | 'penalty' | 'smiley' | 'timeout' }
  | { type: 'stack'; player: number; total: number }
  | { type: 'skip'; player: number }
  | { type: 'reverse'; player: number; direction: 1 | -1 }
  | { type: 'swap'; player: number; target: number | null }
  | { type: 'rotate'; player: number; direction: 1 | -1 }
  | { type: 'colour'; player: number; colour: Colour }
  | { type: 'reshuffle' }
  | { type: 'turn'; player: number }
  | { type: 'win'; player: number };

export type Reduced<S, E> = { ok: true; state: S; events: E[] } | { ok: false; reason: string };

export const TIMEOUT_PENALTY = 2;
export const SMILEY_PENALTY = 2;
/** Most cards a player can draw in one turn; after the last, the turn passes if nothing is playable. */
export const MAX_DRAW = 10;

export function topCard(s: GameState): Card {
  return s.discard[s.discard.length - 1];
}

export function pileOf(s: GameState): Pile {
  return { top: topCard(s), colour: s.colour };
}

export function stackOf(s: GameState): DrawStack | null {
  return s.pendingDraw > 0 ? { kind: s.pendingKind!, count: s.pendingDraw } : null;
}

/** The seat `steps` turns after `from`, following the current direction. */
export function nextPlayer(s: GameState, from = s.current, steps = 1): number {
  const n = s.hands.length;
  return (((from + steps * s.direction) % n) + n) % n;
}

export function newGame(players: number, handSize: number, seed: number): { state: GameState; events: GameEvent[] } {
  const s: GameState = {
    rng: seed,
    hands: Array.from({ length: players }, () => []),
    drawPile: [],
    discard: [],
    colour: 'red',
    current: 0,
    direction: 1,
    phase: 'play',
    chooser: null,
    pendingDraw: 0,
    pendingKind: null,
    drawnThisTurn: 0,
    winner: null,
    turn: 0,
  };
  s.drawPile = shuffle(s, buildDeck());
  for (let i = 0; i < handSize; i++) {
    for (const hand of s.hands) hand.push(s.drawPile.pop()!);
  }
  // Start the pile with a plain number card.
  const startIdx = s.drawPile.findLastIndex((c) => c.kind === 'number' && !c.smiley);
  const [start] = s.drawPile.splice(startIdx, 1);
  s.discard.push(start);
  s.colour = start.colour!;
  s.current = randInt(s, players);
  return { state: s, events: [{ type: 'turn', player: s.current }] };
}

function drawCards(s: GameState, player: number, n: number, events: GameEvent[]): Card[] {
  const drawn: Card[] = [];
  for (let i = 0; i < n; i++) {
    const card = drawOne(s, events);
    if (!card) break;
    s.hands[player].push(card);
    drawn.push(card);
  }
  return drawn;
}

/** When the draw pile runs out, everything under the top card is shuffled into a new one. */
function drawOne(s: GameState, events: GameEvent[]): Card | undefined {
  if (s.drawPile.length === 0 && s.discard.length > 1) {
    const top = s.discard.pop()!;
    s.drawPile = shuffle(s, s.discard);
    s.discard = [top];
    events.push({ type: 'reshuffle' });
  }
  return s.drawPile.pop();
}

function advance(s: GameState, steps: number, events: GameEvent[]) {
  s.current = nextPlayer(s, s.current, steps);
  s.drawnThisTurn = 0;
  s.turn++;
  events.push({ type: 'turn', player: s.current });
}

/** The current player draws the whole stack and loses their turn. */
function takeStack(s: GameState, events: GameEvent[]) {
  const p = s.current;
  const cards = drawCards(s, p, s.pendingDraw, events);
  events.push({ type: 'draw', player: p, count: cards.length, cards, reason: 'penalty' });
  events.push({ type: 'skip', player: p });
  s.pendingDraw = 0;
  s.pendingKind = null;
  advance(s, 1, events);
}

/** Everyone passes their hand to the next player in turn order. */
function rotateHands(s: GameState) {
  const old = s.hands;
  s.hands = old.map((_, i) => old[nextPlayer(s, i, -1)]);
}

/** Most common colour in a hand (ties broken by COLOURS order); used for auto-picks. */
export function favouriteColour(hand: Card[]): Colour {
  const counts = new Map<Colour, number>(COLOURS.map((c) => [c, 0]));
  for (const c of hand) if (c.colour) counts.set(c.colour, counts.get(c.colour)! + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export function reduceGame(prev: GameState, action: GameAction): Reduced<GameState, GameEvent> {
  if (prev.phase === 'over') return { ok: false, reason: 'The game is over' };
  const s = structuredClone(prev);
  const events: GameEvent[] = [];
  const p = action.player;
  const isTurn = p === s.current;

  switch (action.type) {
    case 'play': {
      if (s.phase === 'chooseColour') return { ok: false, reason: 'Waiting for a colour to be chosen' };
      if (s.phase === 'chooseSwap') return { ok: false, reason: 'Waiting for a hand swap' };
      const hand = s.hands[p];
      const cards: Card[] = [];
      for (const id of action.cardIds) {
        const card = hand.find((c) => c.id === id);
        if (!card) return { ok: false, reason: 'That card is not in your hand' };
        cards.push(card);
      }
      const check = checkPlay(cards, { pile: pileOf(s), handSize: hand.length, isTurn, stack: stackOf(s) });
      if (!check.ok) return check;

      const ids = new Set(action.cardIds);
      s.hands[p] = hand.filter((c) => !ids.has(c.id));
      s.discard.push(...cards);
      events.push({ type: 'play', player: p, cards, jumpIn: !isTurn });
      if (!isTurn) {
        // Play continues as if the jumper just had their normal turn.
        s.current = p;
        s.turn++;
      }
      s.drawnThisTurn = 0;

      const last = cards[cards.length - 1];
      if (last.colour) s.colour = last.colour;

      if (s.hands[p].length === 0) {
        s.phase = 'over';
        s.winner = p;
        events.push({ type: 'win', player: p });
        break;
      }

      // Draw 2s / Draw 4s add to the stack for the next player to answer or take.
      const kind = stackKind(last);
      if (kind) {
        s.pendingDraw += drawAmount(kind);
        s.pendingKind = kind;
        events.push({ type: 'stack', player: p, total: s.pendingDraw });
      }

      // Number-card powers only trigger when the card is played on its own.
      const single = cards.length === 1;
      if (single && last.smiley) {
        const victim = nextPlayer(s);
        const drawn = drawCards(s, victim, SMILEY_PENALTY, events);
        events.push({ type: 'draw', player: victim, count: drawn.length, cards: drawn, reason: 'smiley' });
      }

      switch (last.kind) {
        case 'skip':
          events.push({ type: 'skip', player: nextPlayer(s) });
          advance(s, 2, events);
          break;
        case 'reverse':
          s.direction = s.direction === 1 ? -1 : 1;
          events.push({ type: 'reverse', player: p, direction: s.direction });
          // With two players a reverse works like a skip.
          advance(s, s.hands.length === 2 ? 2 : 1, events);
          break;
        case 'wild':
        case 'draw4':
          s.phase = 'chooseColour';
          s.chooser = p;
          break;
        case 'number':
          if (single && last.value === 7) {
            s.phase = 'chooseSwap';
            s.chooser = p;
            break;
          }
          if (single && last.value === 12) {
            rotateHands(s);
            events.push({ type: 'rotate', player: p, direction: s.direction });
          }
          advance(s, 1, events);
          break;
        default:
          advance(s, 1, events);
      }
      break;
    }

    case 'chooseColour': {
      if (s.phase !== 'chooseColour' || s.chooser !== p) return { ok: false, reason: 'Not choosing a colour' };
      if (!COLOURS.includes(action.colour)) return { ok: false, reason: 'Unknown colour' };
      chooseColour(s, action.colour, events);
      break;
    }

    case 'swap': {
      if (s.phase !== 'chooseSwap' || s.chooser !== p) return { ok: false, reason: 'Not choosing a swap' };
      const t = action.target;
      if (t !== null && (t === p || !Number.isInteger(t) || t < 0 || t >= s.hands.length)) {
        return { ok: false, reason: 'Pick another player' };
      }
      swapWith(s, t, events);
      break;
    }

    case 'draw': {
      if (!isTurn) return { ok: false, reason: 'Not your turn' };
      if (s.phase !== 'play') return { ok: false, reason: 'Finish your choice first' };
      if (s.pendingDraw > 0) {
        takeStack(s, events);
        break;
      }
      if (s.drawnThisTurn >= MAX_DRAW) return { ok: false, reason: `You've drawn ${MAX_DRAW} — play a card` };
      // One card per draw; the player decides whether to keep drawing.
      const card = drawOne(s, events);
      if (!card) {
        // Nothing left anywhere to draw.
        events.push({ type: 'draw', player: p, count: 0, cards: [], reason: 'draw' });
        advance(s, 1, events);
        break;
      }
      s.hands[p].push(card);
      s.drawnThisTurn++;
      events.push({ type: 'draw', player: p, count: 1, cards: [card], reason: 'draw' });
      if (s.drawnThisTurn >= MAX_DRAW && !s.hands[p].some((c) => canPlaySingle(c, pileOf(s)))) advance(s, 1, events);
      break;
    }

    case 'timeout': {
      if (s.phase === 'chooseColour' && s.chooser === p) {
        chooseColour(s, favouriteColour(s.hands[p]), events);
        break;
      }
      if (s.phase === 'chooseSwap' && s.chooser === p) {
        swapWith(s, null, events);
        break;
      }
      if (!isTurn || s.phase !== 'play') return { ok: false, reason: 'Not your turn' };
      if (s.pendingDraw > 0) {
        takeStack(s, events);
        break;
      }
      const cards = drawCards(s, p, TIMEOUT_PENALTY, events);
      events.push({ type: 'draw', player: p, count: cards.length, cards, reason: 'timeout' });
      advance(s, 1, events);
      break;
    }
  }

  return { ok: true, state: s, events };
}

function chooseColour(s: GameState, colour: Colour, events: GameEvent[]) {
  s.colour = colour;
  s.phase = 'play';
  s.chooser = null;
  events.push({ type: 'colour', player: s.current, colour });
  advance(s, 1, events);
}

function swapWith(s: GameState, target: number | null, events: GameEvent[]) {
  const p = s.current;
  if (target !== null) [s.hands[p], s.hands[target]] = [s.hands[target], s.hands[p]];
  s.phase = 'play';
  s.chooser = null;
  events.push({ type: 'swap', player: p, target });
  advance(s, 1, events);
}
