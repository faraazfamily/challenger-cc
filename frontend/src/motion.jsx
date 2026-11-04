import { useEffect, useRef, useState } from 'react';

// Site-wide motion. Elements with data-reveal (and every player card) start hidden and
// animate in when they scroll into view, a few at a time with a small stagger.
// Content is only hidden once this script has run (html.motion), so it never disappears
// if JavaScript fails, and nothing moves for people who asked their phone for less motion.
const SELECTOR = '[data-reveal], .player-card';

export const reducedMotion = () => typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function startMotion() {
  if (reducedMotion() || !('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('motion');

  const io = new IntersectionObserver((entries) => {
    let n = 0;
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.style.setProperty('--rd', `${Math.min(n++, 8) * 70}ms`);
      e.target.classList.add('in');
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });

  const watch = (el) => {
    if (el.dataset.rv) return;
    el.dataset.rv = '1';
    io.observe(el);
  };
  const scan = (root) => {
    if (root.matches?.(SELECTOR)) watch(root);
    root.querySelectorAll?.(SELECTOR).forEach(watch);
  };
  scan(document);
  // React adds pages and rows after the first paint: pick those up too.
  new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((node) => {
    if (node.nodeType === 1) scan(node);
  }))).observe(document.body, { childList: true, subtree: true });
}

// A number that counts up from 0 the first time it is shown (and to each new value after).
export function useCountUp(value, ms = 900) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(reducedMotion() ? target : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reducedMotion()) { setShown(target); return undefined; }
    const start = performance.now();
    const begin = from.current;
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(begin + (target - begin) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    // If frames are paused (background tab, battery saver), still land on the real number.
    const done = setTimeout(() => { cancelAnimationFrame(raf); setShown(target); from.current = target; }, ms + 250);
    return () => { cancelAnimationFrame(raf); clearTimeout(done); };
  }, [target, ms]);
  return shown;
}

export function CountUp({ value, decimals = 0 }) {
  const isNum = value !== null && value !== undefined && value !== '' && !Number.isNaN(Number(value));
  const scale = 10 ** decimals;
  const n = useCountUp(isNum ? Number(value) * scale : 0);
  if (!isNum) return <>{value ?? '-'}</>;
  return <>{decimals ? (n / scale).toFixed(decimals) : n}</>;
}
