import { type Card, type Colour, COLOURS, buildDeck } from './cards';
import { type DrawStack, type Pile, checkPlay, drawValue } from './rules';
import { type Seeded, randInt, shuffle } from './rng';

/** One hand of play. Ends when someone empties their hand, or when all but one player are out. */
export interface GameState extends Seeded {
  hands: Card[][];
  /** Never refilled: once it's empty, players who can't play are out. */
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
  /** Stacked Draw 2 / Draw 4 penalty facing the current player (0 = none). */
  pendingDraw: number;
  /** Cards the current player has drawn this turn. */
  drawnThisTurn: number;
  /** Players who passed after the draw pile ran out; they sit out the rest of the game. */
  out: boolean[];
  /** Last player to put a card down; wins if everyone else is knocked out. */
  lastPlayer: number | null;
  winner: number | null;
  /** Increments whenever the turn changes hands; used to invalidate timers. */
  turn: number;
}

export type GameAction =
  | { type: 'play'; player: number; cardIds: number[] }
  /** Draw one card (only when you can't play) — or take a stack, or pass once the pile is empty. */
  | { type: 'draw'; player: number }
  | { type: 'chooseColour'; player: number; colour: Colour }
  /** After a single 7: you must swap hands with another player. */
  | { type: 'swap'; player: number; target: number }
  | { type: 'timeout'; player: number };

export type GameEvent =
  | { type: 'play'; player: number; cards: Card[]; jumpIn: boolean }
  | { type: 'draw'; player: number; count: number; cards?: Card[]; reason: 'draw' | 'penalty' | 'smiley' | 'timeout' }
  | { type: 'stack'; player: number; total: number; added: number }
  | { type: 'skip'; player: number }
  | { type: 'reverse'; player: number; direction: 1 | -1 }
  | { type: 'swap'; player: number; target: number }
  | { type: 'rotate'; player: number; direction: 1 | -1 }
  | { type: 'colour'; player: number; colour: Colour }
  | { type: 'out'; player: number }
  | { type: 'turn'; player: number }
  | { type: 'win'; player: number };

export type Reduced<S, E> = { ok: true; state: S; events: E[] } | { ok: false; reason: string };

export const TIMEOUT_PENALTY = 2;
export const SMILEY_PENALTY = 2;

export function topCard(s: GameState): Card {
  return s.discard[s.discard.length - 1];
}

export function pileOf(s: GameState): Pile {
  return { top: topCard(s), colour: s.colour };
}

export function stackOf(s: GameState): DrawStack | null {
  return s.pendingDraw > 0 ? { count: s.pendingDraw } : null;
}

export function activePlayers(s: GameState): number[] {
  return s.hands.map((_, i) => i).filter((i) => !s.out[i]);
}

/** The seat `steps` turns after `from` in the current direction, skipping players who are out. */
export function nextPlayer(s: GameState, from = s.current, steps = 1): number {
  const n = s.hands.length;
  let p = from;
  for (let k = 0; k < steps; k++) {
    do p = (((p + s.direction) % n) + n) % n;
    while (s.out[p] && p !== from);
  }
  return p;
}

/** Whether a player has any legal play right now (every legal double or sum starts with a legal single). */
export function canPlayAny(s: GameState, player = s.current): boolean {
  const hand = s.hands[player];
  const ctx = { pile: pileOf(s), handSize: hand.length, isTurn: player === s.current, stack: stackOf(s) };
  return hand.some((c) => checkPlay([c], ctx).ok);
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
    drawnThisTurn: 0,
    out: Array(players).fill(false),
    lastPlayer: null,
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

/** Draw up to n cards; the pile is never reshuffled, so this can come up short. */
function drawCards(s: GameState, player: number, n: number): Card[] {
  const drawn: Card[] = [];
  while (drawn.length < n && s.drawPile.length > 0) drawn.push(s.drawPile.pop()!);
  s.hands[player].push(...drawn);
  return drawn;
}

function advance(s: GameState, steps: number, events: GameEvent[]) {
  s.current = nextPlayer(s, s.current, steps);
  s.drawnThisTurn = 0;
  s.turn++;
  events.push({ type: 'turn', player: s.current });
}

function endGame(s: GameState, winner: number, events: GameEvent[]) {
  s.phase = 'over';
  s.winner = winner;
  events.push({ type: 'win', player: winner });
}

/**
 * The current player passed with nothing left to draw: they're out. When only one player
 * is left, the last person to have played a card wins.
 */
function knockOut(s: GameState, events: GameEvent[]) {
  const p = s.current;
  s.out[p] = true;
  s.pendingDraw = 0;
  events.push({ type: 'out', player: p });
  const active = activePlayers(s);
  if (active.length <= 1) {
    endGame(s, s.lastPlayer !== null && !s.out[s.lastPlayer] ? s.lastPlayer : active[0], events);
    return;
  }
  advance(s, 1, events);
}

/** The current player draws the whole stack and loses their turn (or is out if there's nothing to draw). */
function takeStack(s: GameState, events: GameEvent[]) {
  if (s.drawPile.length === 0) return knockOut(s, events);
  const p = s.current;
  const cards = drawCards(s, p, s.pendingDraw);
  events.push({ type: 'draw', player: p, count: cards.length, cards, reason: 'penalty' });
  events.push({ type: 'skip', player: p });
  s.pendingDraw = 0;
  advance(s, 1, events);
}

/** Everyone still in passes their hand to the next player in turn order. */
function rotateHands(s: GameState) {
  const old = [...s.hands];
  for (const i of activePlayers(s)) s.hands[nextPlayer(s, i)] = old[i];
}

/** Most common colour in a hand (ties broken by COLOURS order); used for auto-picks. */
export function favouriteColour(hand: Card[]): Colour {
  const counts = new Map<Colour, number>(COLOURS.map((c) => [c, 0]));
  for (const c of hand) if (c.colour) counts.set(c.colour, counts.get(c.colour)! + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** Default swap target (timeouts and CPUs): the smallest hand still in the game. */
export function smallestOtherHand(s: GameState, me: number): number {
  const others = activePlayers(s).filter((i) => i !== me);
  return others.reduce((best, i) => (s.hands[i].length < s.hands[best].length ? i : best));
}

export function reduceGame(prev: GameState, action: GameAction): Reduced<GameState, GameEvent> {
  if (prev.phase === 'over') return { ok: false, reason: 'The game is over' };
  if (prev.out[action.player]) return { ok: false, reason: "You're out of this game" };
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
      s.lastPlayer = p;
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
        endGame(s, p, events);
        break;
      }

      // Draw cards stack for the next player to answer or take. The Smiley 8 only adds to
      // a stack that already exists; on its own its +2 lands immediately (below).
      const single = cards.length === 1;
      const added = last.smiley && s.pendingDraw === 0 ? 0 : drawValue(last);
      if (added) {
        s.pendingDraw += added;
        events.push({ type: 'stack', player: p, total: s.pendingDraw, added });
      }

      // Number-card powers only trigger when the card is played on its own.
      if (single && last.smiley && !added) {
        const victim = nextPlayer(s);
        const drawn = drawCards(s, victim, SMILEY_PENALTY);
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
          // With two players left a reverse works like a skip.
          advance(s, activePlayers(s).length === 2 ? 2 : 1, events);
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
      if (t === p || !Number.isInteger(t) || t < 0 || t >= s.hands.length || s.out[t]) {
        return { ok: false, reason: 'Pick another player to swap with' };
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
      // Draw one card at a time until you can play; no limit, but no drawing past a playable card.
      if (canPlayAny(s)) return { ok: false, reason: 'You can play a card — no need to draw' };
      if (s.drawPile.length === 0) {
        knockOut(s, events);
        break;
      }
      const cards = drawCards(s, p, 1);
      s.drawnThisTurn++;
      events.push({ type: 'draw', player: p, count: 1, cards, reason: 'draw' });
      break;
    }

    case 'timeout': {
      if (s.phase === 'chooseColour' && s.chooser === p) {
        chooseColour(s, favouriteColour(s.hands[p]), events);
        break;
      }
      if (s.phase === 'chooseSwap' && s.chooser === p) {
        swapWith(s, smallestOtherHand(s, p), events);
        break;
      }
      if (!isTurn || s.phase !== 'play') return { ok: false, reason: 'Not your turn' };
      if (s.pendingDraw > 0) {
        takeStack(s, events);
        break;
      }
      // With the pile empty, running out of time is a pass.
      if (s.drawPile.length === 0) {
        knockOut(s, events);
        break;
      }
      const cards = drawCards(s, p, TIMEOUT_PENALTY);
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

function swapWith(s: GameState, target: number, events: GameEvent[]) {
  const p = s.current;
  [s.hands[p], s.hands[target]] = [s.hands[target], s.hands[p]];
  s.phase = 'play';
  s.chooser = null;
  events.push({ type: 'swap', player: p, target });
  advance(s, 1, events);
}
