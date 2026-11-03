import { go } from '../app';
import { totalChanges } from '../changelog';
import { h, store } from '../dom';
import { AVATAR_COLOURS, NAME_MAX, avatarChoices, avatarEl, nameFor, profile, randomProfile } from '../profile';
import { showHowToPlay } from './howToPlay';
import { showWhatsNew } from './whatsNew';

const SEEN_KEY = 'changes-seen';

export function homeScreen() {
  const me = profile.get();
  const save = () => profile.set(me);

  const preview = h('div', { class: 'profile-preview' });
  // A fresh random selection of avatars each visit (and each 🎲 roll), always including yours.
  const emojiGrid = h('div', { class: 'emoji-grid', role: 'group', 'aria-label': 'Avatar' });
  let emojiButtons: HTMLButtonElement[] = [];
  // Picking an avatar rolls a fresh name to match it.
  const pickEmoji = (emoji: string) => {
    me.avatar.emoji = emoji;
    name.value = me.name = nameFor(emoji);
    save();
    refresh();
  };
  const shuffleChoices = () => {
    emojiButtons = avatarChoices(me.avatar.emoji).map((emoji) =>
      h('button', { class: 'emoji-btn', 'aria-label': `Avatar ${emoji}`, onclick: () => pickEmoji(emoji) }, emoji),
    );
    emojiGrid.replaceChildren(...emojiButtons);
  };
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
      if (!name.value.trim()) name.value = me.name = nameFor(me.avatar.emoji);
      save();
    },
  });
  const dice = h('button', {
    class: 'btn-round dice',
    'aria-label': 'Random name and avatar',
    title: 'Random name and avatar',
    onclick: () => {
      const rolled = randomProfile();
      name.value = me.name = rolled.name;
      me.avatar = rolled.avatar;
      save();
      shuffleChoices();
      refresh();
      dice.animate([{ rotate: '0deg' }, { rotate: '360deg' }], { duration: 400, easing: 'ease-out' });
    },
  }, '🎲');

  // Bell with a red badge counting changes this browser hasn't seen yet.
  const unseen = Math.max(0, totalChanges - store.get(SEEN_KEY, 0));
  const badge = unseen ? h('span', { class: 'notif-badge' }, unseen > 9 ? '9+' : unseen) : null;
  const bell = h(
    'button',
    {
      class: 'btn-round notif-btn',
      'aria-label': unseen ? `What's new: ${unseen} new changes` : "What's new",
      onclick: () => {
        store.set(SEEN_KEY, totalChanges);
        badge?.remove();
        bell.setAttribute('aria-label', "What's new");
        showWhatsNew();
      },
    },
    '🔔',
    badge,
  );

  shuffleChoices();
  refresh();
  return h(
    'main',
    { class: 'screen home' },
    bell,
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
      emojiGrid,
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
