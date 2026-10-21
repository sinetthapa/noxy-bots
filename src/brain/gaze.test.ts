import { describe, expect, it } from 'vitest';
import { createNox, STEP, type Nox } from './nox.ts';

/** Ticks `ms` and returns the mean and max |value| of one pose key over that time. */
function watch(n: Nox, ms: number, key: 'lookX' | 'lookY' | 'yaw'): { mean: number; max: number } {
  let sum = 0;
  let max = 0;
  let count = 0;
  for (let t = 0; t < ms; t += STEP) {
    const v = n.tick(STEP)[key];
    sum += v;
    max = Math.max(max, Math.abs(v));
    count++;
  }
  return { mean: sum / count, max };
}

describe('setGaze', () => {
  it('holds the eyes on the target, with the darts on top', () => {
    const n = createNox({ seed: 3 });
    n.setGaze(0.8, -0.4);
    watch(n, 2000, 'lookX'); // settle
    expect(watch(n, 4000, 'lookX').mean).toBeCloseTo(0.8, 1);
    expect(watch(n, 4000, 'lookY').mean).toBeCloseTo(-0.4, 1);
  });

  it('clamps the target to −1..1', () => {
    const a = createNox({ seed: 3 });
    const b = createNox({ seed: 3 });
    a.setGaze(5, -5);
    b.setGaze(1, -1);
    watch(a, 2000, 'lookX');
    watch(b, 2000, 'lookX');
    expect(a.pose).toEqual(b.pose);
  });

  it('replaces the look direction of an emotion', () => {
    const n = createNox({ seed: 3 });
    n.setEmotion('CURIOUS'); // looks right (lookX 0.35)
    n.setGaze(-0.5, 0);
    watch(n, 2000, 'lookX');
    expect(watch(n, 4000, 'lookX').mean).toBeCloseTo(-0.5, 1);
  });

  it('shrinks the darts while a target is held', () => {
    const free = createNox({ seed: 3 });
    const held = createNox({ seed: 3 });
    held.setGaze(0, 0);
    watch(free, 2000, 'lookX');
    watch(held, 2000, 'lookX');
    const f = watch(free, 10000, 'lookX').max;
    const h = watch(held, 10000, 'lookX').max;
    expect(h).toBeLessThan(f * 0.5);
  });

  it('turns the head toward the target', () => {
    const n = createNox({ seed: 3 });
    n.setGaze(1, 0);
    watch(n, 2000, 'yaw');
    expect(watch(n, 2000, 'yaw').mean).toBeGreaterThan(0.2);
  });

  it('null releases the target', () => {
    const n = createNox({ seed: 3 });
    n.setGaze(0.8, 0);
    watch(n, 2000, 'lookX');
    n.setGaze(null);
    watch(n, 3000, 'lookX');
    expect(Math.abs(watch(n, 4000, 'lookX').mean)).toBeLessThan(0.15);
  });
});
