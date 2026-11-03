import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type MatchEvent } from '../engine/match';
import { CARD_FLIP_MS, COUNTDOWN_MS, type HostMsg, type SeatInfo } from '../net/protocol';
import { HostSession } from './HostSession';

const seat = (name: string, cpu: boolean): SeatInfo => ({ name, avatar: { emoji: '🦊', colour: '#e5484d' }, cpu, connected: true });

function setup() {
  const session = new HostSession([seat('Me', false), seat('Bot', true)], { ...DEFAULT_SETTINGS, playerCount: 2 });
  const received: HostMsg[] = [];
  session.attach(0, (m) => received.push(m));
  const reactions = () => received.filter((m) => m.t === 'react');
  return { session, reactions };
}

/** Feed events through the session's CPU reaction hook without playing a real game. */
const fire = (session: HostSession, events: MatchEvent[]) =>
  (session as unknown as { cpuReactions(e: MatchEvent[]): void }).cpuReactions(events);

describe('start of game countdown', () => {
  const LOCK_MS = COUNTDOWN_MS + CARD_FLIP_MS;

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function started(seats: SeatInfo[]) {
    const session = new HostSession(seats, { ...DEFAULT_SETTINGS, playerCount: seats.length });
    const received: HostMsg[] = [];
    session.attach(0, (m) => received.push(m));
    session.start();
    const states = () => received.flatMap((m) => (m.t === 'state' ? [m] : []));
    return { session, received, states, last: () => states().at(-1)! };
  }

  it('holds the game until the countdown and card flip are done', () => {
    const { last } = started([seat('Me', false), seat('Bot', true)]);
    expect(last().view.countdownMs).toBe(LOCK_MS);
    expect(last().view.turnMsLeft).toBeNull();
    expect(last().view.gameElapsedMs).toBe(0);
    vi.advanceTimersByTime(LOCK_MS - 1);
    expect(last().view.countdownMs).toBe(LOCK_MS);
    vi.advanceTimersByTime(1);
    expect(last().view.countdownMs).toBeNull();
    expect(last().view.gameElapsedMs).toBe(0);
  });

  it('rejects actions while counting down', () => {
    const { session, received, states } = started([seat('Me', false), seat('Bot', true)]);
    const before = states().length;
    session.submit(0, { type: 'draw' });
    expect(received.at(-1)).toEqual({ t: 'reject', reason: 'Get ready…' });
    expect(states()).toHaveLength(before);
  });

  it('CPUs wait for the countdown too', () => {
    const { states } = started([seat('Bot', true), seat('Bot 2', true)]);
    vi.advanceTimersByTime(LOCK_MS - 1);
    expect(states().flatMap((s) => s.events).filter((e) => e.type === 'play' || e.type === 'draw')).toEqual([]);
    vi.advanceTimersByTime(8000);
    expect(states().flatMap((s) => s.events).some((e) => e.type === 'play' || e.type === 'draw')).toBe(true);
  });

  it('crowns the last game winner for the next game, and moves the crown to each new winner', () => {
    const { session, last } = started([seat('Me', false), seat('Bot', true)]);
    const afterChange = (e: MatchEvent[]) => (session as unknown as { afterChange(e: MatchEvent[]): void }).afterChange(e);
    const won = (winner: number, matchWinner: number | null) => ({
      type: 'gameOver' as const,
      result: { winner, points: 50, lastStanding: false, roundWinner: null, matchWinner, leftover: [0, 0] },
    });
    expect(last().view.champion).toBeNull();
    afterChange([won(1, null)]); // round carries on
    expect(last().view.champion).toBe(1);
    afterChange([won(0, null)]);
    expect(last().view.champion).toBe(0);
    afterChange([won(1, 1)]); // match over, then a rematch
    session.start();
    expect(last().view.champion).toBe(1);
  });

  it('counts down again for a rematch', () => {
    const { session, last } = started([seat('Me', false), seat('Bot', true)]);
    vi.advanceTimersByTime(LOCK_MS);
    session.start();
    expect(last().view.countdownMs).toBe(LOCK_MS);
  });
});

describe('reactions', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('broadcasts a reaction to every seat', () => {
    const { session, reactions } = setup();
    session.react(1, 'beer');
    expect(reactions()).toEqual([{ t: 'react', seat: 1, react: 'beer' }]);
  });

  it('rate-limits each seat and ignores unknown reactions', () => {
    const { session, reactions } = setup();
    session.react(0, 'lol');
    session.react(0, 'lol');
    session.react(0, 'nope' as never);
    expect(reactions()).toHaveLength(1);
    vi.advanceTimersByTime(700);
    session.react(0, 'sad');
    expect(reactions()).toHaveLength(2);
  });

  it('a CPU spams a burst of 3 to 6 of the same emoji when it reacts', () => {
    for (const [random, burst] of [[0, 3], [0.4, 4], [0.99, 6]] as const) {
      // The first random is the chance to react at all; the rest set the burst size.
      vi.spyOn(Math, 'random').mockReturnValue(random).mockReturnValueOnce(0);
      const { session, reactions } = setup();
      // A penalty also brings a skip: still only one burst.
      fire(session, [
        { type: 'draw', player: 1, count: 4, reason: 'penalty' },
        { type: 'skip', player: 1 },
      ]);
      vi.advanceTimersByTime(4000);
      expect(reactions()).toHaveLength(burst);
      expect(new Set(reactions().map((m) => JSON.stringify(m))).size).toBe(1);
      session.dispose();
    }
  });

  it('humans never get automatic reactions', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { session, reactions } = setup();
    fire(session, [{ type: 'skip', player: 0 }]);
    vi.advanceTimersByTime(2000);
    expect(reactions()).toHaveLength(0);
  });

  it('pending CPU reactions are cancelled when the session ends', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { session, reactions } = setup();
    fire(session, [{ type: 'skip', player: 1 }]);
    session.dispose();
    vi.advanceTimersByTime(2000);
    expect(reactions()).toHaveLength(0);
  });
});
