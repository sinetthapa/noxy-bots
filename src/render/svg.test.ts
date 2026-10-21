import { describe, it, expect } from 'vitest';
import { accentColor, eyeColor, eyeStroke, lidBaselines, lidPolygon, loaderLift, mouthPath, popScale, type Lids } from './svg.ts';
import { DEFAULT_TUNING } from '../brain/tuning.ts';
import { CLASSIC } from '../character/nox/index.ts';

describe('svg helpers', () => {
  it('at chevron 0 the eye is a capsule: a line along the long side, stroked as wide as the short side', () => {
    expect(eyeStroke(54, 114, 0)).toEqual({ d: 'M0 30L0 -30L0 30', width: 54 });
    expect(eyeStroke(60, 7, 0)).toEqual({ d: 'M-26.5 0L0 0L26.5 0', width: 7 });
  });

  it('at chevron 1 the eye is a symmetric ^ with the apex on top', () => {
    const [x0, y0, ax, ay, x1, y1] = eyeStroke(60, 120, 1).d.match(/-?[\d.]+/g)!.map(Number);
    expect([x0 + x1, y0 - y1, ax]).toEqual([0, 0, 0]);
    expect(ay).toBeLessThan(y0);
  });

  it('open lids sit just outside the eye', () => {
    expect(lidBaselines(100, 0, 0)).toEqual({ yu: -52, yl: 52 });
  });

  it('overlapping lids meet in one line instead of inverting', () => {
    const { yu, yl } = lidBaselines(100, 0.8, 0.8);
    expect(yu).toBeCloseTo(yl);
  });

  it('a closed mouth is one curve traced both ways', () => {
    expect(mouthPath(1, 0.5, 0)).toBe('M-30 0Q0 6 30 0Q0 6 -30 0Z');
  });

  it('colours lerp between the theme colours', () => {
    expect(eyeColor(0, CLASSIC)).toBe('rgb(15,61,71)');
    expect(eyeColor(1, CLASSIC)).toBe('rgb(46,199,230)');
    expect(eyeColor(1.6, CLASSIC)).toBe('rgb(184,244,255)');
    expect(accentColor(0, CLASSIC)).toBe('rgb(250,108,46)');
  });

  describe('lidPolygon', () => {
    const W = 53.68;
    const H = 114.41;
    const lids = (o: Partial<Lids>): Lids => ({
      upperY: 0, upperAngle: 0, upperBend: 0, lowerY: 0, lowerAngle: 0, lowerBend: 0, ...o,
    });
    // 17 upper points left to right, then 17 lower points right to left: pair index i with 33 - i.
    const columns = (pts: [number, number][]) => Array.from({ length: 17 }, (_, i) => [pts[i][1], pts[33 - i][1]] as const);

    it('crossed lids never invert (equal lids, both tilted)', () => {
      const cols = columns(lidPolygon(W, H, lids({ upperY: 0.4, upperAngle: 35, lowerY: 0.4, lowerAngle: 35 }), 1));
      for (const [u, l] of cols) expect(l).toBeGreaterThanOrEqual(u);
      expect(cols.some(([u, l]) => l === u)).toBe(true);
    });

    it('crossed lids never invert (content eye)', () => {
      const cols = columns(lidPolygon(W, H, lids({ upperY: 0.3, upperBend: 0.6, lowerY: 0.38, lowerBend: 0.9 }), 1));
      for (const [u, l] of cols) expect(l).toBeGreaterThanOrEqual(u);
      expect(cols.some(([u, l]) => l === u)).toBe(true);
    });

    it('open lids span the full eye', () => {
      const pts = lidPolygon(W, H, lids({}), 1);
      expect(pts[0][1]).toBeLessThanOrEqual(-H / 2);
      expect(pts[17][1]).toBeGreaterThanOrEqual(H / 2);
    });

    it('a positive upper angle drops the inner end, mirrored by side', () => {
      const a = lidPolygon(W, H, lids({ upperAngle: 20 }), 1);
      expect(a[16][1]).toBeGreaterThan(a[0][1]);
      const b = lidPolygon(W, H, lids({ upperAngle: 20 }), -1);
      expect(b[16][1]).toBeLessThan(b[0][1]);
    });
  });

  it('popScale starts at 0, overshoots, and lands on 1', () => {
    expect(popScale(0)).toBe(0);
    expect(popScale(1)).toBeCloseTo(1, 6);
    expect(popScale(0.8)).toBeGreaterThan(1);
  });

  it('loaderLift bounces each dot in turn', () => {
    const { loaderBouncePx } = DEFAULT_TUNING.render;
    expect(loaderLift(0.2, 0)).toBeCloseTo(loaderBouncePx);
    expect(loaderLift(0.6, 0)).toBe(0);
    expect(loaderLift(0.35, 1)).toBeCloseTo(loaderBouncePx);
  });
});
