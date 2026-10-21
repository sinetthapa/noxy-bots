// SVG geometry → Lottie (M4 spec §6.3, §10.2 "Conversions"): quadratics and arcs become the right cubics, and every
// transform list the renderer writes splits into Lottie transforms that compose to the same matrix.
import { describe, expect, it } from 'vitest';
import { arcToCubics, parsePath, parseTransform, toTrs, trsMatrix, apply, mul, type Mat, type XY } from './geometry.ts';

// Copied from src/render/golden.test.ts (spec §8): an SVG transform list as [a b c d e f], composed left to right.
function toMatrix(t: string): number[] {
  const mul = ([a, b, c, d, e, f]: number[], [A, B, C, D, E, F]: number[]) => [a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f];
  let m = [1, 0, 0, 1, 0, 0];
  for (const [, fn, args] of t.matchAll(/(\w+)\(([^)]*)\)/g)) {
    const n = args.trim().split(/[\s,]+/).map(Number);
    if (fn === 'translate') m = mul(m, [1, 0, 0, 1, n[0], n[1] ?? 0]);
    else if (fn === 'scale') m = mul(m, [n[0], 0, 0, n[1] ?? n[0], 0, 0]);
    else if (fn === 'rotate') {
      const r = (n[0] * Math.PI) / 180;
      const [cx = 0, cy = 0] = n.slice(1);
      m = mul(mul(mul(m, [1, 0, 0, 1, cx, cy]), [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    } else throw new Error(`unsupported transform ${fn}()`);
  }
  return m;
}

/** A point on cubic k of a path at t, from its vertices and relative tangents. */
const at = (b: { v: XY[]; i: XY[]; o: XY[] }, k: number, t: number): XY => {
  const p0 = b.v[k];
  const p3 = b.v[(k + 1) % b.v.length];
  const p1: XY = [p0[0] + b.o[k][0], p0[1] + b.o[k][1]];
  const p2: XY = [p3[0] + b.i[(k + 1) % b.v.length][0], p3[1] + b.i[(k + 1) % b.v.length][1]];
  const u = 1 - t;
  return [0, 1].map((c) => u * u * u * p0[c] + 3 * u * u * t * p1[c] + 3 * u * t * t * p2[c] + t * t * t * p3[c]) as XY;
};

const round = (p: number[]) => p.map((v) => +v.toFixed(6) + 0);

describe('parsePath', () => {
  it('keeps a polygon a polygon: lines have zero tangents, and a closing line back to the start stays a vertex', () => {
    const [b] = parsePath('M0 0L10 0L10 10L0 0Z');
    expect(b).toEqual({ c: true, v: [[0, 0], [10, 0], [10, 10], [0, 0]], i: [[0, 0], [0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0], [0, 0]] });
  });

  it('turns a quadratic into the cubic with controls 2/3 of the way to its control point', () => {
    const [b] = parsePath('M0 0Q50 100 100 0');
    expect(b.v).toEqual([[0, 0], [100, 0]]);
    expect(round(b.o[0])).toEqual([33.333333, 66.666667]);
    expect(round(b.i[1])).toEqual([-33.333333, 66.666667]);
    expect(round(at(b, 0, 0.5))).toEqual([50, 50]); // the quadratic's own midpoint
  });

  it("merges a closing curve into the start, like the renderer's mouth", () => {
    const [b] = parsePath('M-10 0Q0 6 10 0Q0 -4 -10 0Z');
    expect(b.c).toBe(true);
    expect(b.v).toEqual([[-10, 0], [10, 0]]);
    expect(round(at(b, 1, 0.5))).toEqual([0, -2]);
  });

  it('reads relative commands, H and V, and reflects the control for S and T', () => {
    expect(parsePath('m10 10h10v10l-10 0z')[0].v).toEqual([[10, 10], [20, 10], [20, 20], [10, 20]]);
    expect(parsePath('M0 0C0 10 10 10 10 0S20 -10 20 0')[0].o[1]).toEqual([0, -10]);
    expect(round(at(parsePath('M0 0Q10 10 20 0T40 0')[0], 1, 0.5))).toEqual([30, -5]);
  });

  it('splits an arc into cubics of at most 90° that stay on the ellipse', () => {
    expect(parsePath('M0 0A10 10 0 0 1 20 0')[0].v.map(round)).toEqual([[0, 0], [10, -10], [20, 0]]); // sweep 1 goes over the top
    // A rotated ellipse with a known centre, from parameter angle 0 to 250°: three cubics.
    const [cx, cy, rx, ry, phi] = [50, 50, 20, 10, Math.PI / 6];
    const on = (t: number): XY => [cx + rx * Math.cos(t) * Math.cos(phi) - ry * Math.sin(t) * Math.sin(phi), cy + rx * Math.cos(t) * Math.sin(phi) + ry * Math.sin(t) * Math.cos(phi)];
    const [s, e] = [on(0), on((250 * Math.PI) / 180)];
    expect(arcToCubics(s, rx, ry, 30, true, true, e)).toHaveLength(3);
    const [b] = parsePath(`M${s[0]} ${s[1]}A${rx} ${ry} 30 1 1 ${e[0]} ${e[1]}`);
    for (let k = 0; k < 3; k++)
      for (const t of [0.25, 0.5, 0.75]) {
        const [x, y] = at(b, k, t);
        const [u, v] = [(x - cx) * Math.cos(phi) + (y - cy) * Math.sin(phi), -(x - cx) * Math.sin(phi) + (y - cy) * Math.cos(phi)];
        expect(Math.abs(Math.hypot(u / rx, v / ry) - 1)).toBeLessThan(1e-3);
      }
  });

  it('throws on what it cannot draw', () => {
    expect(() => parsePath('M0 0A10 10 0 2 1 20 0')).toThrow(/arc flags/);
    expect(() => parsePath('M0 0X10 10')).toThrow(/unsupported path command "X"/);
    expect(() => parsePath('10 10')).toThrow(/must start with a command/);
    expect(() => parsePath('M0 0L10')).toThrow(/bad path data/);
  });
});

describe('transforms', () => {
  // The renderer's own forms (src/render/svg.ts), with values far from 0 so a wrong order shows.
  const LISTS = [
    'translate(3.5 -7)',
    'rotate(-4.2 245 310) translate(260 590) scale(1.04 0.92) translate(-260 -590)',
    'translate(6 0) translate(312 712) scale(0.81) translate(-312 -712)',
    'translate(120.5 40) rotate(17) scale(1.2 0.8) translate(-120.5 -40)',
    'translate(-3 2) scale(1.3) translate(4 -1)',
    'rotate(400) scale(0.5)',
    'scale(2) rotate(30)',
    'translate(10 20) rotate(15 5 5) rotate(-20) scale(1.1)',
  ];
  for (const list of LISTS)
    it(list, () => {
      const m = toTrs(parseTransform(list)).map(trsMatrix).reduce((a, b) => mul(a, b));
      const want = toMatrix(list) as Mat;
      for (const p of [[0, 0], [100, 0], [0, 100], [-37, 52]] as XY[]) {
        const [x0, y0] = apply(want, p);
        const [x1, y1] = apply(m, p);
        expect(Math.hypot(x1 - x0, y1 - y0)).toBeLessThan(1e-9);
      }
    });

  it("splits by the kinds of operation only, so every frame of a track splits alike (the body's tilt, then squash)", () => {
    const a = toTrs(parseTransform('rotate(0 245 310) translate(260 590) scale(1 1) translate(-260 -590)'));
    const b = toTrs(parseTransform('rotate(5 245 310) translate(260 590) scale(1.1 0.9) translate(-260 -590)'));
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(2);
  });

  it('throws on skew, matrix and bad numbers', () => {
    expect(() => parseTransform('skewX(10)')).toThrow(/unsupported transform/);
    expect(() => parseTransform('matrix(1 0 0 1 0 0)')).toThrow(/unsupported transform/);
    expect(() => parseTransform('translate(a b)')).toThrow(/bad transform/);
  });
});
