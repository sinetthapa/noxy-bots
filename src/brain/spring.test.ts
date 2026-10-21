import { describe, it, expect } from 'vitest';
import { Spring } from './spring.ts';

const DT = 1 / 60;

describe('Spring', () => {
  it('converges to a step target without overshoot when well damped', () => {
    const s = new Spring(0);
    let y = 0;
    let peak = 0;
    for (let i = 0; i < 180; i++) {
      y = s.step(10, DT, { f: 1.6, z: 0.9, r: 0 });
      peak = Math.max(peak, y);
    }
    expect(y).toBeCloseTo(10, 1);
    expect(peak).toBeLessThan(10.3);
  });

  it('a bouncy spring overshoots, then settles', () => {
    const s = new Spring(0);
    let y = 0;
    let peak = 0;
    for (let i = 0; i < 240; i++) {
      y = s.step(10, DT, { f: 3, z: 0.35, r: 1.5 });
      peak = Math.max(peak, y);
    }
    expect(peak).toBeGreaterThan(10.5);
    expect(y).toBeCloseTo(10, 1);
  });

  it('stays finite with a huge time step', () => {
    const s = new Spring(0);
    for (let i = 0; i < 20; i++) s.step(10, 0.25, { f: 4, z: 0.3, r: 2 });
    expect(Number.isFinite(s.y)).toBe(true);
  });

  it('stays finite when a tuning slider drags f to 0', () => {
    const s = new Spring(0);
    for (let i = 0; i < 60; i++) s.step(10, DT, { f: 0, z: 0.9, r: 0 });
    expect(Number.isFinite(s.y)).toBe(true);
  });

  it('a velocity kick moves it away and it comes back', () => {
    const s = new Spring(0);
    s.yd = -250;
    let min = 0;
    for (let i = 0; i < 240; i++) min = Math.min(min, s.step(0, DT, { f: 3, z: 0.35, r: 1.5 }));
    expect(min).toBeLessThan(-5);
    expect(s.y).toBeCloseTo(0, 1);
  });
});
