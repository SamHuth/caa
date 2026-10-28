import type Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { CONNECT_TIMEOUT_MS, PEER_TIMEOUT_MS, createPeer, peerIdFor, playerToken } from './peer';
import type { Profile } from '../ui/profile';
import type { ClientAction, GuestMsg, HostMsg, ReactionKey, Transport } from './protocol';

/** A connection from this browser to a host's room. */
export class PeerGuest implements Transport {
  private listener: (msg: HostMsg) => void = () => {};
  private backlog: HostMsg[] = [];
  private lastSeen = Date.now();
  private watchdog: ReturnType<typeof setInterval>;
  private closed = false;

  private constructor(
    private peer: Peer,
    private conn: DataConnection,
    first: HostMsg,
  ) {
    this.backlog.push(first);
    conn.on('data', (data) => this.receive(data as HostMsg));
    conn.on('close', () => this.lost('Lost connection to the host'));
    this.watchdog = setInterval(() => {
      if (Date.now() - this.lastSeen > PEER_TIMEOUT_MS) this.lost('Lost connection to the host');
    }, 1000);
  }

  /** Resolves once the host has answered with a lobby or game state. */
  static join(code: string, me: Profile): Promise<PeerGuest> {
    return new Promise((resolve, reject) => {
      const peer = createPeer();
      let settled = false;
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        peer.destroy();
        reject(new Error(message));
      };
      const timer = setTimeout(() => fail("Couldn't connect to that room. Check the code, or try Wi-Fi."), CONNECT_TIMEOUT_MS);

      peer.on('error', (err) => {
        if (err.type === 'peer-unavailable') fail('No room found with that code');
        else if (err.type === 'network' || err.type === 'server-error') fail("Couldn't reach the matchmaking server");
        else fail(err.message);
      });
      peer.once('open', () => {
        const conn = peer.connect(peerIdFor(code), { reliable: true, serialization: 'json' });
        conn.once('open', () => conn.send({ t: 'join', name: me.name, avatar: me.avatar, token: playerToken() } satisfies GuestMsg));
        conn.once('data', (data) => {
          const msg = data as HostMsg;
          if (msg.t === 'closed') return fail(msg.reason);
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(new PeerGuest(peer, conn, msg));
        });
      });
    });
  }

  onMessage(fn: (msg: HostMsg) => void) {
    this.listener = fn;
    const pending = this.backlog;
    this.backlog = [];
    pending.forEach(fn);
  }

  send(action: ClientAction) {
    this.post({ t: 'action', action });
  }

  react(key: ReactionKey) {
    this.post({ t: 'react', react: key });
  }

  setReady(ready: boolean) {
    this.post({ t: 'ready', ready });
  }

  leave() {
    this.post({ t: 'leave' });
    this.shutdown();
  }

  private post(msg: GuestMsg) {
    if (this.conn.open) this.conn.send(msg);
  }

  private receive(msg: HostMsg) {
    this.lastSeen = Date.now();
    if (msg.t === 'ping') return this.post({ t: 'pong', ts: msg.ts });
    if (msg.t === 'closed') {
      this.listener(msg);
      return this.shutdown();
    }
    this.listener(msg);
  }

  private lost(reason: string) {
    if (this.closed) return;
    this.listener({ t: 'closed', reason });
    this.shutdown();
  }

  private shutdown() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.watchdog);
    setTimeout(() => this.peer.destroy(), 300);
  }
}
