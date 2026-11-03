import { type Card, COLOURS, type Colour, compareCards, isWild, sameFace } from '../../engine/cards';
import type { MatchEvent } from '../../engine/match';
import { type PlayContext, checkPlay } from '../../engine/rules';
import { CARD_FLIP_MS, type ClientView, type HostMsg, REACTIONS, type ReactionKey, type Transport } from '../../net/protocol';
import { go } from '../app';
import { cardBack, cardEl } from '../cardEl';
import { chickenConfetti } from '../chickenConfetti';
import { h, modal, toast } from '../dom';
import { HandInput } from './HandInput';

const RING_C = 2 * Math.PI * 30;

/** Three curved arrows chasing each other clockwise; mirrored in CSS when play runs anticlockwise. */
const DIRECTION_SVG = (() => {
  const r = 80;
  const at = (deg: number) => `${(r * Math.cos((deg * Math.PI) / 180)).toFixed(1)} ${(r * Math.sin((deg * Math.PI) / 180)).toFixed(1)}`;
  const arcs = [0, 120, 240].map((a) => `<path d="M ${at(a)} A ${r} ${r} 0 0 1 ${at(a + 85)}" marker-end="url(#dir-head)"/>`);
  return `<svg viewBox="-100 -100 200 200"><defs><marker id="dir-head" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z"/></marker></defs>${arcs.join('')}</svg>`;
})();
const FLY_MS = 380;
const PILE_VISIBLE = 4;
const REACTION_MS = 3200;
const REACTION_RISE = 300;
const REACTION_MIN_RISE = 90;

type Modal = ReturnType<typeof modal>;

/** Deterministic scatter so the discard stack doesn't jump around on re-render. */
const scatter = (id: number) => ({ rot: ((id * 37) % 25) - 12, x: ((id * 13) % 9) - 4, y: ((id * 7) % 7) - 3 });

export class GameScreen {
  readonly el: HTMLElement;
  private view: ClientView | null = null;
  private selected: number[] = [];
  private focus = 0;
  private pending = false;
  /** Cards just drawn into my hand, highlighted briefly since sorting hides where they landed. */
  private fresh = new Set<number>();
  private freshTimer: ReturnType<typeof setTimeout> | undefined;
  private pile: Card[] = [];
  /** Start-of-game overlay: 3, 2, 1, then the first card flips onto the pile. */
  private countdownEl = h('div', { class: 'countdown', 'aria-live': 'assertive' });
  private countdownTimers: ReturnType<typeof setTimeout>[] = [];
  private counting = false;
  /** The centre pile stays empty until the first card has landed. */
  private startCardHidden = false;
  private flipGhost: HTMLElement | null = null;
  /** Colour chosen for each wild on the pile (card ids repeat between games, so reset per game). */
  private painted = new Map<number, Colour>();
  /** Wild painted by this update, which gets a flip animation. */
  private justPainted: number | null = null;

  private info = h('div', { class: 'top-info' });
  private table = h('div', { class: 'table' });
  private seatsLayer = h('div', { class: 'seats' });
  private drawPile = h('button', { class: 'draw-pile', 'aria-label': 'Draw a card' });
  private discard = h('div', { class: 'discard', 'aria-live': 'polite' });
  private status = h('div', { class: 'status' });
  private banner = h('div', { class: 'banner' });
  private me = h('div', { class: 'me-bar' });
  private timerBar = h('div', { class: 'timer-bar' }, h('div', { class: 'timer-fill' }));
  private handEl = h('div', { class: 'hand', tabindex: 0, 'aria-label': 'Your hand' });
  private handRow = h('div', { class: 'hand-row' });
  private drawBtn = h('button', { class: 'btn btn-small btn-ghost' }, 'Draw');
  private playBtn = h('button', { class: 'btn btn-small btn-primary' }, 'Play');
  private handHint = h('p', { class: 'hand-hint' });
  private reactBar = h('div', { class: 'react-bar', role: 'group', 'aria-label': 'Reactions' });
  private reactButtons = new Map<ReactionKey, HTMLElement>();
  private lastSentReact = 0;

  private colourModal: Modal | null = null;
  private swapModal: Modal | null = null;
  /** Seat for each swap option (null = keep my hand), indexed by the 1–9 keys. */
  private swapOptions: number[] = [];
  private direction = h('div', { class: 'direction', 'aria-hidden': 'true' });
  private resultModal: Modal | null = null;
  private resultKey = '';
  private countdown: ReturnType<typeof setInterval> | undefined;
  /** Game clock, synced from the host's elapsed time on every update. */
  private clock = h('span', { class: 'pill clock', 'aria-label': 'Game time' }, '⏱ 0:00');
  private clockBase = Date.now();
  private clockRunning = false;
  private clockTimer = setInterval(() => this.tickClock(), 1000);
  private input: HandInput;
  private resize = new ResizeObserver(() => (this.layoutHand(), this.pointAtActor()));
  /** Arrow orbiting the pile that points at whoever must act. */
  private pointer = h('div', { class: 'turn-pointer', 'aria-hidden': 'true' }, h('div', { class: 'tp-arrow' }));
  private pointerAngle = 90;
  /** Last turn announced, so "Your turn!" fires once per turn. */
  private announced = '';

  constructor(private transport: Transport) {
    this.handEl.append(this.handRow);
    this.direction.innerHTML = DIRECTION_SVG;
    this.drawPile.onclick = () => this.draw();
    this.drawBtn.onclick = () => this.draw();
    this.playBtn.onclick = () => this.send();
    this.reactBar.append(
      ...(Object.keys(REACTIONS) as ReactionKey[]).map((key) => {
        const button = h('button', { class: 'react-opt', 'aria-label': key, title: key, onclick: () => this.sendReact(key) }, REACTIONS[key]);
        this.reactButtons.set(key, button);
        return button;
      }),
    );
    this.table.append(
      this.direction,
      this.pointer,
      this.seatsLayer,
      h('div', { class: 'centre' }, h('div', { class: 'piles' }, this.drawPile, this.discard), this.status),
      this.banner,
      this.countdownEl,
    );
    this.el = h(
      'main',
      { class: 'screen game' },
      h(
        'header',
        { class: 'game-top' },
        this.info,
        h('div', { class: 'top-right' }, this.clock, h('button', { class: 'btn-icon', 'aria-label': 'Leave game', onclick: () => this.confirmLeave() }, '✕')),
      ),
      this.table,
      h(
        'section',
        { class: 'player-area' },
        this.timerBar,
        this.reactBar,
        h('div', { class: 'me-row' }, this.me, h('div', { class: 'actions' }, this.drawBtn, this.playBtn)),
        this.handEl,
        this.handHint,
      ),
    );
    this.input = new HandInput(this.handEl, {
      toggle: (id) => this.toggle(id),
      send: () => this.send(),
      draw: () => this.draw(),
      move: (d) => this.moveFocus(d),
      toggleFocused: () => this.toggleFocused(),
      clear: () => ((this.selected = []), this.renderHand()),
      pick: (i) => {
        if (this.colourModal && i < COLOURS.length) this.pickColour(COLOURS[i]);
        else if (this.swapModal && i < this.swapOptions.length) this.pickSwap(this.swapOptions[i]);
      },
    });
    this.resize.observe(this.handEl);
    this.resize.observe(this.table);
  }

  destroy() {
    this.input.destroy();
    this.resize.disconnect();
    clearInterval(this.countdown);
    clearInterval(this.clockTimer);
    clearTimeout(this.freshTimer);
    this.clearCountdown();
    this.colourModal?.close();
    this.swapModal?.close();
    this.resultModal?.close();
  }

  handle(msg: HostMsg) {
    switch (msg.t) {
      case 'state':
        return this.update(msg.view, msg.events);
      case 'reject':
        return this.reject(msg.reason);
      case 'react':
        return this.floatReaction(msg.seat, msg.react);
      case 'closed':
        return this.showClosed(msg.reason);
    }
  }

  // ---------------------------------------------------------------- state

  private update(view: ClientView, events: MatchEvent[]) {
    // Remember where played cards come from before the DOM changes.
    const sources = new Map<number, DOMRect>();
    for (const e of events) {
      if (e.type !== 'play') continue;
      for (const c of e.cards) {
        const from = e.player === view.you ? this.handRow.querySelector(`[data-id="${c.id}"]`) : this.seatAvatar(e.player);
        if (from) sources.set(c.id, from.getBoundingClientRect());
      }
    }

    if (events.some((e) => e.type === 'newGame')) {
      this.pile = [];
      this.painted.clear();
      this.selected = [];
      this.resultModal?.close();
      this.resultModal = null;
      this.resultKey = '';
    }
    for (const e of events) {
      if (e.type === 'play') this.pile.push(...e.cards);
      if (e.type === 'colour') {
        const wild = this.pile.findLast(isWild);
        if (wild) {
          this.painted.set(wild.id, e.colour);
          this.justPainted = wild.id;
        }
      }
    }
    if (this.pile.at(-1)?.id !== view.top.id) this.pile = [view.top];
    this.pile = this.pile.slice(-PILE_VISIBLE);

    this.view = { ...view, hand: [...view.hand].sort(compareCards) };
    this.pending = false;
    const drawn = events.flatMap((e) => (e.type === 'draw' && e.player === view.you ? (e.cards ?? []) : []));
    if (drawn.length) {
      this.fresh = new Set(drawn.map((c) => c.id));
      clearTimeout(this.freshTimer);
      this.freshTimer = setTimeout(() => this.fresh.clear(), 1600);
    }
    const inHand = new Set(view.hand.map((c) => c.id));
    this.selected = this.selected.filter((id) => inHand.has(id));
    this.focus = Math.min(this.focus, Math.max(0, view.hand.length - 1));
    if (view.countdownMs !== null && !this.counting) this.startCountdown(view.countdownMs);
    const drewCard = events.some((e) => e.type === 'draw' && e.player === view.you && e.reason === 'draw');
    const autoSelected = drewCard && this.selectPlayable(drawn);

    this.render();
    if (autoSelected) this.handRow.children[this.focus]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.justPainted = null;
    this.animate(events, sources);
    this.syncModals();
  }

  private render() {
    const v = this.view!;
    this.info.replaceChildren(
      h('span', { class: 'pill' }, `Round ${v.round} · Game ${v.gameNumber}`),
      h('span', { class: 'pill subtle' }, `First to ${v.settings.roundScoreLimit} · Bo${v.settings.bestOf}`),
    );
    this.table.classList.toggle('live', this.inPlay);
    this.clockBase = Date.now() - v.gameElapsedMs;
    this.clockRunning = this.inPlay;
    this.tickClock(v.gameElapsedMs);
    this.renderSeats();
    this.renderPiles();
    this.renderMe();
    this.renderHand();
    this.pointAtActor();
    this.announceTurn();
  }

  private tickClock(elapsed = this.clockRunning ? Date.now() - this.clockBase : null) {
    if (elapsed === null) return;
    const secs = Math.floor(elapsed / 1000);
    this.clock.textContent = `⏱ ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  }

  private pointAtActor() {
    const v = this.view;
    // Also shown during the opening countdown, pointing at whoever goes first.
    const live = !!v && v.matchPhase === 'playing';
    this.pointer.classList.toggle('on', live);
    if (!v || !live) return;
    const mine = this.actor(v) === v.you;
    const target = this.seatAvatar(this.actor(v))?.getBoundingClientRect();
    const origin = this.pointer.getBoundingClientRect();
    if (!target || !this.table.clientWidth) return;
    // Your turn: straight down at your side of the screen. Otherwise aim at the player's avatar.
    const angle = mine ? 90 : (Math.atan2(target.top + target.height / 2 - origin.top, target.left + target.width / 2 - origin.left) * 180) / Math.PI;
    // Swing the short way round rather than spinning back through 360°.
    this.pointerAngle += ((((angle - this.pointerAngle) % 360) + 540) % 360) - 180;
    this.pointer.style.rotate = `${this.pointerAngle}deg`;
    this.pointer.classList.toggle('mine', mine);
  }

  private announceTurn() {
    const v = this.view!;
    if (!this.myTurn) return;
    const key = `${v.round}-${v.gameNumber}-${v.turn}`;
    if (key === this.announced) return;
    this.announced = key;
    this.flashBanner('Your turn!', 'mine');
    navigator.vibrate?.(40);
  }

  /** You were knocked out of the current game and are watching the rest. */
  private get watching() {
    const v = this.view;
    return !!v && v.matchPhase === 'playing' && v.out[v.you];
  }

  /** A game is under way and past its opening countdown. */
  private get inPlay() {
    const v = this.view!;
    return v.matchPhase === 'playing' && v.countdownMs === null;
  }

  private get myTurn() {
    const v = this.view!;
    return this.inPlay && v.gamePhase === 'play' && v.current === v.you;
  }

  /** Draw button: take a stack, or draw-until-playable once per turn. */
  private get canDraw() {
    const v = this.view!;
    return this.myTurn && (v.stack !== null || !this.canPlay);
  }

  /** You only draw while you can't play (mirrors the engine). */
  private get canPlay() {
    const v = this.view!;
    return v.hand.some((c) => checkPlay([c], this.playContext(true)).ok);
  }

  private playContext(isTurn: boolean): PlayContext {
    const v = this.view!;
    return { pile: { top: v.top, colour: v.colour }, handSize: v.hand.length, isTurn, stack: v.stack };
  }

  private actor(v: ClientView) {
    return v.chooser ?? v.current;
  }

  private renderSeats() {
    const v = this.view!;
    const n = v.seats.length;
    const seats: HTMLElement[] = [];
    for (let k = 1; k < n; k++) {
      const seat = (v.you + k) % n;
      // Next player sits on the left, then round the top: clockwise from you at the bottom.
      const theta = Math.PI + (k * Math.PI) / n;
      const x = 50 + 42 * Math.cos(theta);
      const y = 44 + 38 * Math.sin(theta);
      seats.push(this.seatEl(seat, { left: `${x}%`, top: `${y}%` }));
    }
    this.seatsLayer.replaceChildren(...seats);
  }

  private seatEl(seat: number, pos: Partial<CSSStyleDeclaration>) {
    const v = this.view!;
    const info = v.seats[seat];
    const isActor = this.inPlay && this.actor(v) === seat;
    return h(
      'div',
      {
        class: `seat ${isActor ? 'active' : ''} ${info.cpu ? 'cpu' : ''} ${info.connected ? '' : 'away'} ${v.out[seat] ? 'out' : ''}`,
        'data-seat': seat,
        style: pos,
      },
      this.avatar(seat, isActor),
      h('div', { class: 'seat-name' }, info.name),
      h(
        'div',
        { class: 'seat-meta' },
        h('span', { class: 'seat-cards', title: 'Cards in hand' }, cardBack('mini'), String(v.handCounts[seat])),
        h('span', { class: 'seat-score', title: 'Score this round' }, `${v.scores[seat]}`),
        v.roundWins[seat] ? h('span', { class: 'seat-wins', title: 'Rounds won' }, '★'.repeat(v.roundWins[seat])) : null,
      ),
      v.out[seat] && v.matchPhase === 'playing' ? h('span', { class: 'out-tag' }, 'OUT') : null,
      v.handCounts[seat] === 1 && v.matchPhase === 'playing' && !v.out[seat] ? h('span', { class: 'last-card' }, 'Last card!') : null,
    );
  }

  private avatar(seat: number, timed: boolean) {
    const v = this.view!;
    const info = v.seats[seat];
    // A dropped player's seat (covered by a CPU) shows as disconnected.
    const av = h('div', { class: 'avatar' }, info.connected ? info.avatar.emoji : '📴');
    av.style.background = info.avatar.colour;
    if (info.cpu) av.append(h('span', { class: 'cpu-tag', title: 'CPU' }, '🤖'));
    if (v.champion === seat) av.append(h('span', { class: 'crown', title: 'Won the last game' }, '👑'));
    if (timed && v.turnMsLeft !== null) {
      const total = v.settings.turnTimer * 1000;
      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      ring.setAttribute('viewBox', '0 0 64 64');
      ring.classList.add('ring');
      ring.innerHTML = `<circle cx="32" cy="32" r="30" pathLength="${RING_C}" stroke-dasharray="${RING_C}"
        style="animation-duration:${total}ms;animation-delay:-${total - v.turnMsLeft}ms"/>`;
      av.append(ring);
    }
    return av;
  }

  private seatAvatar(seat: number): Element | null {
    if (this.view && seat === this.view.you) return this.me.querySelector('.avatar');
    return this.seatsLayer.querySelector(`[data-seat="${seat}"] .avatar`);
  }

  private renderPiles() {
    const v = this.view!;
    // The first card is still on the pile until it flips (even if it's the only one left).
    const drawLeft = v.drawCount + (this.startCardHidden ? 1 : 0);
    this.drawPile.replaceChildren(
      ...(drawLeft > 0
        ? [cardBack('stack-3'), cardBack('stack-2'), cardBack(), h('span', { class: 'pile-count' }, String(drawLeft))]
        : [h('span', { class: 'pile-empty' }, 'Empty'), h('span', { class: 'pile-count' }, 'Pass = out')]),
    );
    this.drawPile.disabled = !this.canDraw;
    this.drawPile.classList.toggle('hot', this.canDraw);

    this.discard.style.setProperty('--active', `var(--${v.colour})`);
    this.discard.classList.toggle('waiting', this.startCardHidden);
    this.discard.replaceChildren(
      ...(this.startCardHidden ? [] : this.pile).map((c, i) => {
        const s = scatter(c.id);
        const el = cardEl(c, `${i === this.pile.length - 1 ? 'top' : ''} ${c.id === this.justPainted ? 'paint-flip' : ''}`, this.paintFor(c));
        el.style.transform = `translate(${s.x}px, ${s.y}px) rotate(${s.rot}deg)`;
        return el;
      }),
      v.stack ? h('span', { class: 'stack-badge' }, `+${v.stack.count}`) : '',
    );

    const actor = this.actor(v);
    const name = actor === v.you ? 'You' : v.seats[actor].name;
    let text = '';
    if (!this.inPlay) text = '';
    else if (v.gamePhase === 'chooseColour') text = actor === v.you ? 'Pick a colour' : `${name} is picking a colour…`;
    else if (v.gamePhase === 'chooseSwap') text = actor === v.you ? 'Pick a hand to swap with' : `${name} is choosing a hand to swap…`;
    else if (v.out[v.you]) text = `You're out · ${name}'s turn`;
    else if (v.stack) text = actor === v.you ? `Stack a draw card or take +${v.stack.count}` : `${name} faces +${v.stack.count}`;
    else if (actor === v.you && !this.canPlay) text = v.drawCount === 0 ? "Can't play: pass and you're out" : 'Draw until you can play';
    else if (actor === v.you) text = 'Your turn';
    else text = `${name}'s turn`;
    this.status.textContent = text;
    this.direction.classList.toggle('ccw', v.direction === -1);
    this.status.className = `status ${actor === v.you ? 'mine' : ''}`;
  }

  /** A wild shows its chosen colour once picked (falls back to the live colour, e.g. after a rejoin). */
  private paintFor(c: Card): Colour | undefined {
    const v = this.view!;
    if (!isWild(c)) return undefined;
    const known = this.painted.get(c.id);
    if (known) return known;
    return c.id === v.top.id && v.gamePhase !== 'chooseColour' ? v.colour : undefined;
  }

  private renderMe() {
    const v = this.view!;
    const isActor = this.inPlay && this.actor(v) === v.you;
    this.me.replaceChildren(
      this.avatar(v.you, false),
      h(
        'div',
        { class: 'me-info' },
        h('div', { class: 'seat-name' }, v.seats[v.you].name),
        h(
          'div',
          { class: 'seat-meta' },
          h('span', { class: 'seat-cards', title: 'Cards in hand' }, cardBack('mini'), String(v.hand.length)),
          h('span', { class: 'seat-score' }, `${v.scores[v.you]} pts`),
          v.roundWins[v.you] ? h('span', { class: 'seat-wins' }, '★'.repeat(v.roundWins[v.you])) : null,
          v.out[v.you] && v.matchPhase === 'playing' ? h('span', { class: 'out-tag' }, 'OUT') : null,
        ),
      ),
    );
    const fill = this.timerBar.firstElementChild as HTMLElement;
    fill.getAnimations().forEach((a) => a.cancel());
    this.timerBar.classList.toggle('on', isActor && v.turnMsLeft !== null);
    if (isActor && v.turnMsLeft !== null) {
      const total = v.settings.turnTimer * 1000;
      fill.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], {
        duration: total,
        delay: -(total - v.turnMsLeft),
        fill: 'forwards',
      });
    }
    this.drawBtn.disabled = !this.canDraw || this.watching;
    this.drawBtn.textContent = v.drawCount === 0 && this.canDraw ? 'Pass (out)' : this.myTurn && v.stack ? `Take +${v.stack.count}` : 'Draw';
    this.el.classList.toggle('my-turn', isActor);
  }

  private renderHand() {
    const v = this.view;
    if (!v) return;
    this.playBtn.textContent = this.selected.length > 1 ? `Play ${this.selected.length}` : 'Play';
    // Knocked out: your hand stays visible (and scrollable) but greyed out and inert.
    const watching = this.watching;
    if (watching) this.selected = [];
    this.handEl.classList.toggle('disabled', watching);
    this.handHint.classList.toggle('watching', watching);
    this.handHint.textContent = watching ? 'You’re out: watching until the game ends' : 'Tap cards in order · swipe up to play';
    this.playBtn.disabled = this.selected.length === 0 || v.matchPhase !== 'playing' || watching;
    this.handRow.replaceChildren(
      ...v.hand.map((c, i) => {
        const order = this.selected.indexOf(c.id);
        const el = cardEl(c, `${order >= 0 ? 'selected' : ''} ${i === this.focus ? 'focused' : ''} ${this.canJumpIn(c) ? 'jumpable' : ''} ${this.fresh.has(c.id) ? 'fresh' : ''}`);
        if (order >= 0) el.append(h('span', { class: 'sel-badge' }, String(order + 1)));
        return el;
      }),
    );
    this.layoutHand();
  }

  private canJumpIn(c: Card) {
    const v = this.view!;
    return this.inPlay && v.gamePhase === 'play' && v.current !== v.you && !v.out[v.you] && checkPlay([c], this.playContext(false)).ok;
  }

  /** Overlap cards so they fit, but keep each one's visible strip big enough to tap. */
  private layoutHand() {
    const n = this.handRow.children.length;
    const cw = parseFloat(getComputedStyle(this.handEl).getPropertyValue('--cw')) || 68;
    const avail = this.handEl.clientWidth - 24;
    const step = n <= 1 ? cw : Math.max(44, Math.min(cw * 0.8, (avail - cw) / (n - 1)));
    this.handEl.style.setProperty('--step', `${step}px`);
  }

  // ---------------------------------------------------------------- input

  private toggle(id: number) {
    if (!this.view || this.pending || this.watching) return;
    const i = this.selected.indexOf(id);
    if (i >= 0) this.selected.splice(i, 1);
    else this.selected.push(id);
    this.focus = Math.max(0, this.view.hand.findIndex((c) => c.id === id));
    this.renderHand();
  }

  /** After drawing, line up a card you can now play: the drawn one, or one it unlocked in your hand. */
  private selectPlayable(drawn: Card[]) {
    const v = this.view!;
    if (!this.myTurn || v.stack) return false;
    const ctx = this.playContext(true);
    const card = [...drawn, ...v.hand].find((c) => checkPlay([c], ctx).ok);
    if (!card) return false;
    this.selected = [card.id];
    this.focus = v.hand.findIndex((c) => c.id === card.id);
    return true;
  }

  private toggleFocused() {
    const card = this.view?.hand[this.focus];
    if (card) this.toggle(card.id);
  }

  private moveFocus(delta: number) {
    if (!this.view?.hand.length) return;
    this.focus = (this.focus + delta + this.view.hand.length) % this.view.hand.length;
    this.renderHand();
    this.handRow.children[this.focus]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  private send() {
    const v = this.view;
    if (!v || this.pending || v.matchPhase !== 'playing') return;
    if (v.countdownMs !== null) return toast('Get ready…');
    if (v.out[v.you]) return toast("You're out of this game");
    if (this.selected.length === 0) return toast('Tap cards to select them first');
    const cards = this.selected.map((id) => v.hand.find((c) => c.id === id)!);
    if (v.gamePhase === 'chooseColour') return this.reject('Wait for a colour to be picked');
    if (v.gamePhase === 'chooseSwap') return this.reject('Wait for the hand swap');
    const check = checkPlay(cards, this.playContext(v.current === v.you));
    if (!check.ok) return this.reject(check.reason);
    this.pending = true;
    for (const id of this.selected) this.handRow.querySelector(`[data-id="${id}"]`)?.classList.add('sending');
    this.transport.send({ type: 'play', cardIds: [...this.selected] });
  }

  private draw() {
    if (!this.view || !this.canDraw) return;
    this.selected = [];
    this.transport.send({ type: 'draw' });
  }

  private reject(reason: string) {
    this.pending = false;
    const els = this.selected.map((id) => this.handRow.querySelector(`[data-id="${id}"]`)).filter(Boolean) as HTMLElement[];
    els.forEach((el) => el.classList.add('shake'));
    toast(reason, 'error');
    navigator.vibrate?.(80);
    setTimeout(() => {
      this.selected = [];
      this.renderHand();
    }, 350);
  }

  private pickColour(colour: Colour) {
    this.transport.send({ type: 'chooseColour', colour });
    this.colourModal?.close();
    this.colourModal = null;
  }

  private pickSwap(target: number) {
    this.transport.send({ type: 'swap', target });
    this.swapModal?.close();
    this.swapModal = null;
  }

  // ---------------------------------------------------------------- effects

  private animate(events: MatchEvent[], sources: Map<number, DOMRect>) {
    const v = this.view!;
    const nameOf = (p: number) => (p === v.you ? 'You' : v.seats[p].name);
    let drawDelay = 0;

    for (const e of events) {
      switch (e.type) {
        case 'play': {
          e.cards.forEach((c, i) => {
            const el = this.discard.querySelector<HTMLElement>(`[data-id="${c.id}"]`);
            const from = sources.get(c.id);
            if (!el || !from) return;
            const to = el.getBoundingClientRect();
            el.animate(
              [
                { translate: `${from.left - to.left}px ${from.top - to.top}px`, scale: String(from.width / to.width) },
                { translate: '0 0', scale: '1' },
              ],
              { duration: FLY_MS, delay: i * 120, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' },
            );
          });
          if (e.jumpIn) this.flashBanner(`⚡ ${nameOf(e.player)} jumped in!`, 'jump');
          else if (e.cards.length === 2 && sameFace(e.cards[0], e.cards[1])) this.flashBanner('Double!');
          else if (e.cards.length > 1) this.flashBanner(`Sum! ${e.cards.map((c) => c.value).join(' + ')}`);
          break;
        }
        case 'draw': {
          const target = e.player === v.you ? this.handEl : this.seatAvatar(e.player);
          if (target) this.flyBacks(Math.min(e.count, 6), target.getBoundingClientRect(), drawDelay);
          drawDelay += 150;
          if (e.reason === 'penalty') this.seatBadge(e.player, `+${e.count}`);
          if (e.reason === 'smiley') {
            this.seatBadge(e.player, `☺ +${e.count}`);
            this.flashBanner(`☺ Smiley 8! ${nameOf(e.player)} draw${e.player === v.you ? '' : 's'} ${e.count}`, 'jump');
          }
          if (e.reason === 'timeout') {
            this.seatBadge(e.player, `Too slow! +${e.count}`);
            if (e.player === v.you) this.flashBanner(`⏰ Too slow! +${e.count}`, 'bad');
          }
          break;
        }
        case 'stack':
          if (e.total > e.added) this.flashBanner(`Stacked! +${e.total}`, 'bad');
          break;
        case 'reverse':
          this.flashBanner(`⇄ Reverse! Now going ${e.direction === 1 ? 'clockwise' : 'anticlockwise'}`);
          break;
        case 'swap':
          this.flashBanner(`🔀 ${nameOf(e.player)} swapped hands with ${e.target === v.you ? 'you' : nameOf(e.target)}!`, 'jump');
          break;
        case 'rotate':
          this.flashBanner('🔄 Everyone passes their hand on!', 'jump');
          break;
        case 'skip':
          this.seatBadge(e.player, 'Skipped');
          break;
        case 'colour':
          this.flashBanner(`${nameOf(e.player)} picked ${e.colour}`, e.colour);
          break;
        case 'out':
          this.seatBadge(e.player, 'Out!');
          this.flashBanner(e.player === v.you ? "No cards left to draw: you're out!" : `${nameOf(e.player)} is out!`, 'bad');
          break;
      }
    }
  }

  private flyBacks(count: number, to: DOMRect, delay: number) {
    const from = this.drawPile.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
      const ghost = cardBack('flying');
      Object.assign(ghost.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
      document.body.append(ghost);
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      ghost
        .animate([{ translate: '0 0', opacity: 1 }, { translate: `${dx}px ${dy}px`, opacity: 0.2, scale: '0.6' }], {
          duration: 420,
          delay: delay + i * 90,
          easing: 'ease-in',
          fill: 'both',
        })
        .finished.finally(() => ghost.remove());
    }
  }

  // ---------------------------------------------------------------- start of game

  /** Runs on each player's clock from the host's remaining time, so a rejoin picks up part-way. */
  private startCountdown(ms: number) {
    this.clearCountdown();
    this.counting = true;
    this.startCardHidden = true;
    const flipIn = Math.max(0, ms - CARD_FLIP_MS);
    for (let n = Math.ceil(flipIn / 1000); n >= 1; n--) {
      this.countdownTimers.push(setTimeout(() => this.showCount(n), flipIn - n * 1000));
    }
    this.countdownTimers.push(setTimeout(() => this.flipStartCard(Math.min(CARD_FLIP_MS, ms)), flipIn));
  }

  private showCount(n: number) {
    const v = this.view!;
    const first = v.current === v.you ? 'You go first' : `${v.seats[v.current].name} goes first`;
    this.countdownEl.replaceChildren(
      h('p', { class: 'countdown-label' }, v.gameNumber === 1 ? `Round ${v.round}` : `Game ${v.gameNumber}`),
      h('p', { class: 'countdown-number' }, String(n)),
      h('p', { class: 'countdown-first' }, first),
    );
  }

  /** The top of the draw pile turns over as it travels, landing exactly where the card will sit. */
  private flipStartCard(duration: number) {
    const v = this.view!;
    this.countdownEl.replaceChildren();
    const from = this.drawPile.getBoundingClientRect();
    const to = this.discard.getBoundingClientRect();
    const s = scatter(v.top.id);
    const inner = h('div', { class: 'flip-inner' }, cardBack('flip-face'), cardEl(v.top, 'flip-face flip-front'));
    const ghost = (this.flipGhost = h('div', { class: 'flip-ghost' }, inner));
    Object.assign(ghost.style, { left: `${to.left}px`, top: `${to.top}px` });
    document.body.append(ghost);

    const timing = { duration, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' } as const;
    inner.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(180deg)' }], timing);
    ghost
      .animate(
        [
          { translate: `${from.left - to.left}px ${from.top - to.top}px`, rotate: '0deg', scale: '1' },
          { scale: '1.3', offset: 0.5 },
          { translate: `${s.x}px ${s.y}px`, rotate: `${s.rot}deg`, scale: '1' },
        ],
        timing,
      )
      .finished.then(() => {
        this.clearCountdown();
        this.renderPiles();
      });
  }

  private clearCountdown() {
    this.countdownTimers.forEach(clearTimeout);
    this.countdownTimers = [];
    this.flipGhost?.remove();
    this.flipGhost = null;
    this.countdownEl.replaceChildren();
    this.counting = false;
    this.startCardHidden = false;
  }

  // ---------------------------------------------------------------- reactions

  private sendReact(key: ReactionKey) {
    const now = Date.now();
    if (now - this.lastSentReact < 150) return; // the host enforces this too
    this.lastSentReact = now;
    this.transport.react(key);
  }

  /** Emoji rises and fades from a player's avatar, or from the button you tapped for your own. */
  private floatReaction(seat: number, key: ReactionKey) {
    const origin = seat === this.view?.you ? this.reactButtons.get(key) : this.seatAvatar(seat);
    const from = origin?.getBoundingClientRect();
    if (!from) return;
    const el = h('span', { class: 'reaction', 'aria-hidden': 'true' }, REACTIONS[key]);
    Object.assign(el.style, { left: `${from.left + from.width / 2}px`, top: `${from.top}px` });
    document.body.append(el);
    const drift = (Math.random() - 0.5) * 80;
    // Seats near the top of the screen have less room to rise.
    const rise = Math.max(REACTION_MIN_RISE, Math.min(REACTION_RISE, from.top));
    el.animate(
      [
        { translate: '-50% 0', scale: '0.4', opacity: 0 },
        { translate: `-50% ${-rise * 0.12}px`, scale: '1.25', opacity: 1, offset: 0.1 },
        { translate: `calc(-50% + ${drift / 2}px) ${-rise * 0.65}px`, scale: '1', opacity: 1, offset: 0.65 },
        { translate: `calc(-50% + ${drift}px) ${-rise}px`, scale: '0.9', opacity: 0 },
      ],
      { duration: REACTION_MS, easing: 'ease-out', fill: 'forwards' },
    ).finished.finally(() => el.remove());
  }

  private flashBanner(text: string, kind = '') {
    const b = h('div', { class: `banner-msg ${kind}` }, text);
    this.banner.append(b);
    setTimeout(() => b.remove(), 1600);
  }

  private seatBadge(seat: number, text: string) {
    const host = seat === this.view?.you ? this.me : this.seatsLayer.querySelector(`[data-seat="${seat}"]`);
    if (!host) return;
    const b = h('span', { class: 'seat-badge' }, text);
    host.append(b);
    setTimeout(() => b.remove(), 1500);
  }

  // ---------------------------------------------------------------- modals

  private syncModals() {
    const v = this.view!;
    const mine = v.matchPhase === 'playing' && v.chooser === v.you;
    const choosingColour = mine && v.gamePhase === 'chooseColour';
    if (choosingColour && !this.colourModal) this.showColourPicker();
    if (!choosingColour && this.colourModal) {
      this.colourModal.close();
      this.colourModal = null;
    }
    const choosingSwap = mine && v.gamePhase === 'chooseSwap';
    if (choosingSwap && !this.swapModal) this.showSwapPicker();
    if (!choosingSwap && this.swapModal) {
      this.swapModal.close();
      this.swapModal = null;
    }

    if (v.matchPhase === 'playing') return;
    const key = `${v.round}-${v.gameNumber}-${v.matchPhase}`;
    if (key === this.resultKey) return;
    this.resultKey = key;
    // Let the winning card land before covering the table.
    setTimeout(() => {
      if (this.view?.matchPhase === 'playing') return;
      this.resultModal?.close();
      this.resultModal = v.matchPhase === 'matchOver' ? this.showMatchOver() : this.showGameOver();
    }, 900);
  }

  private showColourPicker() {
    const buttons = COLOURS.map((c, i) =>
      h('button', { class: `colour-btn c-${c}`, onclick: () => this.pickColour(c), 'aria-label': c }, h('span', {}, c), h('kbd', {}, String(i + 1))),
    );
    this.colourModal = modal([h('h2', {}, 'Pick a colour'), h('div', { class: 'colour-grid' }, ...buttons)], { class: 'colour-modal' });
  }

  private showSwapPicker() {
    const v = this.view!;
    // Offer seats still in the game, in turn order from you. Swapping is compulsory.
    this.swapOptions = v.seats
      .map((_, k) => (v.you + k * v.direction + v.seats.length * 2) % v.seats.length)
      .slice(1)
      .filter((seat) => !v.out[seat]);
    const buttons = this.swapOptions.map((seat, i) =>
      h(
        'button',
        { class: 'swap-btn', onclick: () => this.pickSwap(seat) },
        h('span', { class: 'swap-name' }, v.seats[seat].name),
        h('span', { class: 'swap-count' }, `${v.handCounts[seat]} card${v.handCounts[seat] === 1 ? '' : 's'}`),
        h('kbd', {}, String(i + 1)),
      ),
    );
    this.swapModal = modal(
      [h('h2', {}, 'Swap hands!'), h('p', { class: 'hint' }, `You have ${v.hand.length} cards. Pick a player to swap with.`), h('div', { class: 'swap-list' }, ...buttons)],
      { class: 'swap-modal' },
    );
  }

  /** Ranked by rounds won, then score, then lowest hand value left in the last game. */
  private scoreboard() {
    const v = this.view!;
    const hand = (i: number) => v.lastResult?.leftover[i] ?? 0;
    const order = v.seats
      .map((_, i) => i)
      .sort((a, b) => v.roundWins[b] - v.roundWins[a] || v.scores[b] - v.scores[a] || hand(a) - hand(b));
    return h(
      'table',
      { class: 'scoreboard' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Player'), h('th', {}, 'Rounds'), h('th', {}, 'Score'), h('th', {}, 'Hand value'))),
      h(
        'tbody',
        {},
        ...order.map((i) =>
          h(
            'tr',
            { class: i === v.you ? 'me' : '' },
            h('td', {}, v.seats[i].name),
            h('td', {}, '★'.repeat(v.roundWins[i]) || '–'),
            h('td', {}, `${v.scores[i]} / ${v.settings.roundScoreLimit}`),
            h('td', {}, String(hand(i))),
          ),
        ),
      ),
    );
  }

  private showGameOver(): Modal {
    const v = this.view!;
    const r = v.lastResult!;
    const name = r.winner === v.you ? 'You' : v.seats[r.winner].name;
    const counter = h('p', { class: 'hint center' });
    clearInterval(this.countdown);
    const endAt = Date.now() + (v.nextGameMs ?? 0) - 900;
    const tick = () => (counter.textContent = `Next ${r.roundWinner !== null ? 'round' : 'game'} in ${Math.max(0, Math.ceil((endAt - Date.now()) / 1000))}…`);
    tick();
    this.countdown = setInterval(tick, 250);
    return modal([
      h('h2', {}, r.lastStanding ? `${name} ${name === 'You' ? 'win' : 'wins'}: last to play!` : `${name} went out!`),
      r.lastStanding ? h('p', { class: 'center hint' }, 'The draw pile ran out and everyone else was knocked out.') : null,
      h('p', { class: 'big-points' }, `+${r.points} points`),
      r.roundWinner !== null ? h('h3', { class: 'round-win' }, `🏆 ${name === 'You' ? 'You win' : `${name} wins`} round ${v.round}!`) : null,
      this.scoreboard(),
      counter,
    ]);
  }

  private showMatchOver(): Modal {
    const v = this.view!;
    clearInterval(this.countdown);
    const winner = v.lastResult!.matchWinner!;
    const won = winner === v.you;
    const buttons: HTMLElement[] = [];
    if (this.transport.rematch) {
      buttons.push(h('button', { class: 'btn btn-primary', onclick: () => this.transport.rematch!() }, 'Rematch'));
    } else {
      buttons.push(h('p', { class: 'hint center' }, 'Waiting for the host to start a rematch…'));
    }
    buttons.push(h('button', { class: 'btn btn-ghost', onclick: () => this.exit() }, 'Home'));
    return modal(
      [
        h('div', { class: 'angali-emoji' }, won ? '🏆' : '😵'),
        h('h1', { class: 'angali-title' }, won ? 'You beat Angali!' : 'You did not beat Angali'),
        h('p', { class: 'center' }, won ? 'Victory is yours.' : `${v.seats[winner].name} won the match.`),
        this.scoreboard(),
        h('div', { class: 'stack' }, ...buttons),
      ],
      { class: `match-over ${won ? 'win' : 'lose'}` },
    );
  }

  private confirmLeave() {
    const stay = h('button', { class: 'btn btn-primary' }, 'Fine, I’ll stay like a chicken 🐔');
    const leave = h('button', { class: 'btn btn-danger', onclick: () => (m.close(), chickenConfetti(), this.exit()) }, 'Leave like a chicken 🐔');
    const isHost = this.transport.rematch && this.view && this.view.seats.some((s, i) => i !== this.view!.you && !s.cpu);
    const warning = isHost ? 'You’re the host, so you’ll yeet everyone else.' : 'Your progress in this match will be lost.';
    const m = modal(
      [
        h('div', { class: 'chicken' }, '🐔'),
        h('h2', { class: 'center' }, 'Running away, you chicken?'),
        h('p', { class: 'center' }, 'Bawk bawk! Couldn’t handle a few cards? Angali will be clucking around telling everyone about this...'),
        h('p', { class: 'center hint' }, warning),
        h('div', { class: 'stack' }, stay, leave),
      ],
      { dismissable: true },
    );
    stay.onclick = () => {
      m.close();
      chickenConfetti();
    };
  }

  private showClosed(reason: string) {
    this.resultModal?.close();
    const home = h('button', { class: 'btn btn-primary' }, 'Home');
    const m = modal([h('h2', {}, 'Game ended'), h('p', {}, reason), home]);
    home.onclick = () => {
      m.close();
      go.home();
    };
  }

  private exit() {
    this.transport.leave();
    go.home();
  }
}
