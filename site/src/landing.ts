// The landing hero (M5 spec §5.2): the pointer mapped to −1…1 around the bot, one bot-width each way.
const clamp = (v: number): number => Math.max(-1, Math.min(1, v));

export function gaze(px: number, py: number, r: { left: number; top: number; width: number; height: number }): { x: number; y: number } {
  return { x: clamp((px - r.left - r.width / 2) / r.width), y: clamp((py - r.top - r.height / 2) / r.height) };
}

/** A boop's reactions (click the hero bot): three emotions and an event. */
export const BOOPS = ['happy', 'love', 'amazed', 'laugh'] as const;
export type Boop = (typeof BOOPS)[number];

/** The next boop: random, never the last one again. */
export function nextBoop(last: Boop | null, rand = Math.random): Boop {
  const pool = BOOPS.filter((b) => b !== last);
  return pool[Math.floor(rand() * pool.length)];
}

/** Boop reactions one at a time (the user, 2026-10-18): while one plays, a press only squashes. An emotion holds 1.4 s, a laugh
 *  plays its 1.6 s clip. Asleep, Nox always laughs. */
export function booper(rand = Math.random) {
  let last: Boop | null = null, until = 0;
  return {
    busy: (now: number): boolean => now < until,
    next(now: number, asleep: boolean): Boop {
      last = asleep ? 'laugh' : nextBoop(last, rand);
      until = now + (last === 'laugh' ? 1600 : 1400);
      return last;
    },
  };
}

/** Playing the studio's Lottie export (it saves noxy-<state>.json) with lottie-web. */
export const lottieSnippet = (state: string): string =>
  `import lottie from 'lottie-web';\n\n// noxy-${state}.json, from Download Lottie in the studio\nlottie.loadAnimation({\n  container: document.getElementById('nox'),\n  path: '/noxy-${state}.json',\n  loop: true,\n  autoplay: true,\n});`;

const r2 = (v: number): number => Math.round(v * 100) / 100;

/** Nox's jump into the card: a constant-gravity arc from (dx, dy) to rest, lift px above a level start, scale s0 → 1,
 *  stretched a little mid-air. Play it with linear easing: even time steps over the quadratic are what make it ballistic. */
export function hopFrames(dx: number, dy: number, s0: number, lift: number, n = 12): Keyframe[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const s = s0 + (1 - s0) * t;
    const k = 0.06 * Math.sin(Math.PI * t);
    return { transform: `translate(${r2(dx * (1 - t))}px, ${r2(dy * (1 - t) - 4 * lift * t * (1 - t))}px) scale(${r2(s * (1 - k))}, ${r2(s * (1 + k))})` };
  });
}
