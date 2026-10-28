import { CODE_LENGTH, normaliseCode } from '../../net/peer';
import { PeerGuest } from '../../net/PeerGuest';
import { go, playerName } from '../app';
import { h } from '../dom';

export function multiplayerScreen(prefill: string) {
  const error = h('p', { class: 'error', role: 'alert' });
  const code = h('input', {
    class: 'input code-input',
    type: 'text',
    inputmode: 'text',
    autocapitalize: 'characters',
    autocomplete: 'off',
    spellcheck: false,
    placeholder: 'CODE',
    maxlength: CODE_LENGTH,
    value: prefill,
    'aria-label': 'Room code',
  });
  const join = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Join');
  const refresh = () => (join.disabled = code.value.length !== CODE_LENGTH);
  code.oninput = () => {
    code.value = normaliseCode(code.value);
    error.textContent = '';
    refresh();
  };
  refresh();

  const onJoin = async (e: Event) => {
    e.preventDefault();
    join.disabled = true;
    join.textContent = 'Joining…';
    try {
      const guest = await PeerGuest.join(code.value, playerName.display());
      guest.onMessage((msg) => {
        if (msg.t === 'lobby') go.guestLobby(guest, msg.lobby);
        else if (msg.t === 'state') go.game(guest, msg); // rejoined a game in progress
      });
    } catch (err) {
      error.textContent = (err as Error).message;
      join.textContent = 'Join';
      refresh();
    }
  };

  return h(
    'main',
    { class: 'screen multiplayer' },
    h('header', { class: 'screen-header' }, h('button', { class: 'btn-back', onclick: () => go.home() }, '‹ Back'), h('h2', {}, 'Multiplayer')),
    h(
      'div',
      { class: 'panel' },
      h('h3', {}, 'Host a game'),
      h('p', { class: 'hint' }, 'Pick the settings, then share your room code.'),
      h('button', { class: 'btn btn-primary', onclick: () => go.settings('host') }, 'Host'),
    ),
    h('div', { class: 'divider' }, 'or'),
    h(
      'form',
      { class: 'panel', onsubmit: onJoin },
      h('h3', {}, 'Join a game'),
      h('div', { class: 'join-row' }, code, join),
      error,
    ),
  );
}
