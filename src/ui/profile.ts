import type { Avatar, SeatInfo } from '../net/protocol';
import { h, store } from './dom';

export const AVATAR_EMOJIS = [
  '🦊', '🐼', '🐸', '🐵', '🦁', '🐯', '🐨', '🐙',
  '🦄', '🐧', '🦉', '🐢', '🦖', '🐳', '🦩', '🐝',
  '🐲', '👽', '👻', '🎃', '😎', '🤠', '🥷', '🧙',
  '🐶', '🐱', '🐰', '🦈', '🦥', '🍕', '🌵', '👑',
];

export const AVATAR_COLOURS = ['#e5484d', '#f59e0b', '#22a860', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'];

const ADJECTIVES = [
  'Sneaky', 'Brave', 'Fluffy', 'Grumpy', 'Speedy', 'Sleepy', 'Cheeky', 'Mighty', 'Jolly', 'Sassy',
  'Fancy', 'Wobbly', 'Lucky', 'Clever', 'Funky', 'Zippy', 'Dizzy', 'Bouncy', 'Spicy', 'Cosmic',
];

const ANIMALS = [
  'Fox', 'Panda', 'Frog', 'Otter', 'Llama', 'Tiger', 'Koala', 'Octopus', 'Penguin', 'Owl',
  'Turtle', 'Badger', 'Whale', 'Flamingo', 'Gecko', 'Moose', 'Walrus', 'Hedgehog', 'Raccoon', 'Yak',
];

export const NAME_MAX = 16;

export const CPU_EMOJI = '🤖';

const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

/** "{Adjective} {Animal}" — every combination fits in NAME_MAX. */
export function randomName(): string {
  return `${pick(ADJECTIVES)} ${pick(ANIMALS)}`;
}

export function randomAvatar(): Avatar {
  return { emoji: pick(AVATAR_EMOJIS), colour: pick(AVATAR_COLOURS) };
}

/**
 * CPU seats get "{Adjective} {Animal}" names and avatar emoji like players do,
 * avoiding names and emoji already at the table.
 */
export function cpuSeats(count: number, taken: { names: string[]; emojis: string[] } = { names: [], emojis: [] }): SeatInfo[] {
  const names = new Set(taken.names);
  const freeEmojis = AVATAR_EMOJIS.filter((e) => !taken.emojis.includes(e)).sort(() => Math.random() - 0.5);
  const seats: SeatInfo[] = [];
  while (seats.length < count) {
    const name = randomName();
    if (names.has(name)) continue;
    names.add(name);
    const emoji = freeEmojis.pop() ?? pick(AVATAR_EMOJIS);
    seats.push({ name, avatar: { emoji, colour: pick(AVATAR_COLOURS) }, cpu: true, connected: true });
  }
  return seats;
}

export function avatarEl(avatar: Avatar, extraClass = '') {
  const el = h('span', { class: `avatar-badge ${extraClass}`, 'aria-hidden': 'true' }, avatar.emoji);
  el.style.background = avatar.colour;
  return el;
}

/** Clamp anything received from another player to the known emoji, colours and name length. */
export function sanitiseProfile(name: unknown, avatar: unknown): { name: string; avatar: Avatar } {
  const a = (avatar ?? {}) as Partial<Avatar>;
  return {
    name: (typeof name === 'string' ? name.trim().slice(0, NAME_MAX) : '') || randomName(),
    avatar: {
      emoji: AVATAR_EMOJIS.includes(a.emoji as string) ? a.emoji! : AVATAR_EMOJIS[0],
      colour: AVATAR_COLOURS.includes(a.colour as string) ? a.colour! : AVATAR_COLOURS[0],
    },
  };
}

export interface Profile {
  name: string;
  avatar: Avatar;
}

/** The local player's saved identity; a random one is created on first visit. */
export const profile = {
  get(): Profile {
    const saved = store.get<Partial<Profile> | null>('profile', null);
    if (saved) return sanitiseProfile(saved.name, saved.avatar);
    const fresh = { name: randomName(), avatar: randomAvatar() };
    store.set('profile', fresh);
    return fresh;
  },
  set(p: Profile) {
    store.set('profile', { name: p.name.slice(0, NAME_MAX), avatar: p.avatar });
  },
};
