// "Classic looks the same" (spec §10.1): replays the recorded poses through today's renderer on the built
// Classic rig and compares with what the old renderer set on the old rig.
import { describe, expect, it } from 'vitest';
import type { Pose } from '../brain/pose.ts';
import { DEFAULT_TUNING } from '../brain/tuning.ts';
import { buildRig } from '../character/build.ts';
import { resolveLook } from '../character/look.ts';
import { DEFAULT_LOOK, nox } from '../character/nox/index.ts';
import goldenJson from './__fixtures__/classic-golden.json?raw';
import { fakeSvg } from './fake-svg.ts';
import { createSvgRenderer } from './svg.ts';

type XY = [number, number];
interface Golden {
  refs: Record<string, [XY, XY][]>; // per element: [point in today's art, the same point in M1's art]
  frames: { name: string; pose: Pose; attrs: Record<string, string> }[];
}
const golden = JSON.parse(goldenJson) as Golden;
const RENAME: Record<string, string> = { 'accent-l': 'bolt-l', 'accent-r': 'bolt-r', 'accent-l-glow': 'bolt-l-halo', 'accent-r-glow': 'bolt-r-halo' };
const TOLERANCE = 1.5; // rig units; the computed worst case is the right ear at earR.angle 100: 1.39
const LOCAL: [XY, XY][] = [[[0, 0], [0, 0]], [[100, 100], [100, 100]]];

/** The transform forms the renderer writes (translate, rotate with an optional centre, scale) as an affine [a b c d e f]. */
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
const apply = ([a, b, c, d, e, f]: number[], [x, y]: XY): XY => [a * x + c * y + e, b * x + d * y + f];

it('toMatrix composes left to right like SVG', () => {
  expect(apply(toMatrix('translate(10 0) rotate(90) scale(2 1) translate(-10 0)'), [11, 0]).map((v) => +v.toFixed(9))).toEqual([10, 2]);
  expect(apply(toMatrix('rotate(90 10 0)'), [11, 0]).map((v) => +v.toFixed(9))).toEqual([10, 1]);
});

describe('Classic matches the golden recording', () => {
  const { svg, attrs } = fakeSvg(buildRig(nox, DEFAULT_LOOK));
  // Recorded with M1's 26px up/down eye travel; M3 polish widened it on purpose, so the recording replays with the old value.
  const renderer = createSvgRenderer(svg, resolveLook(nox, DEFAULT_LOOK), { ...DEFAULT_TUNING, render: { ...DEFAULT_TUNING.render, lookYPx: 26 } });
  for (const frame of golden.frames) {
    it(frame.name, () => {
      renderer.draw(frame.pose);
      for (const [key, was] of Object.entries(frame.attrs)) {
        const [id, name] = key.split(' ');
        const now = attrs[`${RENAME[id] ?? id} ${name}`];
        if (name !== 'transform') {
          expect(now, key).toBe(was);
          continue;
        }
        for (const [p, q] of golden.refs[id] ?? LOCAL) {
          const [x0, y0] = apply(toMatrix(was), p);
          const [x1, y1] = apply(toMatrix(now), q);
          expect(Math.hypot(x1 - x0, y1 - y0), `${key} at ${p}`).toBeLessThanOrEqual(TOLERANCE);
        }
      }
    });
  }
});
