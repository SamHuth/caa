import type { Avatar, SeatInfo } from '../net/protocol';
import { h, store } from './dom';

/** Every avatar emoji, each with the name a CPU (or the 🎲) gives it. The home screen shows a random 24. */
const AVATARS: [emoji: string, name: string][] = [
  ['🦊', 'Fox'], ['🐼', 'Panda'], ['🐸', 'Frog'], ['🐵', 'Monkey'], ['🦁', 'Lion'], ['🐯', 'Tiger'], ['🐨', 'Koala'], ['🐙', 'Octopus'],
  ['🦄', 'Unicorn'], ['🐧', 'Penguin'], ['🦉', 'Owl'], ['🐢', 'Turtle'], ['🦖', 'Dino'], ['🐳', 'Whale'], ['🦩', 'Flamingo'], ['🐝', 'Bee'],
  ['🐲', 'Dragon'], ['👽', 'Alien'], ['👻', 'Ghost'], ['🎃', 'Pumpkin'], ['😎', 'Dude'], ['🤠', 'Cowboy'], ['🥷', 'Ninja'], ['🧙', 'Wizard'],
  ['🐶', 'Pup'], ['🐱', 'Kitty'], ['🐰', 'Bunny'], ['🦈', 'Shark'], ['🦥', 'Sloth'], ['🍕', 'Pizza'], ['🌵', 'Cactus'], ['👑', 'King'],
  ['🐷', 'Piggy'], ['🐮', 'Cow'], ['🦔', 'Hedgehog'], ['🦝', 'Raccoon'], ['🐻', 'Bear'], ['🦒', 'Giraffe'], ['🐊', 'Croc'], ['🍩', 'Donut'],
  // The unusual ones
  ['🦑', 'Squid'], ['🦐', 'Shrimp'], ['🦞', 'Lobster'], ['🦀', 'Crab'], ['🐌', 'Snail'], ['🪱', 'Worm'], ['🦠', 'Microbe'], ['🧟', 'Zombie'],
  ['🧛', 'Vampire'], ['🧌', 'Troll'], ['🤡', 'Clown'], ['💩', 'Poop'], ['🗿', 'Statue'], ['🧀', 'Cheese'], ['🥦', 'Broccoli'], ['🥔', 'Potato'],
  ['🧄', 'Garlic'], ['🦷', 'Tooth'], ['🧠', 'Brain'], ['🦴', 'Bone'], ['🪳', 'Roach'], ['🦟', 'Mosquito'], ['🐀', 'Rat'], ['🦇', 'Bat'],
  ['🦃', 'Turkey'], ['🦤', 'Dodo'], ['🦭', 'Seal'], ['🦨', 'Skunk'], ['🦙', 'Llama'], ['🐡', 'Puffer'], ['🦦', 'Otter'], ['👺', 'Goblin'],
  ['👹', 'Ogre'], ['🪨', 'Rock'], ['🧽', 'Sponge'], ['🍄', 'Mushroom'], ['🥨', 'Pretzel'], ['🌭', 'Hotdog'], ['🧇', 'Waffle'], ['🧅', 'Onion'],
];

/** How many avatar choices the home screen shows (3 rows of 8). */
export const AVATAR_CHOICES = 24;

export const AVATAR_EMOJIS = AVATARS.map(([emoji]) => emoji);
const AVATAR_NAMES = new Map(AVATARS);
const AVATAR_NOUNS = new Set(AVATAR_NAMES.values());

export const AVATAR_COLOURS = ['#e5484d', '#f59e0b', '#22a860', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'];

/** Wild and unsettling. Long ones only go with short avatar names (see fitsWith). */
const ADJECTIVES = [
  'Moist', 'Damp', 'Clammy', 'Crusty', 'Gooey', 'Mouldy', 'Rancid', 'Festering', 'Possessed', 'Unwashed',
  'Twitchy', 'Lurking', 'Hollow', 'Screaming', 'Eyeless', 'Toothy', 'Grinning', 'Whispering', 'Forbidden', 'Feverish',
  'Deranged', 'Undead', 'Infested', 'Leaky', 'Sinister', 'Creepy', 'Slimy', 'Oozing', 'Shrieking', 'Melting',
  'Bloated', 'Gnawing', 'Restless', 'Nameless', 'Lumpy', 'Uncanny', 'Haunted', 'Cursed', 'Unhinged', 'Sweaty',
  'Feral', 'Rabid', 'Sticky', 'Soggy', 'Greasy', 'Toxic', 'Radioactive', 'Suspicious', 'Unblinking', 'Vacant',
  'Stinky', 'Wriggling', 'Itchy', 'Pungent', 'Hairy', 'Gurgling', 'Squelchy', 'Drooling', 'Flaky', 'Mangy',
  'Gremlin', 'Wretched', 'Sus', 'Glitchy', 'Smug', 'Chaotic', 'Nuclear', 'Bonkers', 'Spooky', 'Caffeinated',
];

/** Nouns the original name generator used; only here to recognise (and upgrade) names it made. */
const ANIMALS = [
  'Fox', 'Panda', 'Frog', 'Otter', 'Llama', 'Tiger', 'Koala', 'Octopus', 'Penguin', 'Owl',
  'Turtle', 'Badger', 'Whale', 'Flamingo', 'Gecko', 'Moose', 'Walrus', 'Hedgehog', 'Raccoon', 'Yak',
];

export const NAME_MAX = 16;

export const CPU_EMOJI = '🤖';

const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

/** "{Adjective} {Animal}" — every combination fits in NAME_MAX. */
/** A random pick of avatar emoji for the home screen, always including the one you're wearing. */
export function avatarChoices(current: string, count = AVATAR_CHOICES): string[] {
  const others = AVATAR_EMOJIS.filter((e) => e !== current).sort(() => Math.random() - 0.5);
  return [current, ...others.slice(0, count - 1)].sort(() => Math.random() - 0.5);
}

export function randomAvatar(): Avatar {
  return { emoji: pick(AVATAR_EMOJIS), colour: pick(AVATAR_COLOURS) };
}

const fitsWith = (noun: string) => (adjective: string) => adjective.length + 1 + noun.length <= NAME_MAX;

/** A wild name to match an avatar emoji: 🦊 → "Unhinged Fox". Skips adjectives in `avoid`. */
export function nameFor(emoji: string, avoid: Set<string> = new Set()): string {
  const noun = AVATAR_NAMES.get(emoji) ?? pick(ANIMALS);
  const fitting = ADJECTIVES.filter(fitsWith(noun));
  const fresh = fitting.filter((a) => !avoid.has(a));
  return `${pick(fresh.length ? fresh : fitting)} ${noun}`;
}

/** A random avatar with a name to match, for the 🎲 button and first visits. */
export function randomProfile(): Profile {
  const avatar = randomAvatar();
  return { name: nameFor(avatar.emoji), avatar };
}

/**
 * CPU seats get an avatar emoji and a matching "{Adjective} {Name}" (🦊 → "Unhinged Fox"),
 * avoiding emoji, and the adjectives of names, already at the table.
 */
export function cpuSeats(count: number, taken: { names: string[]; emojis: string[] } = { names: [], emojis: [] }): SeatInfo[] {
  const adjectives = new Set(taken.names.map((n) => n.split(' ')[0]));
  const freeEmojis = AVATAR_EMOJIS.filter((e) => !taken.emojis.includes(e)).sort(() => Math.random() - 0.5);
  const seats: SeatInfo[] = [];
  while (seats.length < count) {
    const emoji = freeEmojis.pop() ?? pick(AVATAR_EMOJIS);
    const name = nameFor(emoji, adjectives);
    adjectives.add(name.split(' ')[0]);
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
  const emoji = AVATAR_EMOJIS.includes(a.emoji as string) ? a.emoji! : AVATAR_EMOJIS[0];
  return {
    name: (typeof name === 'string' ? name.trim().slice(0, NAME_MAX) : '') || nameFor(emoji),
    avatar: {
      emoji,
      colour: AVATAR_COLOURS.includes(a.colour as string) ? a.colour! : AVATAR_COLOURS[0],
    },
  };
}

/**
 * Profiles saved before names matched avatars may hold a generated name for a different
 * avatar ("Dizzy Octopus" on a 🐼). Swap those for a matching one; names people typed stay.
 */
export function upgradeName(name: string, emoji: string): string {
  const words = name.split(' ');
  const generated = words.length === 2 && /^[A-Z][a-z]+$/.test(words[0]) && (ANIMALS.includes(words[1]) || AVATAR_NOUNS.has(words[1]));
  return generated && words[1] !== AVATAR_NAMES.get(emoji) ? nameFor(emoji) : name;
}

export interface Profile {
  name: string;
  avatar: Avatar;
}

/** The local player's saved identity; a random one is created on first visit. */
/** Bump when saved profiles need upgrading on load. 2: names match the avatar. */
const PROFILE_VERSION = 2;

export const profile = {
  get(): Profile {
    const saved = store.get<(Partial<Profile> & { v?: number }) | null>('profile', null);
    if (!saved) {
      const fresh = randomProfile();
      profile.set(fresh);
      return fresh;
    }
    const p = sanitiseProfile(saved.name, saved.avatar);
    if ((saved.v ?? 1) < PROFILE_VERSION) {
      p.name = upgradeName(p.name, p.avatar.emoji);
      profile.set(p);
    }
    return p;
  },
  set(p: Profile) {
    store.set('profile', { name: p.name.slice(0, NAME_MAX), avatar: p.avatar, v: PROFILE_VERSION });
  },
};
