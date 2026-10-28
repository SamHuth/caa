import Peer, { type PeerOptions } from 'peerjs';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
export const CODE_LENGTH = 5;
const ID_PREFIX = 'cards-against-angali-';

export const PING_MS = 2000;
export const PEER_TIMEOUT_MS = 8000;
export const CONNECT_TIMEOUT_MS = 12000;

export function randomCode(): string {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
}

export function normaliseCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

export function peerIdFor(code: string): string {
  return ID_PREFIX + code;
}

function peerOptions(): PeerOptions {
  const env = import.meta.env;
  const iceServers: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
  if (env.VITE_TURN_URL) {
    iceServers.push({ urls: env.VITE_TURN_URL, username: env.VITE_TURN_USERNAME, credential: env.VITE_TURN_CREDENTIAL });
  }
  const opts: PeerOptions = { config: { iceServers } };
  if (env.VITE_PEER_HOST) {
    opts.host = env.VITE_PEER_HOST;
    opts.port = Number(env.VITE_PEER_PORT || 443);
    opts.path = env.VITE_PEER_PATH || '/';
    opts.secure = true;
  }
  return opts;
}

export function createPeer(id?: string): Peer {
  return id ? new Peer(id, peerOptions()) : new Peer(peerOptions());
}

/** Persistent per-browser token so a refreshed guest can reclaim their seat. */
export function playerToken(): string {
  try {
    let token = localStorage.getItem('angali-token');
    if (!token) {
      token = crypto.randomUUID();
      localStorage.setItem('angali-token', token);
    }
    return token;
  } catch {
    return crypto.randomUUID();
  }
}
