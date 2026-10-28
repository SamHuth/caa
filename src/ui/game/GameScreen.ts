import { type Card, COLOURS, type Colour, sameFace } from '../../engine/cards';
import type { MatchEvent } from '../../engine/match';
import { type PlayContext, checkPlay, drawAmount } from '../../engine/rules';
import type { ClientView, HostMsg, Transport } from '../../net/protocol';
import { go } from '../app';
import { cardBack, cardEl } from '../cardEl';
import { h, modal, toast } from '../dom';
import { HandInput } from './HandInput';

const RING_C = 2 * Math.PI * 30;
const FLY_MS = 380;
const PILE_VISIBLE = 4;

type Modal = ReturnType<typeof modal>;

/** Deterministic scatter so the discard stack doesn't jump around on re-render. */
const scatter = (id: number) => ({ rot: ((id * 37) % 25) - 12, x: ((id * 13) % 9) - 4, y: ((id * 7) % 7) - 3 });

const hue = (seat: number) => (seat * 67 + 200) % 360;

export class GameScreen {
  readonly el: HTMLElement;
  private view: ClientView | null = null;
  private selected: number[] = [];
  private focus = 0;
  private pending = false;
  private pile: Card[] = [];

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

  private colourModal: Modal | null = null;
  private swapModal: Modal | null = null;
  /** Seat for each swap option (null = keep my hand), indexed by the 1–9 keys. */
  private swapOptions: (number | null)[] = [];
  private direction = h('div', { class: 'direction', 'aria-hidden': 'true' }, '↻');
  private resultModal: Modal | null = null;
  private resultKey = '';
  private countdown: ReturnType<typeof setInterval> | undefined;
  private input: HandInput;
  private resize = new ResizeObserver(() => this.layoutHand());

  constructor(private transport: Transport) {
    this.handEl.append(this.handRow);
    this.drawPile.onclick = () => this.draw();
    this.drawBtn.onclick = () => this.draw();
    this.playBtn.onclick = () => this.send();
    this.table.append(
      this.direction,
      this.seatsLayer,
      h('div', { class: 'centre' }, h('div', { class: 'piles' }, this.drawPile, this.discard), this.status),
      this.banner,
    );
    this.el = h(
      'main',
      { class: 'screen game' },
      h('header', { class: 'game-top' }, this.info, h('button', { class: 'btn-icon', 'aria-label': 'Leave game', onclick: () => this.confirmLeave() }, '✕')),
      this.table,
      h(
        'section',
        { class: 'player-area' },
        this.timerBar,
        h('div', { class: 'me-row' }, this.me, h('div', { class: 'actions' }, this.drawBtn, this.playBtn)),
        this.handEl,
        h('p', { class: 'hand-hint' }, 'Tap cards in order · swipe up to play'),
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
  }

  destroy() {
    this.input.destroy();
    this.resize.disconnect();
    clearInterval(this.countdown);
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
      this.selected = [];
      this.resultModal?.close();
      this.resultModal = null;
    }
    for (const e of events) if (e.type === 'play') this.pile.push(...e.cards);
    if (this.pile.at(-1)?.id !== view.top.id) this.pile = [view.top];
    this.pile = this.pile.slice(-PILE_VISIBLE);

    this.view = view;
    this.pending = false;
    const inHand = new Set(view.hand.map((c) => c.id));
    this.selected = this.selected.filter((id) => inHand.has(id));
    this.focus = Math.min(this.focus, Math.max(0, view.hand.length - 1));

    this.render();
    this.animate(events, sources);
    this.syncModals();
  }

  private render() {
    const v = this.view!;
    this.info.replaceChildren(
      h('span', { class: 'pill' }, `Round ${v.round} · Game ${v.gameNumber}`),
      h('span', { class: 'pill subtle' }, `First to ${v.settings.roundScoreLimit} · Bo${v.settings.bestOf}`),
    );
    this.renderSeats();
    this.renderPiles();
    this.renderMe();
    this.renderHand();
  }

  private get myTurn() {
    const v = this.view!;
    return v.matchPhase === 'playing' && v.gamePhase === 'play' && v.current === v.you;
  }

  /** Draw button: take a stack, or draw-until-playable once per turn. */
  private get canDraw() {
    const v = this.view!;
    return this.myTurn && (v.stack !== null || !v.hasDrawn);
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
    const isActor = v.matchPhase === 'playing' && this.actor(v) === seat;
    return h(
      'div',
      {
        class: `seat ${isActor ? 'active' : ''} ${info.cpu ? 'cpu' : ''} ${info.connected ? '' : 'away'}`,
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
      v.handCounts[seat] === 1 && v.matchPhase === 'playing' ? h('span', { class: 'last-card' }, 'Last card!') : null,
    );
  }

  private avatar(seat: number, timed: boolean) {
    const v = this.view!;
    const info = v.seats[seat];
    const av = h('div', { class: 'avatar' }, info.cpu ? '🤖' : info.connected ? info.name[0]?.toUpperCase() : '📴');
    av.style.setProperty('--hue', String(hue(seat)));
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
    this.drawPile.replaceChildren(cardBack('stack-3'), cardBack('stack-2'), cardBack(), h('span', { class: 'pile-count' }, String(v.drawCount)));
    this.drawPile.disabled = !this.canDraw;
    this.drawPile.classList.toggle('hot', this.canDraw);

    this.discard.style.setProperty('--active', `var(--${v.colour})`);
    this.discard.replaceChildren(
      ...this.pile.map((c, i) => {
        const s = scatter(c.id);
        const el = cardEl(c, i === this.pile.length - 1 ? 'top' : '');
        el.style.transform = `translate(${s.x}px, ${s.y}px) rotate(${s.rot}deg)`;
        return el;
      }),
      v.stack ? h('span', { class: 'stack-badge' }, `+${v.stack.count}`) : '',
    );

    const actor = this.actor(v);
    const name = actor === v.you ? 'You' : v.seats[actor].name;
    let text = '';
    if (v.matchPhase !== 'playing') text = '';
    else if (v.gamePhase === 'chooseColour') text = actor === v.you ? 'Pick a colour' : `${name} is picking a colour…`;
    else if (v.gamePhase === 'chooseSwap') text = actor === v.you ? 'Pick a hand to swap with' : `${name} is choosing a hand to swap…`;
    else if (v.stack) text = actor === v.you ? `Stack a ${v.stack.kind === 'draw2' ? 'Draw 2' : 'Draw 4'} or take +${v.stack.count}` : `${name} faces +${v.stack.count}`;
    else if (actor === v.you) text = v.hasDrawn ? 'Play a card' : 'Your turn';
    else text = `${name}'s turn`;
    this.status.textContent = text;
    this.direction.textContent = v.direction === 1 ? '↻' : '↺';
    this.direction.classList.toggle('ccw', v.direction === -1);
    this.status.className = `status ${actor === v.you ? 'mine' : ''}`;
  }

  private renderMe() {
    const v = this.view!;
    const isActor = v.matchPhase === 'playing' && this.actor(v) === v.you;
    this.me.replaceChildren(
      this.avatar(v.you, false),
      h(
        'div',
        { class: 'me-info' },
        h('div', { class: 'seat-name' }, v.seats[v.you].name),
        h('div', { class: 'seat-meta' }, h('span', { class: 'seat-score' }, `${v.scores[v.you]} pts`), v.roundWins[v.you] ? h('span', { class: 'seat-wins' }, '★'.repeat(v.roundWins[v.you])) : null),
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
    this.drawBtn.disabled = !this.canDraw;
    this.drawBtn.textContent = this.myTurn && v.stack ? `Take +${v.stack.count}` : 'Draw';
    this.el.classList.toggle('my-turn', isActor);
  }

  private renderHand() {
    const v = this.view;
    if (!v) return;
    this.playBtn.textContent = this.selected.length > 1 ? `Play ${this.selected.length}` : 'Play';
    this.playBtn.disabled = this.selected.length === 0 || v.matchPhase !== 'playing';
    this.handRow.replaceChildren(
      ...v.hand.map((c, i) => {
        const order = this.selected.indexOf(c.id);
        const el = cardEl(c, `${order >= 0 ? 'selected' : ''} ${i === this.focus ? 'focused' : ''} ${this.canJumpIn(c) ? 'jumpable' : ''}`);
        if (order >= 0) el.append(h('span', { class: 'sel-badge' }, String(order + 1)));
        return el;
      }),
    );
    this.layoutHand();
  }

  private canJumpIn(c: Card) {
    const v = this.view!;
    return v.matchPhase === 'playing' && v.gamePhase === 'play' && v.current !== v.you && checkPlay([c], this.playContext(false)).ok;
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
    if (!this.view || this.pending) return;
    const i = this.selected.indexOf(id);
    if (i >= 0) this.selected.splice(i, 1);
    else this.selected.push(id);
    this.focus = Math.max(0, this.view.hand.findIndex((c) => c.id === id));
    this.renderHand();
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

  private pickSwap(target: number | null) {
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
          if (v.stack && e.total > drawAmount(v.stack.kind)) this.flashBanner(`Stacked! +${e.total}`, 'bad');
          break;
        case 'reverse':
          this.flashBanner(`⇄ Reverse! Now going ${e.direction === 1 ? 'clockwise' : 'anticlockwise'}`);
          break;
        case 'swap':
          if (e.target === null) this.flashBanner(`${nameOf(e.player)} kept ${e.player === v.you ? 'your' : 'their'} hand`);
          else this.flashBanner(`🔀 ${nameOf(e.player)} swapped hands with ${e.target === v.you ? 'you' : nameOf(e.target)}!`, 'jump');
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
        case 'reshuffle':
          this.flashBanner('Reshuffling the pile…');
          break;
        case 'newGame':
          this.flashBanner(e.gameNumber === 1 ? `Round ${e.round}` : `Game ${e.gameNumber}`);
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
    // Offer seats in turn order from you.
    const others = v.seats.map((_, k) => (v.you + k * v.direction + v.seats.length * 2) % v.seats.length).slice(1);
    this.swapOptions = [...others, null];
    const buttons = this.swapOptions.map((seat, i) =>
      seat === null
        ? h('button', { class: 'btn btn-ghost swap-keep', onclick: () => this.pickSwap(null) }, 'Keep my hand ', h('kbd', {}, String(i + 1)))
        : h(
            'button',
            { class: 'swap-btn', onclick: () => this.pickSwap(seat) },
            h('span', { class: 'swap-name' }, v.seats[seat].name),
            h('span', { class: 'swap-count' }, `${v.handCounts[seat]} card${v.handCounts[seat] === 1 ? '' : 's'}`),
            h('kbd', {}, String(i + 1)),
          ),
    );
    this.swapModal = modal(
      [h('h2', {}, 'Swap hands?'), h('p', { class: 'hint' }, `You have ${v.hand.length} cards. Pick a player to swap with.`), h('div', { class: 'swap-list' }, ...buttons)],
      { class: 'swap-modal' },
    );
  }

  private scoreboard() {
    const v = this.view!;
    const order = v.seats.map((_, i) => i).sort((a, b) => v.roundWins[b] - v.roundWins[a] || v.scores[b] - v.scores[a]);
    return h(
      'table',
      { class: 'scoreboard' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Player'), h('th', {}, 'Left in hand'), h('th', {}, 'Score'), h('th', {}, 'Rounds'))),
      h(
        'tbody',
        {},
        ...order.map((i) =>
          h(
            'tr',
            { class: i === v.you ? 'me' : '' },
            h('td', {}, v.seats[i].name),
            h('td', {}, String(v.lastResult?.leftover[i] ?? 0)),
            h('td', {}, `${v.scores[i]} / ${v.settings.roundScoreLimit}`),
            h('td', {}, '★'.repeat(v.roundWins[i]) || '–'),
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
      h('h2', {}, `${name} went out!`),
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
    const stay = h('button', { class: 'btn btn-ghost' }, 'Stay');
    const leave = h('button', { class: 'btn btn-danger', onclick: () => (m.close(), this.exit()) }, 'Leave');
    const warning = this.transport.rematch && this.view && this.view.seats.some((s, i) => i !== this.view!.you && !s.cpu) ? 'You are the host, so this ends the game for everyone.' : 'Your progress in this match will be lost.';
    const m = modal([h('h2', {}, 'Leave game?'), h('p', {}, warning), h('div', { class: 'stack' }, leave, stay)], { dismissable: true });
    stay.onclick = () => m.close();
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
