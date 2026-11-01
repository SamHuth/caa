import { type Card, type Colour, cardLabel } from '../engine/cards';
import { h } from './dom';

function face(card: Card): string {
  switch (card.kind) {
    case 'number':
      return String(card.value);
    case 'skip':
      return '⊘';
    case 'reverse':
      return '⇄';
    case 'draw2':
      return '+2';
    case 'wild':
      return 'W';
    case 'draw4':
      return '+4';
  }
}

/** The Smiley 8's face: the 8's loops are the eyes, with a mouth drawn to the side, like 8) */
function smileyMouth() {
  const mouth = h('span', { class: 'mouth', 'aria-hidden': 'true' });
  mouth.innerHTML = '<svg viewBox="0 0 12 32"><path d="M2 3 Q14 16 2 29"/></svg>';
  return mouth;
}

/** `paint` shows a wild / draw 4 in the colour chosen for it. */
export function cardEl(card: Card, extraClass = '', paint?: Colour): HTMLDivElement {
  const f = face(card);
  const colourClass = card.colour ? `c-${card.colour}` : paint ? `c-${paint} painted` : 'c-wild';
  return h(
    'div',
    {
      class: `card ${colourClass} k-${card.kind} ${card.value === 6 || card.value === 9 ? 'six-nine' : ''} ${card.smiley ? 'smiley' : ''} ${extraClass}`,
      'data-id': card.id,
      'aria-label': paint ? `${cardLabel(card)} (${paint})` : cardLabel(card),
    },
    h('span', { class: 'corner tl' }, f),
    h('span', { class: 'pip' }, h('span', { class: 'face' }, f, card.smiley ? smileyMouth() : null)),
    h('span', { class: 'corner br' }, f),
  );
}

export function cardBack(extraClass = ''): HTMLDivElement {
  return h('div', { class: `card back ${extraClass}`, 'aria-hidden': 'true' }, h('span', { class: 'back-logo' }, 'A'));
}
