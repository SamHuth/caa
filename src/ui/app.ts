import { DEFAULT_SETTINGS, LIMITS, type Settings } from '../engine/match';
import { HostSession, LocalTransport } from '../host/HostSession';
import { normaliseCode } from '../net/peer';
import { PeerGuest } from '../net/PeerGuest';
import { PeerHost } from '../net/PeerHost';
import type { HostMsg, LobbyInfo, Transport } from '../net/protocol';
import { holdWakeLock, showScreen, store } from './dom';
import { GameScreen } from './game/GameScreen';
import { cpuNames } from './names';
import { homeScreen } from './screens/home';
import { guestLobbyScreen, hostLobbyScreen } from './screens/lobby';
import { multiplayerScreen } from './screens/multiplayer';
import { settingsScreen } from './screens/settings';

export const playerName = {
  get: () => store.get('name', ''),
  set: (name: string) => store.set('name', name.trim().slice(0, 16)),
  display: () => store.get('name', '').trim() || 'You',
};

export const savedSettings = {
  get: (): Settings => {
    const s = { ...DEFAULT_SETTINGS, ...store.get<Partial<Settings>>('settings', {}) };
    // Settings saved by older versions may fall outside today's limits.
    const [min, max] = LIMITS.turnTimer;
    s.turnTimer = Math.min(max, Math.max(min, s.turnTimer));
    return s;
  },
  set: (s: Settings) => store.set('settings', s),
};

/** Screen navigation. */
export const go = {
  home() {
    holdWakeLock(false);
    showScreen(homeScreen());
  },

  multiplayer(code = '') {
    showScreen(multiplayerScreen(normaliseCode(code)));
  },

  settings(mode: 'single' | 'host') {
    showScreen(settingsScreen(mode));
  },

  singlePlayer(settings: Settings) {
    const seats = [
      { name: playerName.display(), cpu: false, connected: true },
      ...cpuNames(settings.playerCount - 1).map((name) => ({ name, cpu: true, connected: true })),
    ];
    const session = new HostSession(seats, settings);
    const transport = new LocalTransport(session, 0);
    go.game(transport);
    session.start();
  },

  hostLobby(host: PeerHost) {
    holdWakeLock(true);
    const { el, cleanup } = hostLobbyScreen(host);
    showScreen(el, cleanup);
  },

  guestLobby(guest: PeerGuest, lobby: LobbyInfo) {
    const { el, cleanup } = guestLobbyScreen(guest, lobby);
    showScreen(el, cleanup);
  },

  /** `first` is a message already received by the previous screen's listener. */
  game(transport: Transport, first?: HostMsg) {
    const screen = new GameScreen(transport);
    showScreen(screen.el, () => screen.destroy());
    if (first) screen.handle(first);
    transport.onMessage((msg) => screen.handle(msg));
  },
};
