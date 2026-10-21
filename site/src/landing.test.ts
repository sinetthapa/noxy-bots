import { describe, expect, test } from 'vitest';
import { CLIPS } from '../../src/brain/library.ts';
import { booper, BOOPS, gaze, hopFrames, lottieSnippet, nextBoop } from './landing.ts';

const rect = { left: 100, top: 100, width: 200, height: 200 }; // centre (200, 200)

describe('gaze', () => {
  test('the bot centre is straight ahead', () => expect(gaze(200, 200, rect)).toEqual({ x: 0, y: 0 }));
  test('one bot-width right is fully right; up is negative y', () => expect(gaze(400, 0, rect)).toEqual({ x: 1, y: -1 }));
  test('far away clamps to −1…1', () => expect(gaze(-5000, 9000, rect)).toEqual({ x: -1, y: 1 }));
  test('half a width left is −0.5', () => expect(gaze(100, 200, rect).x).toBe(-0.5));
});

describe('lottieSnippet', () => {
  test("plays the studio's Lottie file for the state", () => {
    const s = lottieSnippet('sleep');
    expect(s).toContain("import lottie from 'lottie-web';");
    expect(s).toContain("path: '/noxy-sleep.json'");
  });
});

describe('hopFrames', () => {
  const y = (f: Keyframe) => Number(/translate\([^,]+, (-?[\d.]+)px\)/.exec(String(f.transform))![1]);
  test('n + 1 frames, from the offset at s0 to rest', () => {
    const f = hopFrames(10, 200, 0.8, 40, 12);
    expect(f).toHaveLength(13);
    expect(f[0].transform).toBe('translate(10px, 200px) scale(0.8, 0.8)');
    expect(f[12].transform).toBe('translate(0px, 0px) scale(1, 1)');
  });
  test('the arc rises lift px above a level start', () => expect(Math.min(...hopFrames(0, 0, 1, 40, 12).map(y))).toBe(-40));
});

describe('nextBoop', () => {
  test('never repeats the last reaction, at either end of the random range', () => {
    for (const last of BOOPS) for (const r of [0, 0.5, 0.9999]) expect(nextBoop(last, () => r)).not.toBe(last);
  });
  test('the first boop can be any reaction', () => expect(new Set([0, 0.3, 0.6, 0.9].map((r) => nextBoop(null, () => r)))).toEqual(new Set(BOOPS)));
});

describe('booper', () => {
  test('no new reaction while one plays: an emotion holds 1.4 s', () => {
    const boop = booper(() => 0); // happy first
    expect(boop.busy(0)).toBe(false);
    expect(boop.next(1000, false)).toBe('happy');
    for (const t of [1000, 1500, 2399]) expect(boop.busy(t)).toBe(true);
    expect(boop.busy(2400)).toBe(false);
  });
  test('a laugh blocks for the whole clip, and asleep it is always a laugh', () => {
    const boop = booper(() => 0);
    expect(boop.next(0, true)).toBe('laugh');
    expect(boop.busy(CLIPS.LAUGH.duration - 1)).toBe(true);
    expect(boop.busy(CLIPS.LAUGH.duration)).toBe(false);
  });
  test('reactions still never repeat back to back', () => {
    const boop = booper(() => 0);
    expect(boop.next(0, false)).toBe('happy');
    expect(boop.next(2000, false)).not.toBe('happy');
  });
});
