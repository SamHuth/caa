export interface HandActions {
  toggle(cardId: number): void;
  send(): void;
  draw(): void;
  move(delta: number): void;
  toggleFocused(): void;
  clear(): void;
  /** Number keys pick an option in an open colour / swap dialog. */
  pick(index: number): void;
}

const TAP_SLOP = 10;
const SWIPE_MIN = 40;

/**
 * Touch: tap a card to select/deselect, swipe up anywhere on the hand to play.
 * Keyboard: ←/→ focus, Space select, Enter play, D draw, Esc clear, 1–9 pick a dialog option.
 */
export class HandInput {
  private start: { x: number; y: number; id: number | null } | null = null;

  constructor(
    private hand: HTMLElement,
    private actions: HandActions,
  ) {
    hand.addEventListener('pointerdown', this.onDown);
    hand.addEventListener('pointerup', this.onUp);
    hand.addEventListener('pointercancel', this.onCancel);
    document.addEventListener('keydown', this.onKey);
  }

  destroy() {
    this.hand.removeEventListener('pointerdown', this.onDown);
    this.hand.removeEventListener('pointerup', this.onUp);
    this.hand.removeEventListener('pointercancel', this.onCancel);
    document.removeEventListener('keydown', this.onKey);
  }

  private onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const card = (e.target as Element).closest<HTMLElement>('[data-id]');
    this.start = { x: e.clientX, y: e.clientY, id: card ? Number(card.dataset.id) : null };
  };

  private onUp = (e: PointerEvent) => {
    const s = this.start;
    this.start = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (dy < -SWIPE_MIN && Math.abs(dy) > Math.abs(dx)) this.actions.send();
    else if (Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP && s.id !== null) this.actions.toggle(s.id);
  };

  private onCancel = () => (this.start = null);

  private onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return;
    // Let buttons in dialogs activate normally; table buttons shouldn't swallow game keys.
    if (t.tagName === 'BUTTON' && t.closest('.modal') && (e.key === ' ' || e.key === 'Enter')) return;
    const handled = (() => {
      switch (e.key) {
        case 'ArrowLeft':
          return this.actions.move(-1), true;
        case 'ArrowRight':
          return this.actions.move(1), true;
        case ' ':
          return this.actions.toggleFocused(), true;
        case 'Enter':
          return this.actions.send(), true;
        case 'd':
        case 'D':
          return this.actions.draw(), true;
        case 'Escape':
          return this.actions.clear(), true;
      }
      if (/^[1-9]$/.test(e.key)) return this.actions.pick(Number(e.key) - 1), true;
      return false;
    })();
    if (handled) e.preventDefault();
  };
}
