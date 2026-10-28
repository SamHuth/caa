// Seeded PRNG (mulberry32) so games are reproducible in tests and simulations.
// The seed lives in game state; `rand` advances it in place.

export interface Seeded {
  rng: number;
}

export function rand(s: Seeded): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(s: Seeded, n: number): number {
  return Math.floor(rand(s) * n);
}

export function shuffle<T>(s: Seeded, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(s, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function randomSeed(): number {
  return (Math.random() * 0x7fffffff) | 0;
}
