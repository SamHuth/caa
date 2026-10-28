import { go, playerName } from '../app';
import { h } from '../dom';
import { showHowToPlay } from './howToPlay';

export function homeScreen() {
  const name = h('input', {
    class: 'input',
    type: 'text',
    placeholder: 'Your name',
    maxlength: 16,
    autocomplete: 'nickname',
    value: playerName.get(),
    oninput: (e: Event) => playerName.set((e.target as HTMLInputElement).value),
  });

  return h(
    'main',
    { class: 'screen home' },
    h(
      'div',
      { class: 'logo' },
      h('div', { class: 'logo-cards' }, h('span', { class: 'lc c-red' }), h('span', { class: 'lc c-yellow' }), h('span', { class: 'lc c-green' }), h('span', { class: 'lc c-blue' })),
      h('h1', {}, 'Cards Against ', h('span', { class: 'accent' }, 'Angali')),
    ),
    h('label', { class: 'field' }, h('span', {}, 'Name'), name),
    h(
      'div',
      { class: 'stack' },
      h('button', { class: 'btn btn-primary', onclick: () => go.settings('single') }, 'Single Player'),
      h('button', { class: 'btn btn-primary', onclick: () => go.multiplayer() }, 'Multiplayer'),
      h('button', { class: 'btn btn-ghost', onclick: showHowToPlay }, 'How to Play'),
    ),
  );
}
