import type { Card, Colour } from './cards';
import type { GameState } from './game';

let nextId = 1000;

export const num = (colour: Colour, value: number): Card => ({ id: nextId++, kind: 'number', colour, value });
export const smiley = (): Card => ({ id: nextId++, kind: 'number', colour: 'blue', value: 8, smiley: true });
export const reverse = (colour: Colour): Card => ({ id: nextId++, kind: 'reverse', colour, value: null });
export const skip = (colour: Colour): Card => ({ id: nextId++, kind: 'skip', colour, value: null });
export const draw2 = (colour: Colour): Card => ({ id: nextId++, kind: 'draw2', colour, value: null });
export const wild = (): Card => ({ id: nextId++, kind: 'wild', colour: null, value: null });
export const draw4 = (): Card => ({ id: nextId++, kind: 'draw4', colour: null, value: null });

/** Build a game state with explicit hands and pile; draw pile defaults to 20 yellow 1s. */
export function makeGame(opts: {
  hands: Card[][];
  top: Card;
  colour?: Colour;
  current?: number;
  drawPile?: Card[];
}): GameState {
  return {
    rng: 42,
    hands: opts.hands,
    drawPile: opts.drawPile ?? Array.from({ length: 20 }, () => num('yellow', 1)),
    discard: [opts.top],
    colour: opts.colour ?? opts.top.colour!,
    current: opts.current ?? 0,
    phase: 'play',
    direction: 1,
    chooser: null,
    pendingDraw: 0,
    drawnThisTurn: 0,
    out: opts.hands.map(() => false),
    lastPlayer: null,
    winner: null,
    turn: 0,
  };
}
