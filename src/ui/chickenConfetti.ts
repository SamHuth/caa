import { h } from './dom';

const CHICKENS = ['🐔', '🐔', '🐔', '🐓', '🐥', '🐣'];
const STEPS = 14;

/** Chickens raining down across the screen, swaying as they fall. Lives on <body> so it survives a screen change. */
export function chickenConfetti(count = 48) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = h('div', { class: 'confetti-layer', 'aria-hidden': 'true' });
  document.body.append(layer);
  const w = innerWidth;
  const fall = innerHeight + 120;
  let falling = count;

  for (let i = 0; i < count; i++) {
    const el = h('span', { class: 'confetti-chicken' }, CHICKENS[Math.floor(Math.random() * CHICKENS.length)]);
    el.style.left = `${Math.random() * w}px`;
    el.style.top = '-60px';
    el.style.fontSize = `${1.4 + Math.random() * 1.4}rem`;
    layer.append(el);

    const sway = 15 + Math.random() * 35;
    const wobbles = 1.5 + Math.random() * 2;
    const spin = (Math.random() - 0.5) * 720;
    const frames = Array.from({ length: STEPS + 1 }, (_, k) => {
      const p = k / STEPS;
      return {
        translate: `${Math.sin(p * wobbles * Math.PI * 2) * sway}px ${p * fall}px`,
        rotate: `${spin * p}deg`,
        opacity: p > 0.85 ? (1 - p) / 0.15 : 1,
      };
    });
    el.animate(frames, { duration: 2400 + Math.random() * 1600, delay: Math.random() * 1500, easing: 'ease-in', fill: 'both' }).finished.then(() => {
      el.remove();
      if (--falling === 0) layer.remove();
    });
  }
}
