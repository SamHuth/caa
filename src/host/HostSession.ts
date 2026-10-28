import { cpuColour, cpuJumpIn, cpuMove, cpuSwapTarget, cpuThinkMs } from '../engine/cpu';
import { MAX_DRAW, nextPlayer, pileOf, stackOf, topCard } from '../engine/game';
import { type MatchAction, type MatchEvent, type MatchState, type Settings, newMatch, reduceMatch } from '../engine/match';
import { randomSeed } from '../engine/rng';
import { redact, redactEvents } from '../engine/view';
import { type ClientAction, type ClientView, type HostMsg, type ReactionKey, type SeatInfo, type Transport, isReaction } from '../net/protocol';

type Listener = (msg: HostMsg) => void;
type Timer = ReturnType<typeof setTimeout>;

const NEXT_GAME_MS = 6000;
/** Minimum gap between one seat's reactions. */
const REACT_COOLDOWN_MS = 150;
/** How often a CPU reacts when something happens to it. */
const CPU_REACT_CHANCE = 0.45;
const NEXT_ROUND_MS = 8000;

/**
 * Authoritative match runner. Owns the engine state, turn timers and CPU seats, and
 * sends each attached seat its redacted view. Single player is a session with no
 * remote seats; in multiplayer it runs in the host's browser.
 */
export class HostSession {
  private m!: MatchState;
  private listeners = new Map<number, Listener>();
  /** Turn timer, CPU move and next-game timers: reset on every state change. */
  private stepTimers: Timer[] = [];
  /** CPU jump-in timers: reset only when the top card changes. */
  private jumpTimers: Timer[] = [];
  private plannedTop = -1;
  private turnDeadline: number | null = null;
  private nextGameAt: number | null = null;
  /** CPU reaction timers: independent of game timers so state changes don't cancel them. */
  private reactTimers = new Set<Timer>();
  private lastReact = new Map<number, number>();
  /** Extra delay on out-of-turn plays per seat, to offset the host's zero latency. */
  readonly jumpDelay = new Map<number, number>();

  constructor(
    readonly seats: SeatInfo[],
    readonly settings: Settings,
  ) {}

  start() {
    this.clearTimers();
    this.clearJumpTimers();
    const { state, events } = newMatch({ ...this.settings, playerCount: this.seats.length }, randomSeed());
    this.m = state;
    this.afterChange(events);
  }

  attach(seat: number, fn: Listener) {
    this.listeners.set(seat, fn);
    if (this.m) fn(this.stateMsg(seat, []));
  }

  detach(seat: number) {
    this.listeners.delete(seat);
  }

  /** A dropped human is played by a CPU until they reconnect. */
  setConnected(seat: number, connected: boolean) {
    if (this.seats[seat].connected === connected) return;
    this.seats[seat].connected = connected;
    this.plannedTop = -1;
    this.afterChange([]);
  }

  submit(seat: number, action: ClientAction) {
    const delay = this.jumpDelay.get(seat) ?? 0;
    const outOfTurn = action.type === 'play' && seat !== this.m.game.current;
    if (outOfTurn && delay > 0) setTimeout(() => this.apply(seat, { ...action, player: seat }), delay);
    else this.apply(seat, { ...action, player: seat });
  }

  /** Broadcast an emoji reaction from a seat (rate-limited per seat). */
  react(seat: number, key: ReactionKey) {
    if (!isReaction(key) || !this.seats[seat]) return;
    const now = Date.now();
    if (now - (this.lastReact.get(seat) ?? 0) < REACT_COOLDOWN_MS) return;
    this.lastReact.set(seat, now);
    for (const fn of this.listeners.values()) fn({ t: 'react', seat, react: key });
  }

  dispose() {
    this.clearTimers();
    this.clearJumpTimers();
    this.reactTimers.forEach(clearTimeout);
    this.reactTimers.clear();
    this.listeners.clear();
  }

  private isBot(seat: number) {
    return this.seats[seat].cpu || !this.seats[seat].connected;
  }

  private apply(seat: number, action: MatchAction): boolean {
    if (!this.m) return false;
    const r = reduceMatch(this.m, action);
    if (!r.ok) {
      this.listeners.get(seat)?.({ t: 'reject', reason: r.reason });
      return false;
    }
    this.m = r.state;
    this.afterChange(r.events);
    return true;
  }

  private afterChange(events: MatchEvent[]) {
    this.clearTimers();
    this.cpuReactions(events);
    if (events.some((e) => e.type === 'newGame')) {
      // Card ids repeat between games, so forget the previous jump-in plans.
      this.clearJumpTimers();
      this.plannedTop = -1;
    }
    this.schedule();
    for (const [seat, fn] of this.listeners) fn(this.stateMsg(seat, events));
  }

  /** CPUs sometimes react when something happens to them. */
  private cpuReactions(events: MatchEvent[]) {
    const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];
    const reactions: [number, ReactionKey[]][] = [];
    for (const e of events) {
      switch (e.type) {
        case 'draw':
          if (e.reason === 'penalty' || e.reason === 'smiley') reactions.push([e.player, ['angry', 'sad', 'skull']]);
          break;
        case 'skip':
          reactions.push([e.player, ['angry', 'sad']]);
          break;
        case 'swap':
          if (e.target !== null) {
            reactions.push([e.target, ['angry', 'skull', 'sad']]);
            reactions.push([e.player, ['cheeky', 'lol']]);
          }
          break;
        case 'play':
          if (e.jumpIn) reactions.push([e.player, ['cheeky', 'lol']]);
          break;
        case 'stack':
          if (e.total > 4) reactions.push([e.player, ['cheeky', 'lol']]);
          break;
        case 'gameOver': {
          reactions.push([e.result.winner, ['lol', 'beer', 'golf']]);
          const losers = this.seats.map((_, i) => i).filter((i) => i !== e.result.winner && this.seats[i].cpu);
          if (losers.length) reactions.push([pick(losers), ['sad', 'skull']]);
          break;
        }
      }
    }
    for (const [seat, options] of reactions) {
      if (!this.seats[seat]?.cpu || Math.random() > CPU_REACT_CHANCE) continue;
      const timer = setTimeout(() => {
        this.reactTimers.delete(timer);
        this.react(seat, pick(options));
      }, 400 + Math.random() * 900);
      this.reactTimers.add(timer);
    }
  }

  private stateMsg(seat: number, events: MatchEvent[]): HostMsg {
    const now = Date.now();
    const view: ClientView = {
      ...redact(this.m, seat),
      seats: this.seats,
      turnMsLeft: this.turnDeadline === null ? null : Math.max(0, this.turnDeadline - now),
      nextGameMs: this.nextGameAt === null ? null : Math.max(0, this.nextGameAt - now),
    };
    return { t: 'state', view, events: redactEvents(events, seat) };
  }

  private later(ms: number, fn: () => void) {
    this.stepTimers.push(setTimeout(fn, ms));
  }

  private schedule() {
    const m = this.m;
    const g = m.game;
    const difficulty = this.settings.cpuDifficulty;
    this.turnDeadline = null;
    this.nextGameAt = null;

    if (m.phase === 'gameOver' || m.phase === 'roundOver') {
      const ms = m.phase === 'roundOver' ? NEXT_ROUND_MS : NEXT_GAME_MS;
      this.nextGameAt = Date.now() + ms;
      this.later(ms, () => this.apply(-1, { type: 'nextGame' }));
      return;
    }
    if (m.phase !== 'playing') return;

    const actor = g.chooser ?? g.current;
    const turn = g.turn;
    if (this.isBot(actor)) {
      // Follow-up draws in the same turn are quick; the first decision takes "thinking" time.
      const think = g.drawnThisTurn > 0 ? 400 + Math.random() * 300 : cpuThinkMs(difficulty, Math.random);
      this.later(think, () => {
        const g = this.m.game;
        if (g.turn !== turn || this.m.phase !== 'playing') return;
        if (g.phase === 'chooseColour') {
          this.apply(actor, { type: 'chooseColour', player: actor, colour: cpuColour(g.hands[actor]) });
          return;
        }
        if (g.phase === 'chooseSwap') {
          this.apply(actor, { type: 'swap', player: actor, target: cpuSwapTarget(g.hands, actor) });
          return;
        }
        const move = cpuMove({
          hand: g.hands[actor],
          pile: pileOf(g),
          stack: stackOf(g),
          difficulty,
          canDraw: g.drawnThisTurn < MAX_DRAW,
          nextHandCount: g.hands[nextPlayer(g)].length,
          minOtherHandCount: Math.min(...g.hands.filter((_, i) => i !== actor).map((h) => h.length)),
          rand: Math.random,
        });
        this.apply(actor, move ? { ...move, player: actor } : { type: 'timeout', player: actor });
      });
    } else {
      const ms = this.settings.turnTimer * 1000;
      this.turnDeadline = Date.now() + ms;
      this.later(ms, () => {
        if (this.m.game.turn === turn) this.apply(actor, { type: 'timeout', player: actor });
      });
    }

    // CPUs (and covered seats) consider jumping in once per new top card.
    const top = topCard(g);
    if (g.phase === 'play' && top.id !== this.plannedTop) {
      this.clearJumpTimers();
      this.plannedTop = top.id;
      g.hands.forEach((hand, seat) => {
        if (seat === g.current || !this.isBot(seat)) return;
        const plan = cpuJumpIn(hand, pileOf(g), stackOf(g), difficulty, Math.random);
        if (!plan) return;
        this.jumpTimers.push(
          setTimeout(() => {
            const g = this.m.game;
            if (this.m.phase !== 'playing' || topCard(g).id !== top.id || seat === g.current) return;
            this.apply(seat, { type: 'play', player: seat, cardIds: [plan.cardId] });
          }, plan.delayMs),
        );
      });
    }
  }

  private clearTimers() {
    this.stepTimers.forEach(clearTimeout);
    this.stepTimers = [];
  }

  private clearJumpTimers() {
    this.jumpTimers.forEach(clearTimeout);
    this.jumpTimers = [];
  }
}

/** The game screen's view of a session running in this page. */
export class LocalTransport implements Transport {
  constructor(
    private session: HostSession,
    private seat: number,
    private onLeave: () => void = () => session.dispose(),
  ) {}

  send(action: ClientAction) {
    this.session.submit(this.seat, action);
  }

  react(key: ReactionKey) {
    this.session.react(this.seat, key);
  }

  onMessage(fn: (msg: HostMsg) => void) {
    this.session.attach(this.seat, fn);
  }

  leave() {
    this.session.detach(this.seat);
    this.onLeave();
  }

  rematch() {
    this.session.start();
  }
}
