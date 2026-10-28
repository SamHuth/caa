export const COLOURS = ['red', 'yellow', 'green', 'blue'] as const;
export type Colour = (typeof COLOURS)[number];

export type CardKind = 'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'draw4';

export interface Card {
  id: number;
  kind: CardKind;
  /** null for wild / draw4 */
  colour: Colour | null;
  /** 0–12 for number cards, null otherwise */
  value: number | null;
  /** The one Blue Smiley 8: plays like a blue 8, but played on its own the next player also draws 2. */
  smiley?: true;
}

export const MAX_NUMBER = 12;
export const DECK_SIZE = 136;

/** 4 colours × 2 × (0–12, skip, reverse, draw2) + 4 wild + 4 draw4 = 136 cards. */
export function buildDeck(): Card[] {
  const deck: Card[] = [];
  let id = 0;
  for (const colour of COLOURS) {
    for (let copy = 0; copy < 2; copy++) {
      for (let value = 0; value <= MAX_NUMBER; value++) {
        deck.push({ id: id++, kind: 'number', colour, value });
      }
      deck.push({ id: id++, kind: 'skip', colour, value: null });
      deck.push({ id: id++, kind: 'reverse', colour, value: null });
      deck.push({ id: id++, kind: 'draw2', colour, value: null });
    }
  }
  for (let i = 0; i < 4; i++) deck.push({ id: id++, kind: 'wild', colour: null, value: null });
  for (let i = 0; i < 4; i++) deck.push({ id: id++, kind: 'draw4', colour: null, value: null });
  deck.find((c) => c.colour === 'blue' && c.value === 8)!.smiley = true;
  return deck;
}

export function cardPoints(card: Card): number {
  switch (card.kind) {
    case 'number':
      return card.value!;
    case 'skip':
    case 'reverse':
    case 'draw2':
      return 10;
    case 'wild':
    case 'draw4':
      return 20;
  }
}

export function handPoints(hand: Card[]): number {
  return hand.reduce((sum, c) => sum + cardPoints(c), 0);
}

export const isWild = (c: Card) => c.kind === 'wild' || c.kind === 'draw4';
export const isAction = (c: Card) => c.kind !== 'number';

/** Same colour and same value/type (ignores id and the smiley flag). */
export function sameFace(a: Card, b: Card): boolean {
  return a.kind === b.kind && a.colour === b.colour && a.value === b.value;
}

const KIND_LABEL: Record<CardKind, string> = {
  number: '',
  skip: 'Skip',
  reverse: 'Reverse',
  draw2: 'Draw 2',
  wild: 'Wild',
  draw4: 'Draw 4',
};

export function cardLabel(c: Card): string {
  if (isWild(c)) return KIND_LABEL[c.kind];
  const colour = c.colour![0].toUpperCase() + c.colour!.slice(1);
  if (c.kind === 'number') return `${colour} ${c.value}${c.smiley ? ' ☺ (+2)' : ''}`;
  return `${colour} ${KIND_LABEL[c.kind]}`;
}
