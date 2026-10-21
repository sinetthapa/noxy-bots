// Personality dials over DEFAULT_TUNING (M3 spec §4.1).
import { describe, expect, it } from 'vitest';
import { DIALS, isPersonality, PERSONALITIES, tuningFor, type DialName } from './personality.ts';
import { DEFAULT_TUNING } from './tuning.ts';

const at = (k: DialName, v: number) => tuningFor({ ...PERSONALITIES.default, [k]: v });

describe('tuningFor', () => {
  it('every dial at 1 is DEFAULT_TUNING, and DEFAULT_TUNING is not changed', () => {
    const before = structuredClone(DEFAULT_TUNING);
    expect(tuningFor(PERSONALITIES.default)).toEqual(DEFAULT_TUNING);
    at('energy', 2);
    expect(DEFAULT_TUNING).toEqual(before);
  });

  it('energy scales every base', () => {
    expect(at('energy', 2).energy.IDLE).toBeCloseTo(1.6);
    expect(at('energy', 0).energy.FOCUSED).toBe(0);
  });

  it('bounce and squish scale the float and the squash', () => {
    expect(at('bounce', 2).breathe.floatAmp).toBe(10);
    expect(at('bounce', 0).breathe.floatAmp).toBe(0);
    expect(at('squish', 2).breathe.squashAmp).toBeCloseTo(0.032);
  });

  it('blink: 2 halves every interval, 0 never blinks', () => {
    expect(at('blink', 2).blink.interval.IDLE).toEqual({ min: 1100, max: 3000 });
    expect(at('blink', 0).blink.interval.DROWSY).toEqual({ min: Infinity, max: Infinity });
  });

  it('glance: rate and range', () => {
    const t = at('glance', 2);
    expect([t.dart.minMs, t.dart.maxMs]).toEqual([450, 1600]);
    expect(t.dart.rangeX).toBeCloseTo(0.825);
    const z = at('glance', 0);
    expect(z.dart.minMs).toBe(Infinity);
    expect(z.dart.rangeY).toBeCloseTo(0.2); // glance 0 halves the range: 0.4 / 2
  });

  it('wiggle: ear damping, inertia and twitches', () => {
    expect(at('wiggle', 0).springs.ear.z).toBe(1);
    expect(at('wiggle', 0).twitch.minMs).toBe(Infinity);
    expect(at('wiggle', 2).springs.ear.z).toBeCloseTo(0.175);
    expect(at('wiggle', 2).springs.earInertia).toBeCloseTo(0.16);
    expect(at('wiggle', 2).twitch.maxMs).toBe(6000);
  });

  it('head: follow, tilt and sway', () => {
    const t = at('head', 0);
    expect([t.springs.headFollow, t.springs.headTilt, t.breathe.tiltAmp, t.breathe.yawAmp]).toEqual([0, 0, 0, 0]);
    expect(at('head', 2).springs.headTilt).toBe(6);
  });

  it('snap: 0 is half speed, 2 double; fades follow', () => {
    expect(at('snap', 0).springs.transition.f).toBeCloseTo(0.8);
    expect(at('snap', 2).springs.transition.f).toBeCloseTo(3.2);
    expect(at('snap', 2).fades.eventIn).toBeCloseTo(40);
    expect(at('snap', 0).fades.activity).toBeCloseTo(600);
  });

  it('never touches render, motion or talk', () => {
    const t = tuningFor({ energy: 2, bounce: 2, squish: 2, blink: 0, glance: 0, wiggle: 2, head: 2, snap: 0 });
    expect(t.render).toEqual(DEFAULT_TUNING.render);
    expect(t.motion).toEqual(DEFAULT_TUNING.motion);
    expect(t.talk).toEqual(DEFAULT_TUNING.talk);
  });
});

describe('PERSONALITIES', () => {
  it('every preset sets every dial in 0–2', () => {
    for (const p of Object.values(PERSONALITIES)) {
      expect(Object.keys(p)).toEqual([...DIALS]);
      for (const k of DIALS) expect(p[k] >= 0 && p[k] <= 2).toBe(true);
    }
  });

  it('isPersonality checks own keys only', () => {
    expect(isPersonality('shy')).toBe(true);
    for (const bad of ['constructor', '__proto__', 'toString', 'hasOwnProperty', '', 1, null, undefined]) expect(isPersonality(bad)).toBe(false);
  });
});
