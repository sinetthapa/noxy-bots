import { describe, it, expect } from 'vitest';
import { EASE, sampleClip, sampleTrack, type Clip } from './clips.ts';

const clip: Clip = {
  name: 'T',
  duration: 1000,
  tracks: { tilt: [[0, 0], [500, 10, 'linear'], [1000, 0, 'inOut']] },
};

describe('sampleTrack', () => {
  it('holds before the first key and after the last', () => {
    expect(sampleTrack([[100, 5], [200, 9]], 0)).toBe(5);
    expect(sampleTrack([[100, 5], [200, 9]], 999)).toBe(9);
  });
});

describe('sampleClip', () => {
  it('uses the ease of the key that ends the segment', () => {
    expect(sampleClip(clip, 250).tilt).toBe(5); // linear, half-way
    expect(sampleClip(clip, 750).tilt).toBe(5); // inOut(0.5) = 0.5
    expect(sampleClip(clip, 600).tilt).toBeCloseTo(9.68, 2); // inOut starts slow: inOut(0.2) = 0.032
  });

  it('clamps non-looping clips to their end', () => {
    expect(sampleClip(clip, 5000).tilt).toBe(0);
  });

  it('wraps looping clips', () => {
    const loop: Clip = { ...clip, loop: true };
    expect(sampleClip(loop, 1250).tilt).toBeCloseTo(sampleClip(loop, 250).tilt!);
  });
});

describe('EASE', () => {
  it('every ease maps 0 → 0 and 1 → 1', () => {
    for (const e of Object.values(EASE)) {
      expect(e(0)).toBeCloseTo(0);
      expect(e(1)).toBeCloseTo(1);
    }
  });

  it('outBack overshoots', () => {
    expect(Math.max(...[0.6, 0.7, 0.8, 0.9].map(EASE.outBack))).toBeGreaterThan(1);
  });
});
