import { describe, it, expect } from 'vitest';
import { PARAMS, PARAM_KEYS } from './params.ts';
import { neutralPose, combine, override, clampPose } from './pose.ts';
import { mulberry32 } from './rng.ts';

describe('params', () => {
  it('defines 52 params with defaults inside their ranges', () => {
    expect(PARAM_KEYS).toHaveLength(52);
    for (const k of PARAM_KEYS) {
      expect(PARAMS[k].def).toBeGreaterThanOrEqual(PARAMS[k].min);
      expect(PARAMS[k].def).toBeLessThanOrEqual(PARAMS[k].max);
    }
  });
});

describe('combine', () => {
  it('applies each param rule', () => {
    const p = neutralPose();
    combine(p, { tilt: 5, 'eyeL.scaleX': 1.2, 'eyeL.open': 0.3, 'eyeL.upperLidY': 0.4 });
    combine(p, { tilt: 2, 'eyeL.scaleX': 1.5, 'eyeL.open': 0.6, 'eyeL.upperLidY': 0.1 });
    expect(p.tilt).toBe(7); // add
    expect(p['eyeL.scaleX']).toBeCloseTo(1.8); // mul
    expect(p['eyeL.open']).toBe(0.3); // min: the most closed wins
    expect(p['eyeL.upperLidY']).toBe(0.4); // max
  });

  it('ignores keys that are explicitly undefined', () => {
    const p = neutralPose();
    combine(p, { tilt: undefined });
    expect(p.tilt).toBe(0);
  });
});

describe('override', () => {
  it('lerps toward the partial by weight', () => {
    const p = neutralPose();
    override(p, { tilt: 10 }, 0.25);
    expect(p.tilt).toBe(2.5);
    override(p, { tilt: 10 });
    expect(p.tilt).toBe(10);
  });
});

describe('clampPose', () => {
  it('clamps every param to its range', () => {
    const p = neutralPose();
    p.tilt = 999;
    p['eyeL.open'] = -1;
    clampPose(p);
    expect(p.tilt).toBe(25);
    expect(p['eyeL.open']).toBe(0);
  });
});

describe('mulberry32', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
