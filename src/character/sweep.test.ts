// Every combination builds and draws (spec §10.4). Drawing through the string-backed fake root is the id
// contract: the renderer's $() throws on any id the built rig lacks.
import { describe, expect, it } from 'vitest';
import { neutralPose, type Pose } from '../brain/pose.ts';
import { DEFAULT_TUNING } from '../brain/tuning.ts';
import { fakeSvg } from '../render/fake-svg.ts';
import { createSvgRenderer } from '../render/svg.ts';
import { buildRig } from './build.ts';
import { resolveLook } from './look.ts';
import { DEFAULT_LOOK, nox } from './nox/index.ts';
import type { Look, XY } from './types.ts';

const POSES: Partial<Pose>[] = [
  {},
  { yaw: 1, 'earL.angle': 100, 'earR.angle': 100 },
  { yaw: -1, 'earL.angle': -40, 'earR.angle': -40 },
  { accentGlow: 1, symBulb: 1, bulbLit: 1, badge: 1 },
  { loader: 1, loaderPhase: 0.3 },
  { glyphHeart: 1 },
  { 'eyeL.chevron': 1, 'eyeR.chevron': 1, mouthOpen: 0.6 },
  { symZ: 1, zPhase: 0.4 },
  { lookX: 1, lookY: -1, 'eyeL.open': 0.2 },
  { tilt: 20, squash: 0.3, floatY: 20 },
];

const looks: Look[] = [];
for (const body of nox.parts.body)
  for (const ears of nox.parts.ears)
    for (const eyes of nox.parts.eyes)
      for (const bolts of nox.parts.bolts)
        for (const theme of nox.themes) looks.push({ ...DEFAULT_LOOK, body: body.id, ears: ears.id, eyes: eyes.id, bolts: bolts.id, theme: theme.id });

describe('every combination', () => {
  const [fx, fy, fw, fh] = nox.frame;
  const inFrame = ([x, y]: XY) => x >= fx && x <= fx + fw && y >= fy && y <= fy + fh;
  it.each(looks.map((l) => [`${l.body} ${l.ears} ${l.eyes} ${l.bolts} ${l.theme}`, l] as const))('%s builds and draws', (_, l) => {
    const layout = resolveLook(nox, l);
    for (const glow of ['halo', 'blur'] as const) {
      const r = createSvgRenderer(fakeSvg(buildRig(nox, l, { glow })).svg, layout, DEFAULT_TUNING);
      for (const o of POSES) r.draw({ ...neutralPose(), ...o });
    }
    const points = [layout.eye.c.L, layout.eye.c.R, layout.ear.anchor.L, layout.ear.anchor.R, layout.bolt.anchor.L, layout.bolt.anchor.R, layout.symbols, layout.badge, layout.zzz.from, layout.zzz.to];
    for (const p of points) expect(inFrame(p), String(p)).toBe(true);
  });
});
