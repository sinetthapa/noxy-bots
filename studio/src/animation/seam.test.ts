// Pose math for seamless clips (M4 spec §4.3, §4.5).
import { describe, expect, it } from 'vitest';
import { neutralPose, type Pose } from 'noxy-src/brain/pose.ts';
import { BLEND, closeLoop, distance, findSeam, hasBlink, mix, resample, smooth } from './seam.ts';

const pose = (over: Partial<Pose> = {}): Pose => ({ ...neutralPose(), ...over });
const ramp = (length: number, key: keyof Pose = 'floatY') => Array.from({ length }, (_, i) => pose({ [key]: i }));

describe('mix', () => {
  it('blends plain values in a straight line', () => {
    expect(mix(pose({ floatY: 0 }), pose({ floatY: 10 }), 0.25).floatY).toBeCloseTo(2.5);
  });
  it('takes a phase the short way round, forward through the wrap', () => {
    expect(mix(pose({ zPhase: 0.9 }), pose({ zPhase: 0.1 }), 0.5).zPhase).toBeCloseTo(1);
    expect(mix(pose({ glyphSpin: 3.95 }), pose({ glyphSpin: 0.05 }), 0.5).glyphSpin).toBeCloseTo(4);
  });
});

it('smooth eases in and out', () => {
  expect([smooth(0), smooth(0.5), smooth(1)]).toEqual([0, 0.5, 1]);
});

it('distance scales each value by its range, and a phase by the turn', () => {
  expect(distance(pose(), pose())).toBe(0);
  expect(distance(pose({ floatY: 0 }), pose({ floatY: 6 }))).toBeCloseTo(0.1); // floatY spans 60
  expect(distance(pose({ zPhase: 0.95 }), pose({ zPhase: 0.05 }))).toBeCloseTo(0.1);
});

it('hasBlink sees a dip in either eye', () => {
  const P = Array.from({ length: BLEND }, () => pose());
  expect(hasBlink(P, 0)).toBe(false);
  P[30] = pose({ 'eyeR.open': 0.2 });
  expect(hasBlink(P, 0)).toBe(true);
});

describe('findSeam', () => {
  const n = 120;
  it('picks the start whose seconds before the start and before the end match best', () => {
    // A bump in floatY over [130, 190): only t0 = 130 keeps it out of both windows, [t0 − 60, t0) and [t0 + 60, t0 + 120).
    const P = Array.from({ length: BLEND + 2 * n }, (_, i) => pose({ floatY: i >= 130 && i < 190 ? 5 : 0 }));
    expect(findSeam(P, n, [60, 100, 130, 160])).toBe(130);
  });
  it('puts a blink-free seam before a closer match with a blink', () => {
    const P = Array.from({ length: BLEND + 2 * n }, (_, i) => pose({ floatY: i >= 130 && i < 190 ? 5 : 0 }));
    for (let i = 95; i < 105; i++) P[i] = pose({ 'eyeL.open': 0 }); // a blink inside t0 = 130's first window
    expect(findSeam(P, n, [60, 100, 130, 160])).toBe(60);
  });
});

describe('closeLoop', () => {
  const n = 120;
  const F = closeLoop(ramp(BLEND + 2 * n), BLEND, n);
  it('starts at t0 and ends on the pose just before it, so the wrap is an ordinary step', () => {
    expect(F).toHaveLength(n);
    expect(F[0].floatY).toBe(BLEND);
    expect(F[n - 1].floatY).toBeCloseTo(BLEND - 1);
  });
  it('leaves everything before the blend untouched and eases into it', () => {
    expect(F[n - BLEND - 1].floatY).toBe(BLEND + n - BLEND - 1);
    expect(Math.abs(F[n - BLEND].floatY - F[n - BLEND - 1].floatY)).toBeLessThan(1.1);
  });
});

describe('resample', () => {
  const F = [0, 0.25, 0.5, 0.75].map((zPhase) => pose({ zPhase, floatY: zPhase * 4 }));
  it('half speed doubles the frames and interpolates between steps', () => {
    const R = resample(F, 0.5);
    expect(R).toHaveLength(8);
    expect(R[1].floatY).toBeCloseTo(0.5);
  });
  it('wraps the last frame towards the first, phases forward', () => {
    expect(resample(F, 0.5)[7].zPhase).toBeCloseTo(0.875);
  });
  it('fast speeds skip steps', () => {
    expect(resample(F, 2).map((p) => p.zPhase)).toEqual([0, 0.5]);
  });
});
