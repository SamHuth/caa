import { type Card, cardLabel } from '../engine/cards';
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

export function cardEl(card: Card, extraClass = ''): HTMLDivElement {
  const f = face(card);
  const colourClass = card.colour ? `c-${card.colour}` : 'c-wild';
  return h(
    'div',
    {
      class: `card ${colourClass} k-${card.kind} ${card.value === 6 || card.value === 9 ? 'six-nine' : ''} ${card.smiley ? 'smiley' : ''} ${extraClass}`,
      'data-id': card.id,
      'aria-label': cardLabel(card),
    },
    h('span', { class: 'corner tl' }, f),
    h('span', { class: 'pip' }, h('span', { class: 'face' }, f)),
    card.smiley ? h('span', { class: 'smile' }, '☺ +2') : null,
    h('span', { class: 'corner br' }, f),
  );
}

export function cardBack(extraClass = ''): HTMLDivElement {
  return h('div', { class: `card back ${extraClass}`, 'aria-hidden': 'true' }, h('span', { class: 'back-logo' }, 'A'));
}
