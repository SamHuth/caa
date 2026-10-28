import type { PeerGuest } from '../../net/PeerGuest';
import type { PeerHost } from '../../net/PeerHost';
import type { LobbyInfo } from '../../net/protocol';
import { go } from '../app';
import { h, modal, toast } from '../dom';
import { CPU_EMOJI, avatarEl } from '../profile';

function shareLink(code: string) {
  return `${location.origin}${location.pathname}?code=${code}`;
}

async function share(code: string) {
  const url = shareLink(code);
  const text = `Join my Cards Against Angali game! Code: ${code}`;
  try {
    if (navigator.share) return await navigator.share({ title: 'Cards Against Angali', text, url });
    await navigator.clipboard.writeText(url);
    toast('Invite link copied');
  } catch {
    /* share sheet dismissed */
  }
}

function settingsSummary(lobby: LobbyInfo) {
  const s = lobby.settings;
  return h(
    'ul',
    { class: 'summary' },
    h('li', {}, `${s.playerCount} players`),
    h('li', {}, `CPU: ${s.cpuDifficulty}`),
    h('li', {}, `${s.turnTimer}s turns`),
    h('li', {}, `${s.handSize} cards`),
    h('li', {}, `First to ${s.roundScoreLimit}`),
    h('li', {}, `Best of ${s.bestOf}`),
  );
}

function playerList(lobby: LobbyInfo) {
  const rows = lobby.players.map((p, i) =>
    h(
      'li',
      { class: `lobby-player ${i === lobby.you ? 'me' : ''}` },
      avatarEl(p.avatar, 'small'),
      h('span', { class: 'lp-name' }, p.name, i === lobby.you ? ' (you)' : ''),
      h('span', { class: `lp-status ${p.ready ? 'ready' : ''}` }, p.host ? 'Host' : p.ready ? 'Ready ✓' : 'Not ready'),
    ),
  );
  for (let i = lobby.players.length; i < lobby.settings.playerCount; i++) {
    rows.push(h('li', { class: 'lobby-player cpu' }, avatarEl({ emoji: CPU_EMOJI, colour: 'transparent' }, 'small'), h('span', { class: 'lp-name' }, 'Open seat (CPU)'), h('span', { class: 'lp-status' }, '')));
  }
  return h('ul', { class: 'lobby-list' }, ...rows);
}

function lobbyLayout(lobby: LobbyInfo, list: HTMLElement, actions: HTMLElement, onLeave: () => void) {
  return h(
    'main',
    { class: 'screen lobby' },
    h('header', { class: 'screen-header' }, h('button', { class: 'btn-back', onclick: onLeave }, '‹ Leave'), h('h2', {}, 'Lobby')),
    h(
      'div',
      { class: 'panel code-panel' },
      h('span', { class: 'hint' }, 'Room code'),
      h('div', { class: 'room-code' }, lobby.code),
      h('button', { class: 'btn btn-ghost', onclick: () => share(lobby.code) }, 'Share invite'),
    ),
    settingsSummary(lobby),
    list,
    actions,
  );
}

export function hostLobbyScreen(host: PeerHost) {
  let started = false;
  const list = h('div', {});
  const start = h('button', { class: 'btn btn-primary' }, 'Start Game');
  const hint = h('p', { class: 'hint center' });
  const render = (lobby: LobbyInfo) => {
    list.replaceChildren(playerList(lobby));
    const waiting = lobby.players.filter((p) => !p.ready).length;
    start.disabled = !host.canStart();
    hint.textContent = waiting ? `Waiting for ${waiting} player${waiting > 1 ? 's' : ''} to ready up…` : lobby.players.length === 1 ? 'Waiting for players… or start now against CPUs.' : 'Everyone is ready!';
  };
  start.onclick = () => {
    started = true;
    go.game(host.start());
  };
  host.onLobby = render;
  const lobby = host.lobby();
  const el = lobbyLayout(lobby, list, h('div', { class: 'stack' }, start, hint), () => go.home());
  render(lobby);
  return {
    el,
    cleanup: () => {
      host.onLobby = () => {};
      if (!started) host.close();
    },
  };
}

export function guestLobbyScreen(guest: PeerGuest, first: LobbyInfo) {
  let ready = false;
  let leaving = true;
  const list = h('div', {});
  const readyBtn = h('button', { class: 'btn btn-primary' }, 'Ready');
  const hint = h('p', { class: 'hint center' }, 'Waiting for the host to start…');
  readyBtn.onclick = () => {
    ready = !ready;
    guest.setReady(ready);
    readyBtn.textContent = ready ? 'Not ready' : 'Ready';
    readyBtn.classList.toggle('btn-ghost', ready);
  };
  const render = (lobby: LobbyInfo) => list.replaceChildren(playerList(lobby));
  guest.onMessage((msg) => {
    if (msg.t === 'lobby') render(msg.lobby);
    else if (msg.t === 'state') {
      leaving = false;
      go.game(guest, msg);
    } else if (msg.t === 'closed') {
      leaving = false;
      const home = h('button', { class: 'btn btn-primary' }, 'Home');
      const { close } = modal([h('h2', {}, 'Room closed'), h('p', {}, msg.reason), home]);
      home.onclick = () => (close(), go.home());
    }
  });
  const el = lobbyLayout(first, list, h('div', { class: 'stack' }, readyBtn, hint), () => go.home());
  render(first);
  return {
    el,
    cleanup: () => {
      if (leaving) guest.leave();
    },
  };
}
