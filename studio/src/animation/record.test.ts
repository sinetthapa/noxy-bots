// The recorder (M4 spec §4, §10.1): seamless loops of every state, at any speed, with the live sways.
import { describe, expect, it } from 'vitest';
import { createNox, STEP } from 'noxy-src/brain/nox.ts';
import { PARAM_KEYS, PARAMS, type ParamKey } from 'noxy-src/brain/params.ts';
import { PERSONALITIES, tuningFor } from 'noxy-src/brain/personality.ts';
import type { Pose } from 'noxy-src/brain/pose.ts';
import { NAMES, type StateName } from 'noxy-src/commands.ts';
import { loopSteps, record, takeEvent, takeLoop, WARM, type ClipSpec } from './record.ts';
import { BLEND, findSeam, hasBlink, PHASES, turn } from './seam.ts';

const spec = (over: Partial<ClipSpec> = {}): ClipSpec => ({
  dials: { ...PERSONALITIES.default }, speed: 1, seed: 1, state: 'idle', event: null, gaze: null, ...over,
});
const STATES = [...NAMES.base, ...NAMES.activity, ...NAMES.emotion] as StateName[];
const BODY: ParamKey[] = ['floatY', 'squash', 'tilt', 'lean', 'yaw'];

/** |second difference| of one value at every frame, wrapping: a jump at the seam shows up at the first and last frames. */
const bends = (F: Pose[], k: ParamKey) =>
  F.map((_, i) => Math.abs(F[(i + 1) % F.length][k] - 2 * F[i][k] + F[(i - 1 + F.length) % F.length][k]));

/** The wrap bends no more than twice as hard as the rest of the clip. A missing or wrong blend makes it jump. */
function expectSmoothSeam(F: Pose[]): void {
  for (const k of BODY) {
    const b = bends(F, k);
    const inner = Math.max(...b.slice(1, -1));
    const tol = 1e-9 * (PARAMS[k].max - PARAMS[k].min);
    expect(b[0], `${k} at the first frame`).toBeLessThanOrEqual(2 * inner + tol);
    expect(b[b.length - 1], `${k} at the last frame`).toBeLessThanOrEqual(2 * inner + tol);
  }
}

it('loop lengths (spec §4.2)', () => {
  const ms = (s: StateName) => Math.round(loopSteps(s) * STEP);
  expect(Object.fromEntries((['idle', 'thinking', 'processing', 'connecting', 'speaking', 'offline', 'drowsy', 'sleep', 'happy'] as StateName[]).map((s) => [s, ms(s)]))).toEqual({
    idle: 8000, thinking: 8000, processing: 8000, connecting: 8000, speaking: 7200, offline: 6000, drowsy: 8000, sleep: 8000, happy: 8000,
  });
});

it('keeps the live sways: the take is the plain brain run (spec §4.1, the review decision)', () => {
  const n = loopSteps('idle');
  const P = takeLoop(spec(), n);
  const brain = createNox({ seed: 1, tuning: tuningFor(PERSONALITIES.default) });
  for (let i = 0; i < WARM; i++) brain.tick(STEP);
  const plain = Array.from({ length: P.length }, () => brain.tick(STEP));
  for (const k of ['floatY', 'tilt', 'yaw', 'squash'] as const) expect(P.map((p) => p[k])).toEqual(plain.map((p) => p[k]));
});

describe.each(STATES)('%s loop', (state) => {
  it.each([[1, 1], [2, 1], [3, 1], [1, 0.5], [2, 0.5], [3, 0.5]])('seed %i at speed %s closes smoothly', async (seed, speed) => {
    const F = await record(spec({ state, seed, speed }));
    expect(F).toHaveLength(Math.round(loopSteps(state) / speed));
    expect(F.every((p) => Number.isFinite(p.zPhase))).toBe(true); // the Zzz period never divides by 0
    expectSmoothSeam(F);
  });
});

it.each([['sleep', 0.1], ['sleep', 0.5], ['sleep', 1], ['processing', 0.1], ['processing', 0.5], ['processing', 1], ['connecting', 0.1], ['connecting', 0.5], ['connecting', 1]] as [StateName, number][])(
  '%s phases only move forward at speed %s (spec §4.5)',
  async (state, speed) => {
    const F = await record(spec({ state, speed }));
    for (const k of PHASES) {
      const steps = F.map((p, i) => turn(F[(i + 1) % F.length][k] - p[k]));
      expect(Math.min(...steps), k).toBeGreaterThanOrEqual(-1e-9);
    }
  },
);

it('the chosen seam has no blink when a clean one exists (spec §10.1)', () => {
  const n = loopSteps('idle');
  const starts = Array.from({ length: n / 6 }, (_, i) => BLEND + i * 6);
  const blinky = (P: Pose[], t0: number) => hasBlink(P, t0 - BLEND) || hasBlink(P, t0 + n - BLEND);
  for (const seed of [1, 2, 3]) {
    const P = takeLoop(spec({ seed }), n);
    if (starts.some((t0) => !blinky(P, t0))) expect(blinky(P, findSeam(P, n, starts)), `seed ${seed}`).toBe(false);
  }
});

it('speed 4 makes a quarter of the frames', async () => {
  expect(await record(spec({ speed: 4 }))).toHaveLength(120);
});

it('the same settings and seed give the same frames (Q8)', async () => {
  expect(await record(spec({ seed: 7, state: 'thinking' }))).toEqual(await record(spec({ seed: 7, state: 'thinking' })));
});

it('holds a pad gaze for the whole loop (Q9)', async () => {
  const F = await record(spec({ gaze: { x: 0.8, y: -0.6 } }));
  const mean = (k: ParamKey) => F.reduce((s, p) => s + p[k], 0) / F.length;
  expect(mean('lookX')).toBeGreaterThan(0.5);
  expect(mean('lookY')).toBeLessThan(-0.3);
});

it('a cancelled export stops recording', async () => {
  await expect(record(spec(), AbortSignal.abort())).rejects.toThrow();
});

/** Values that blinks, glances, twitches, talking and the sways move: everything else is driven by the state alone. */
const RANDOM = new Set<ParamKey>(['floatY', 'squash', 'tilt', 'yaw', 'lookX', 'lookY', 'eyeL.open', 'eyeR.open', 'earL.angle', 'earR.angle', 'earL.scaleY', 'earR.scaleY', 'mouthOpen', 'mouthWidth', ...PHASES]);
const STATE_KEYS = PARAM_KEYS.filter((k) => !RANDOM.has(k));

describe.each([...NAMES.event])('%s clip', (event) => {
  it.each([['idle', 1], ['idle', 0], ['idle', 2], ['sleep', 1], ['sleep', 0], ['sleep', 2]] as [StateName, number][])(
    'on %s with snap %s plays, then is back at rest before the blend (spec §4.4)',
    (state, snap) => {
      const { poses: P, n, played } = takeEvent({ ...spec({ state, dials: { ...PERSONALITIES.default, snap } }), event }, WARM);
      expect(played).toBe(true);
      // P[n − 1] is the clip's last frame before the blend; P[BLEND − 1] the rest just before the clip.
      for (const k of STATE_KEYS) expect(Math.abs(P[n - 1][k] - P[BLEND - 1][k]), k).toBeLessThanOrEqual(0.02 * (PARAMS[k].max - PARAMS[k].min));
    },
  );

  it('closes smoothly and is the length the take says', async () => {
    const F = await record(spec({ event }));
    expect(F.length % 6).toBe(0); // whole 100 ms
    expectSmoothSeam(F);
  });
});

it('an event clip on a state with a cycle is a whole number of cycles', () => {
  const { n } = takeEvent({ ...spec({ state: 'thinking' }), event: 'success' }, WARM);
  expect(n % 240).toBe(0); // thinking's 4 s loop
});
