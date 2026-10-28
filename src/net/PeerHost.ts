import type Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { HostSession, LocalTransport } from '../host/HostSession';
import type { Settings } from '../engine/match';
import { type Profile, cpuSeats, sanitiseProfile } from '../ui/profile';
import { PEER_TIMEOUT_MS, PING_MS, createPeer, peerIdFor, randomCode } from './peer';
import type { Avatar, GuestMsg, HostMsg, LobbyInfo, SeatInfo } from './protocol';

interface Guest {
  token: string;
  name: string;
  avatar: Avatar;
  ready: boolean;
  conn: DataConnection | null;
  lastSeen: number;
  rtt: number;
  /** Seat in the running match, once started. */
  seat: number | null;
}

/** Hosts a room from this browser: lobby, then an authoritative HostSession over WebRTC. */
export class PeerHost {
  private guests: Guest[] = [];
  private session: HostSession | null = null;
  private pingTimer: ReturnType<typeof setInterval>;
  onLobby: (lobby: LobbyInfo) => void = () => {};

  private constructor(
    private peer: Peer,
    readonly code: string,
    readonly host: Profile,
    readonly settings: Settings,
  ) {
    peer.on('connection', (conn) => this.accept(conn));
    peer.on('disconnected', () => peer.reconnect()); // signaling dropped; data channels survive
    this.pingTimer = setInterval(() => this.tick(), PING_MS);
  }

  static create(host: Profile, settings: Settings, attempts = 4): Promise<PeerHost> {
    return new Promise((resolve, reject) => {
      const code = randomCode();
      const peer = createPeer(peerIdFor(code));
      peer.once('open', () => resolve(new PeerHost(peer, code, host, settings)));
      peer.once('error', (err) => {
        peer.destroy();
        if (err.type === 'unavailable-id' && attempts > 1) {
          PeerHost.create(host, settings, attempts - 1).then(resolve, reject);
        } else {
          reject(new Error(err.type === 'network' ? "Couldn't reach the matchmaking server" : err.message));
        }
      });
    });
  }

  get started() {
    return this.session !== null;
  }

  lobby(forGuest: Guest | null = null): LobbyInfo {
    const connected = this.guests.filter((g) => g.conn);
    return {
      code: this.code,
      settings: this.settings,
      players: [
        { ...this.host, ready: true, host: true, connected: true },
        ...connected.map((g) => ({ name: g.name, avatar: g.avatar, ready: g.ready, host: false, connected: true })),
      ],
      you: forGuest ? connected.indexOf(forGuest) + 1 : 0,
    };
  }

  canStart() {
    return this.guests.every((g) => !g.conn || g.ready);
  }

  /** Begin the match. Returns the host's own transport. */
  start(): LocalTransport {
    const players = this.guests.filter((g) => g.conn);
    this.guests = players;
    const seats: SeatInfo[] = [
      { ...this.host, cpu: false, connected: true },
      ...players.map((g) => ({ name: g.name, avatar: g.avatar, cpu: false, connected: true })),
      ...cpuSeats(this.settings.playerCount - players.length - 1, [this.host.name, ...players.map((g) => g.name)]),
    ];
    players.forEach((g, i) => (g.seat = i + 1));
    this.session = new HostSession(seats, this.settings);
    for (const g of players) this.session.attach(g.seat!, (msg) => this.send(g, msg));
    this.updateJumpDelay();
    this.session.start();
    return new LocalTransport(this.session, 0, () => this.close());
  }

  close() {
    for (const g of this.guests) this.send(g, { t: 'closed', reason: 'The host left the game' });
    clearInterval(this.pingTimer);
    this.session?.dispose();
    // Give the goodbye messages a moment to flush before tearing down.
    setTimeout(() => this.peer.destroy(), 300);
  }

  private accept(conn: DataConnection) {
    conn.on('data', (data) => this.receive(conn, data as GuestMsg));
    conn.on('close', () => this.drop(conn));
    conn.on('error', () => this.drop(conn));
  }

  private receive(conn: DataConnection, msg: GuestMsg) {
    if (msg.t === 'join') return this.join(conn, msg);
    const g = this.guests.find((g) => g.conn === conn);
    if (!g) return;
    g.lastSeen = Date.now();
    switch (msg.t) {
      case 'ready':
        g.ready = msg.ready;
        this.broadcastLobby();
        break;
      case 'action':
        if (this.session && g.seat !== null) this.session.submit(g.seat, msg.action);
        break;
      case 'pong':
        g.rtt = Date.now() - msg.ts;
        this.updateJumpDelay();
        break;
      case 'leave':
        this.drop(conn);
        conn.close();
        break;
    }
  }

  private join(conn: DataConnection, msg: Extract<GuestMsg, { t: 'join' }>) {
    const { token } = msg;
    const { name, avatar } = sanitiseProfile(msg.name, msg.avatar);
    const existing = this.guests.find((g) => g.token === token);
    if (existing) {
      // Rejoin (e.g. refreshed tab): take back the seat.
      existing.conn?.close();
      existing.conn = conn;
      existing.name = name;
      existing.avatar = avatar;
      existing.lastSeen = Date.now();
      if (this.session && existing.seat !== null) {
        this.session.attach(existing.seat, (msg) => this.send(existing, msg));
        this.session.setConnected(existing.seat, true);
      } else {
        this.broadcastLobby();
      }
      return;
    }
    const refuse = (reason: string) => {
      conn.send({ t: 'closed', reason } satisfies HostMsg);
      setTimeout(() => conn.close(), 300);
    };
    if (this.session) return refuse('That game has already started');
    if (this.guests.filter((g) => g.conn).length >= this.settings.playerCount - 1) return refuse('That room is full');
    this.guests.push({ token, name, avatar, ready: false, conn, lastSeen: Date.now(), rtt: 100, seat: null });
    this.broadcastLobby();
  }

  private drop(conn: DataConnection) {
    const g = this.guests.find((g) => g.conn === conn);
    if (!g) return;
    g.conn = null;
    if (this.session && g.seat !== null) {
      this.session.detach(g.seat);
      this.session.setConnected(g.seat, false);
    } else {
      this.guests = this.guests.filter((x) => x !== g);
      this.broadcastLobby();
    }
  }

  private send(g: Guest, msg: HostMsg) {
    if (g.conn?.open) g.conn.send(msg);
  }

  private broadcastLobby() {
    for (const g of this.guests) this.send(g, { t: 'lobby', lobby: this.lobby(g) });
    this.onLobby(this.lobby());
  }

  private tick() {
    const now = Date.now();
    for (const g of [...this.guests]) {
      if (!g.conn) continue;
      if (now - g.lastSeen > PEER_TIMEOUT_MS) {
        const conn = g.conn;
        this.drop(conn);
        conn.close();
      } else {
        this.send(g, { t: 'ping', ts: now });
      }
    }
  }

  /** Delay the host's own jump-ins by roughly a guest's one-way latency. */
  private updateJumpDelay() {
    if (!this.session) return;
    const rtts = this.guests.filter((g) => g.conn).map((g) => g.rtt).sort((a, b) => a - b);
    const median = rtts.length ? rtts[Math.floor(rtts.length / 2)] : 0;
    this.session.jumpDelay.set(0, Math.min(median / 2, 250));
  }
}
