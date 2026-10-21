import { describe, expect, it } from 'vitest';
import { neutralPose } from '../brain/pose.ts';
import { DEFAULT_TUNING } from '../brain/tuning.ts';
import { buildRig } from '../character/build.ts';
import { resolveLook } from '../character/look.ts';
import { DEFAULT_LOOK, nox } from '../character/nox/index.ts';
import { fakeSvg } from './fake-svg.ts';
import { createSvgRenderer } from './svg.ts';

const layout = resolveLook(nox, DEFAULT_LOOK);
const pose = { ...neutralPose(), yaw: 0.4, lookX: 0.3, accentGlow: 0.5 };

describe('createSvgRenderer', () => {
  it('draws a prefixed rig exactly like a plain one', () => {
    const plain = fakeSvg(buildRig(nox, DEFAULT_LOOK));
    const pre = fakeSvg(buildRig(nox, DEFAULT_LOOK, { prefix: 'nb3-' }));
    createSvgRenderer(plain.svg, layout, DEFAULT_TUNING).draw(pose);
    createSvgRenderer(pre.svg, layout, DEFAULT_TUNING, { prefix: 'nb3-' }).draw(pose);
    expect(Object.fromEntries(Object.entries(pre.attrs).map(([k, v]) => [k.replace(/^nb3-/, ''), v]))).toEqual(plain.attrs);
  });

  it('a prefix that does not match the rig fails loudly', () => {
    expect(() => createSvgRenderer(fakeSvg(buildRig(nox, DEFAULT_LOOK)).svg, layout, DEFAULT_TUNING, { prefix: 'nb3-' })).toThrow('nox rig is missing #nb3-nox');
  });

  it('skips writes equal to the last ones', () => {
    const f = fakeSvg(buildRig(nox, DEFAULT_LOOK));
    const r = createSvgRenderer(f.svg, layout, DEFAULT_TUNING);
    r.draw(pose);
    const first = f.writes;
    expect(first).toBeGreaterThan(70);
    r.draw(pose);
    expect(f.writes).toBe(first);
    r.draw({ ...pose, yaw: -0.4 });
    expect(f.writes).toBeGreaterThan(first);
  });
});
