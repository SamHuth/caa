import { go } from '../app';
import { h } from '../dom';
import { AVATAR_COLOURS, AVATAR_EMOJIS, NAME_MAX, avatarEl, profile, randomName } from '../profile';
import { showHowToPlay } from './howToPlay';

export function homeScreen() {
  const me = profile.get();
  const save = () => profile.set(me);

  const preview = h('div', { class: 'profile-preview' });
  const emojiButtons = AVATAR_EMOJIS.map((emoji) =>
    h('button', { class: 'emoji-btn', 'aria-label': `Avatar ${emoji}`, onclick: () => ((me.avatar.emoji = emoji), save(), refresh()) }, emoji),
  );
  const colourButtons = AVATAR_COLOURS.map((colour) => {
    const b = h('button', { class: 'swatch', 'aria-label': `Colour ${colour}`, onclick: () => ((me.avatar.colour = colour), save(), refresh()) });
    b.style.background = colour;
    return b;
  });
  const refresh = () => {
    preview.replaceChildren(avatarEl(me.avatar, 'big'));
    emojiButtons.forEach((b) => {
      b.classList.toggle('active', b.textContent === me.avatar.emoji);
      b.style.background = b.textContent === me.avatar.emoji ? me.avatar.colour : '';
    });
    colourButtons.forEach((b, i) => b.classList.toggle('active', AVATAR_COLOURS[i] === me.avatar.colour));
  };

  const name = h('input', {
    class: 'input',
    type: 'text',
    placeholder: 'Your name',
    maxlength: NAME_MAX,
    autocomplete: 'nickname',
    value: me.name,
    'aria-label': 'Name',
    oninput: () => ((me.name = name.value.trim()), save()),
    onblur: () => {
      // Never leave the name blank.
      if (!name.value.trim()) name.value = me.name = randomName();
      save();
    },
  });
  const dice = h('button', {
    class: 'btn-round dice',
    'aria-label': 'Random name',
    title: 'Random name',
    onclick: () => {
      name.value = me.name = randomName();
      save();
      dice.animate([{ rotate: '0deg' }, { rotate: '360deg' }], { duration: 400, easing: 'ease-out' });
    },
  }, '🎲');

  refresh();
  return h(
    'main',
    { class: 'screen home' },
    h(
      'div',
      { class: 'logo small' },
      h('div', { class: 'logo-cards' }, h('span', { class: 'lc c-red' }), h('span', { class: 'lc c-yellow' }), h('span', { class: 'lc c-green' }), h('span', { class: 'lc c-blue' })),
      h('h1', {}, 'Cards Against ', h('span', { class: 'accent' }, 'Angali')),
    ),
    h(
      'section',
      { class: 'panel profile' },
      h('div', { class: 'profile-top' }, preview, h('div', { class: 'name-row' }, name, dice)),
      h('div', { class: 'emoji-grid', role: 'group', 'aria-label': 'Avatar' }, ...emojiButtons),
      h('div', { class: 'swatches', role: 'group', 'aria-label': 'Avatar colour' }, ...colourButtons),
    ),
    h(
      'div',
      { class: 'stack' },
      h('button', { class: 'btn btn-primary', onclick: () => go.settings('single') }, 'Single Player'),
      h('button', { class: 'btn btn-primary', onclick: () => go.multiplayer() }, 'Multiplayer'),
      h('button', { class: 'btn btn-ghost', onclick: showHowToPlay }, 'How to Play'),
    ),
  );
}
