// One requestAnimationFrame loop for every live bot (M2 spec §8). Bots off screen skip their frames.

/** What the loop drives: the element to watch for visibility and the per-frame work. */
export interface Runner {
  el: Element;
  frame(now: number): void;
}

const live = new Set<Runner>();
const hidden = new WeakSet<Element>();
let raf = 0;
let io: IntersectionObserver | undefined;

function loop(now: number): void {
  raf = 0;
  for (const r of live) {
    if (hidden.has(r.el)) continue;
    try {
      r.frame(now);
    } catch (e) {
      if (typeof reportError === 'function') reportError(e); // one bot's bad frame must not stop every other bot
      else console.error(e);
    }
  }
  if (live.size) raf = requestAnimationFrame(loop);
}

/** Adds a runner; the loop starts with the first. */
export function run(r: Runner): void {
  live.add(r);
  io ??= new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) hidden.delete(e.target);
      else hidden.add(e.target);
    }
  });
  io.observe(r.el);
  if (!raf) raf = requestAnimationFrame(loop);
}

/** Removes a runner; the loop stops with the last. */
export function halt(r: Runner): void {
  live.delete(r);
  io?.unobserve(r.el);
  if (!live.size && raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
}
