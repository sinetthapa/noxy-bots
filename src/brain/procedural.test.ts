import { describe, it, expect } from 'vitest';
import { mulberry32 } from './rng.ts';
import { DEFAULT_TUNING } from './tuning.ts';
import { Blinker, Darter, Talker, Twitcher, breathe } from './procedural.ts';
import type { Base } from './library.ts';
import { PERSONALITIES, tuningFor } from './personality.ts';

const STEP = 1000 / 60;
const tuning = structuredClone(DEFAULT_TUNING);
const bt = tuning.blink;
const blinkLen = bt.closeMs + bt.holdMs + bt.openMs;

/** Simulated times (ms) at which blinks start. */
function blinkStarts(base: Base, ms: number, seed = 3): number[] {
  const b = new Blinker(mulberry32(seed), tuning, base);
  const starts: number[] = [];
  for (let t = 0; t < ms; t += STEP) {
    const before = b.blinks;
    b.update(STEP, base);
    if (b.blinks > before) starts.push(t);
  }
  return starts;
}

describe('Blinker', () => {
  for (const base of ['IDLE', 'FOCUSED', 'BREAK'] as const) {
    it(`${base}: every gap is a double-blink gap or inside the interval range`, () => {
      const { min, max } = bt.interval[base];
      const s = blinkStarts(base, 120_000);
      expect(s.length).toBeGreaterThan(5);
      for (let i = 1; i < s.length; i++) {
        const gap = s[i] - s[i - 1];
        const isDouble = Math.abs(gap - (blinkLen + bt.doubleGapMs)) <= 2 * STEP;
        const isNormal = gap >= blinkLen + min - 2 * STEP && gap <= blinkLen + max + 2 * STEP;
        expect(isDouble || isNormal).toBe(true);
      }
    });
  }

  it('never blinks in SLEEP and resumes after waking', () => {
    const b = new Blinker(mulberry32(1), tuning, 'SLEEP');
    for (let t = 0; t < 60_000; t += STEP) expect(b.update(STEP, 'SLEEP')).toBe(1);
    expect(b.blinks).toBe(0);
    for (let t = 0; t < 11_000; t += STEP) b.update(STEP, 'IDLE');
    expect(b.blinks).toBeGreaterThan(0);
  });

  it('re-rolls the wait from the new base on a base change, keeping the time already waited', () => {
    const t = structuredClone(tuning);
    t.blink.interval.FOCUSED = { min: 60_000, max: 60_000 };
    t.blink.interval.BREAK = { min: 6000, max: 6000 };
    const b = new Blinker(mulberry32(1), t, 'FOCUSED');
    for (let ms = 0; ms < 5000; ms += STEP) b.update(STEP, 'FOCUSED');
    expect(b.blinks).toBe(0);
    for (let ms = 0; ms < 1200; ms += STEP) b.update(STEP, 'BREAK');
    expect(b.blinks).toBe(1); // 5 s waited + 1 s more = BREAK's 6 s
  });

  it('keeps the double-blink gap through a base change', () => {
    const t = structuredClone(tuning);
    t.blink.doubleChance = 1;
    t.blink.interval.IDLE = { min: 2000, max: 2000 };
    t.blink.interval.BREAK = { min: 60_000, max: 60_000 };
    const b = new Blinker(mulberry32(1), t, 'IDLE');
    while (b.blinks < 1) b.update(STEP, 'IDLE');
    while (b.update(STEP, 'IDLE') < 1); // finish the first blink: now inside the gap
    for (let ms = 0; ms < t.blink.doubleGapMs + 3 * STEP; ms += STEP) b.update(STEP, 'BREAK');
    expect(b.blinks).toBe(2);
  });

  it('closes fully during the hold', () => {
    const b = new Blinker(mulberry32(1), tuning, 'IDLE');
    let min = 1;
    for (let t = 0; t < 12_000; t += STEP) min = Math.min(min, b.update(STEP, 'IDLE'));
    expect(min).toBe(0);
  });
});

describe('Darter', () => {
  it('keeps offsets inside range × energy', () => {
    const d = new Darter(mulberry32(5), tuning);
    for (let t = 0; t < 60_000; t += STEP) {
      const o = d.update(STEP, 0.5, false);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(tuning.dart.rangeX * 0.5 + 1e-9);
      expect(Math.abs(o.y)).toBeLessThanOrEqual(tuning.dart.rangeY * 0.5 + 1e-9);
    }
  });

  it('rescales a held glance when energy changes', () => {
    const d = new Darter(mulberry32(5), tuning);
    for (let t = 0; t < 10_000; t += STEP) d.update(STEP, 1, false);
    const full = d.update(0, 1, false);
    const half = d.update(0, 0.5, false);
    expect(Math.abs(full.x) + Math.abs(full.y)).toBeGreaterThan(0.05);
    expect(half.x).toBeCloseTo(full.x / 2);
    expect(half.y).toBeCloseTo(full.y / 2);
  });

  it('returns to center while paused', () => {
    const d = new Darter(mulberry32(5), tuning);
    for (let t = 0; t < 10_000; t += STEP) d.update(STEP, 1, false);
    let o = { x: 1, y: 1 };
    for (let t = 0; t < 200; t += STEP) o = d.update(STEP, 1, true);
    expect(o.x).toBeCloseTo(0);
    expect(o.y).toBeCloseTo(0);
  });
});

describe('Talker', () => {
  it('stays inside [0, max]', () => {
    const tk = new Talker(mulberry32(2));
    for (let t = 0; t < 10_000; t += STEP) {
      const v = tk.update(STEP, 9, 0.55);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0.55);
    }
  });
});

describe('Twitcher', () => {
  it('fires only when enabled, every 5–12 s', () => {
    const tw = new Twitcher(mulberry32(4), tuning);
    let n = 0;
    for (let t = 0; t < 60_000; t += STEP) if (tw.update(STEP, false)) n++;
    expect(n).toBe(0);
    for (let t = 0; t < 60_000; t += STEP) if (tw.update(STEP, true)) n++;
    expect(n).toBeGreaterThanOrEqual(4); // 60 s / 12 s max interval, minus edge frames
    expect(n).toBeLessThanOrEqual(12);
  });
});

describe('breathe', () => {
  it('amplitude scales with energy', () => {
    let sq = 0;
    let fy = 0;
    let tl = 0;
    let yw = 0;
    for (let t = 0; t < 20_000; t += STEP) {
      const b = breathe(t, 0.5, tuning.breathe);
      sq = Math.max(sq, Math.abs(b.squash));
      fy = Math.max(fy, Math.abs(b.floatY));
      tl = Math.max(tl, Math.abs(b.tilt));
      yw = Math.max(yw, Math.abs(b.yaw));
    }
    expect(sq).toBeCloseTo(tuning.breathe.squashAmp * 0.5, 3);
    expect(fy).toBeCloseTo(tuning.breathe.floatAmp * 0.5, 1);
    expect(tl).toBeCloseTo(tuning.breathe.tiltAmp * 0.5, 2);
    expect(yw).toBeCloseTo(tuning.breathe.yawAmp * 0.5, 3);
  });
});

describe('dials at 0 (M3 spec §4.1)', () => {
  const off = tuningFor({ ...PERSONALITIES.default, blink: 0, glance: 0, wiggle: 0 });
  const STEP = 1000 / 60;

  it('a Blinker at blink 0 never closes the eyes in 60 s', () => {
    const b = new Blinker(mulberry32(1), off, 'IDLE');
    for (let t = 0; t < 60_000; t += STEP) expect(b.update(STEP, 'IDLE')).toBe(1);
  });

  it('a Darter at glance 0 never moves the eyes in 60 s', () => {
    const d = new Darter(mulberry32(1), off);
    for (let t = 0; t < 60_000; t += STEP) expect(d.update(STEP, 1, false)).toEqual({ x: 0, y: 0 });
  });

  it('a Twitcher at wiggle 0 never twitches in 60 s', () => {
    const w = new Twitcher(mulberry32(1), off);
    for (let t = 0; t < 60_000; t += STEP) expect(w.update(STEP, true)).toBeNull();
  });

  it('reroll() picks up a live tuning change: blink 0 → 1 blinks again', () => {
    const t = structuredClone(off);
    const b = new Blinker(mulberry32(1), t, 'IDLE');
    for (let i = 0; i < 600; i++) b.update(STEP, 'IDLE');
    t.blink.interval = structuredClone(DEFAULT_TUNING.blink.interval);
    b.reroll();
    let closed = false;
    for (let ms = 0; ms < 7000 && !closed; ms += STEP) closed = b.update(STEP, 'IDLE') < 0.2;
    expect(closed).toBe(true);
  });

  it('turning blink up from 0 starts a fresh wait: no blink before the shortest interval', () => {
    const t = structuredClone(off);
    const b = new Blinker(mulberry32(1), t, 'IDLE');
    for (let ms = 0; ms < 60_000; ms += STEP) b.update(STEP, 'IDLE');
    t.blink.interval = structuredClone(DEFAULT_TUNING.blink.interval);
    b.reroll();
    for (let ms = 0; ms < DEFAULT_TUNING.blink.interval.IDLE.min - STEP; ms += STEP) expect(b.update(STEP, 'IDLE')).toBe(1);
  });

  it('turning glance up from 0 starts a fresh wait', () => {
    const t = structuredClone(off);
    const d = new Darter(mulberry32(1), t);
    for (let ms = 0; ms < 60_000; ms += STEP) d.update(STEP, 1, false);
    t.dart = structuredClone(DEFAULT_TUNING.dart);
    d.reroll();
    for (let ms = 0; ms < DEFAULT_TUNING.dart.minMs - STEP; ms += STEP) expect(d.update(STEP, 1, false)).toEqual({ x: 0, y: 0 });
  });

  it('turning wiggle up from 0 starts a fresh wait', () => {
    const t = structuredClone(off);
    const w = new Twitcher(mulberry32(1), t);
    for (let ms = 0; ms < 60_000; ms += STEP) w.update(STEP, true);
    t.twitch = structuredClone(DEFAULT_TUNING.twitch);
    w.reroll();
    for (let ms = 0; ms < DEFAULT_TUNING.twitch.minMs - STEP; ms += STEP) expect(w.update(STEP, true)).toBeNull();
  });

  it('turning blink up while asleep still never blinks until the bot wakes', () => {
    const t = structuredClone(off);
    const b = new Blinker(mulberry32(1), t, 'SLEEP');
    for (let ms = 0; ms < 10_000; ms += STEP) b.update(STEP, 'SLEEP');
    t.blink.interval = structuredClone(DEFAULT_TUNING.blink.interval);
    b.reroll();
    for (let ms = 0; ms < 60_000; ms += STEP) expect(b.update(STEP, 'SLEEP')).toBe(1);
  });
});
