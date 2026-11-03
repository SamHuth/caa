import { describe, expect, it } from 'vitest';
import { AVATAR_CHOICES, AVATAR_EMOJIS, NAME_MAX, avatarChoices, cpuSeats, randomProfile } from './profile';

describe('CPU seats', () => {
  it('name each CPU after its avatar emoji', () => {
    const named: Record<string, string> = { '🦊': 'Fox', '🐙': 'Octopus', '🍩': 'Donut', '👑': 'King' };
    for (let i = 0; i < 50; i++) {
      for (const s of cpuSeats(7)) {
        if (named[s.avatar.emoji]) expect(s.name.endsWith(` ${named[s.avatar.emoji]}`)).toBe(true);
        expect(s.name.length).toBeLessThanOrEqual(NAME_MAX);
      }
    }
  });

  it('every avatar emoji has a name, and every name fits', () => {
    const seats = cpuSeats(AVATAR_EMOJIS.length);
    expect(new Set(seats.map((s) => s.avatar.emoji)).size).toBe(AVATAR_EMOJIS.length);
    for (const s of seats) expect(s.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
  });

  it('never repeats an adjective at the table, including the players’', () => {
    for (let i = 0; i < 200; i++) {
      const seats = cpuSeats(7, { names: ['Feral Fox'], emojis: [] });
      const adjectives = seats.map((s) => s.name.split(' ')[0]);
      expect(new Set([...adjectives, 'Feral']).size).toBe(8);
    }
  });

  it('avoids emoji already at the table', () => {
    const seats = cpuSeats(7, { names: [], emojis: AVATAR_EMOJIS.slice(1) });
    expect(seats[0].avatar.emoji).toBe(AVATAR_EMOJIS[0]);
  });
});

describe('avatarChoices', () => {
  it('offers 24 different avatars from the bigger set, always including yours', () => {
    expect(AVATAR_EMOJIS.length).toBeGreaterThan(AVATAR_CHOICES);
    expect(new Set(AVATAR_EMOJIS).size).toBe(AVATAR_EMOJIS.length);
    for (let i = 0; i < 50; i++) {
      const choices = avatarChoices('💩');
      expect(choices).toHaveLength(AVATAR_CHOICES);
      expect(new Set(choices).size).toBe(AVATAR_CHOICES);
      expect(choices).toContain('💩');
    }
  });
});

describe('randomProfile', () => {
  it('gives a name that matches the avatar', () => {
    for (let i = 0; i < 100; i++) {
      const p = randomProfile();
      if (p.avatar.emoji === '🦊') expect(p.name).toMatch(/ Fox$/);
      expect(p.name.length).toBeLessThanOrEqual(NAME_MAX);
    }
  });
});
