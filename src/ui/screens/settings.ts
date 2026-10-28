import { type Difficulty, LIMITS, type Settings, maxHandSize } from '../../engine/match';
import { PeerHost } from '../../net/PeerHost';
import { go, playerName, savedSettings } from '../app';
import { h, toast } from '../dom';

function stepper(label: string, get: () => number, set: (v: number) => void, opts: { min: () => number; max: () => number; step?: number; unit?: string }) {
  const value = h('output', { class: 'stepper-value' });
  const dec = h('button', { class: 'btn-round', 'aria-label': `Decrease ${label}` }, '−');
  const inc = h('button', { class: 'btn-round', 'aria-label': `Increase ${label}` }, '+');
  const step = opts.step ?? 1;
  const refresh = () => {
    value.textContent = `${get()}${opts.unit ?? ''}`;
    dec.disabled = get() <= opts.min();
    inc.disabled = get() >= opts.max();
  };
  dec.onclick = () => (set(Math.max(opts.min(), get() - step)), refreshAll());
  inc.onclick = () => (set(Math.min(opts.max(), get() + step)), refreshAll());
  refreshers.push(refresh);
  return h('div', { class: 'setting' }, h('span', { class: 'setting-label' }, label), h('div', { class: 'stepper' }, dec, value, inc));
}

function segmented<T extends string | number>(label: string, options: [T, string][], get: () => T, set: (v: T) => void) {
  const buttons = options.map(([v, text]) =>
    h('button', { class: 'seg', onclick: () => (set(v), refreshAll()) }, text),
  );
  refreshers.push(() => buttons.forEach((b, i) => b.classList.toggle('active', options[i][0] === get())));
  return h('div', { class: 'setting' }, h('span', { class: 'setting-label' }, label), h('div', { class: 'segmented' }, ...buttons));
}

let refreshers: (() => void)[] = [];
const refreshAll = () => refreshers.forEach((r) => r());

export function settingsScreen(mode: 'single' | 'host') {
  refreshers = [];
  const s: Settings = savedSettings.get();
  const clampHand = () => (s.handSize = Math.min(s.handSize, maxHandSize(s.playerCount)));

  const start = h('button', { class: 'btn btn-primary' }, mode === 'single' ? 'Start Game' : 'Create Room');
  start.onclick = async () => {
    clampHand();
    savedSettings.set(s);
    if (mode === 'single') return go.singlePlayer(s);
    start.disabled = true;
    start.textContent = 'Creating room…';
    try {
      go.hostLobby(await PeerHost.create(playerName.display(), { ...s }));
    } catch (err) {
      toast((err as Error).message, 'error');
      start.disabled = false;
      start.textContent = 'Create Room';
    }
  };

  const el = h(
    'main',
    { class: 'screen settings' },
    h('header', { class: 'screen-header' }, h('button', { class: 'btn-back', onclick: () => (mode === 'single' ? go.home() : go.multiplayer()) }, '‹ Back'), h('h2', {}, 'Game Settings')),
    h(
      'div',
      { class: 'panel' },
      stepper('Players', () => s.playerCount, (v) => ((s.playerCount = v), clampHand()), {
        min: () => LIMITS.playerCount[0],
        max: () => LIMITS.playerCount[1],
      }),
      h('p', { class: 'hint' }, mode === 'host' ? 'Seats nobody joins are filled by CPUs.' : 'Everyone else is a CPU.'),
      segmented<Difficulty>('CPU difficulty', [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']], () => s.cpuDifficulty, (v) => (s.cpuDifficulty = v)),
      stepper('Turn timer', () => s.turnTimer, (v) => (s.turnTimer = v), { min: () => LIMITS.turnTimer[0], max: () => LIMITS.turnTimer[1], unit: 's' }),
      stepper('Starting hand', () => s.handSize, (v) => (s.handSize = v), { min: () => LIMITS.handSize[0], max: () => maxHandSize(s.playerCount) }),
      stepper('Round score limit', () => s.roundScoreLimit, (v) => (s.roundScoreLimit = v), {
        min: () => LIMITS.roundScoreLimit[0],
        max: () => LIMITS.roundScoreLimit[1],
        step: 25,
      }),
      segmented<number>('Best of (rounds)', [[1, '1'], [3, '3'], [5, '5'], [7, '7']], () => s.bestOf, (v) => (s.bestOf = v)),
    ),
    start,
  );
  refreshAll();
  return el;
}
