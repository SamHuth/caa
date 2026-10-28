type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown>;

/** Tiny element builder: h('button', { class: 'btn', onclick }, 'Go'). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2), value as EventListener);
    } else if (key === 'class') {
      el.className = String(value);
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (key in el && typeof value !== 'string') {
      (el as unknown as Record<string, unknown>)[key] = value;
    } else {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
}

const app = () => document.getElementById('app')!;
let cleanup: (() => void) | null = null;

/** Swap the active screen, running the previous screen's cleanup. */
export function showScreen(el: HTMLElement, onLeave?: () => void) {
  cleanup?.();
  cleanup = onLeave ?? null;
  app().replaceChildren(el);
}

export function toast(message: string, kind: 'info' | 'error' = 'info') {
  const el = h('div', { class: `toast toast-${kind}`, role: 'status' }, message);
  document.body.append(el);
  setTimeout(() => el.classList.add('toast-out'), 2200);
  setTimeout(() => el.remove(), 2600);
}

export function modal(content: Child[], opts: { dismissable?: boolean; class?: string } = {}) {
  const close = () => backdrop.remove();
  const box = h('div', { class: `modal ${opts.class ?? ''}`, role: 'dialog', 'aria-modal': 'true' });
  append(box, content);
  const backdrop = h('div', { class: 'modal-backdrop' }, box);
  if (opts.dismissable) {
    backdrop.addEventListener('click', (e) => e.target === backdrop && close());
    box.prepend(h('button', { class: 'modal-close', 'aria-label': 'Close', onclick: close }, '×'));
  }
  document.body.append(backdrop);
  return { close, box };
}

export const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(`angali-${key}`);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(`angali-${key}`, JSON.stringify(value));
    } catch {
      /* storage unavailable (private mode) — fine */
    }
  },
};

let wakeLock: WakeLockSentinel | null = null;

/** Keep the screen on while hosting so the match doesn't stall when the phone sleeps. */
export async function holdWakeLock(on: boolean) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    /* not supported or denied */
  }
}
