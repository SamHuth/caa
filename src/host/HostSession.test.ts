import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type MatchEvent } from '../engine/match';
import type { HostMsg, SeatInfo } from '../net/protocol';
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

  it('a CPU reacts when it is hit with a penalty', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { session, reactions } = setup();
    fire(session, [{ type: 'draw', player: 1, count: 4, reason: 'penalty' }]);
    vi.advanceTimersByTime(2000);
    expect(reactions()).toEqual([{ t: 'react', seat: 1, react: 'angry' }]);
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
