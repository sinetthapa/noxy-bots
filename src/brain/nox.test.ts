import { describe, it, expect } from 'vitest';
import { createNox, STEP, type Nox } from './nox.ts';
import { PARAMS, PARAM_KEYS } from './params.ts';
import { DEFAULT_TUNING } from './tuning.ts';
import type { Pose } from './pose.ts';
import type { EventName } from './library.ts';
import { PERSONALITIES, tuningFor } from './personality.ts';

function ticks(nox: Nox, ms: number, each?: (p: Pose) => void): void {
  for (let t = 0; t < ms; t += STEP) {
    const p = nox.tick(STEP);
    each?.(p);
  }
}

describe('createNox', () => {
  it('is deterministic for a seed', () => {
    const a = createNox({ seed: 7 });
    const b = createNox({ seed: 7 });
    const c = createNox({ seed: 8 });
    for (const n of [a, b, c]) {
      ticks(n, 3000);
      n.trigger('SUCCESS');
      ticks(n, 7000);
    }
    expect(a.pose).toEqual(b.pose);
    expect(a.pose).not.toEqual(c.pose);
  });

  it('blinks while idle', () => {
    const n = createNox();
    let min = 1;
    ticks(n, 15_000, (p) => (min = Math.min(min, p['eyeL.open'])));
    expect(min).toBeLessThan(0.1);
  });

  it('settles into the sleep pose and does not blink there', () => {
    const n = createNox();
    n.setBase('SLEEP');
    ticks(n, 4000);
    let max = 0;
    ticks(n, 6000, (p) => (max = Math.max(max, p['eyeL.open'])));
    expect(max).toBeLessThan(0.1);
    expect(n.pose['earL.angle']).toBeGreaterThan(40);
  });

  it('SUCCESS produces a visible stretch and hop', () => {
    const n = createNox();
    ticks(n, 1000);
    n.trigger('SUCCESS');
    let minSquash = 0;
    let maxFloat = 0;
    ticks(n, 600, (p) => {
      minSquash = Math.min(minSquash, p.squash);
      maxFloat = Math.max(maxFloat, p.floatY);
    });
    expect(minSquash).toBeLessThan(-0.08);
    expect(maxFloat).toBeGreaterThan(8);
  });

  it('talks only while SPEAKING is effective (suspended in SLEEP)', () => {
    const n = createNox();
    n.setBase('SLEEP');
    n.setActivity('SPEAKING');
    let max = 0;
    ticks(n, 2000, (p) => (max = Math.max(max, p.mouthOpen)));
    expect(max).toBe(0);
    n.setBase('IDLE');
    ticks(n, 3000, (p) => (max = Math.max(max, p.mouthOpen)));
    expect(max).toBeGreaterThan(0.1);
  });

  it('tick(NaN) does not freeze the simulation', () => {
    const n = createNox();
    n.tick(NaN);
    const before = n.pose.floatY;
    ticks(n, 1000);
    expect(n.pose.floatY).not.toBe(before);
  });

  it('keeps every param in range and finite under stress', () => {
    const n = createNox({ seed: 3 });
    const events = ['SUCCESS', 'ERROR', 'NOTIFICATION', 'REMINDER', 'WAKE'] as const;
    const emotions = ['HAPPY', 'SAD', 'EXCITED', null] as const;
    for (let i = 0; i < 40; i++) {
      n.setEmotion(emotions[i % 4]);
      n.trigger(events[i % 5]);
      n.twitch(i % 2 ? 'L' : 'R');
      ticks(n, 150, (p) => {
        for (const k of PARAM_KEYS) {
          expect(Number.isFinite(p[k])).toBe(true);
          expect(p[k]).toBeGreaterThanOrEqual(PARAMS[k].min);
          expect(p[k]).toBeLessThanOrEqual(PARAMS[k].max);
        }
      });
    }
  });

  it('caps a huge frame gap (hidden tab) at 250 ms of simulation', () => {
    const a = createNox({ seed: 9 });
    const b = createNox({ seed: 9 });
    a.tick(10 * 60_000);
    b.tick(250);
    expect(a.pose).toEqual(b.pose);
  });

  it('WAKE opens both eyes together', () => {
    const n = createNox();
    n.setBase('SLEEP');
    ticks(n, 4000);
    n.trigger('WAKE');
    ticks(n, 1600, (p) => expect(Math.abs(p['eyeL.open'] - p['eyeR.open'])).toBeLessThan(1e-6));
  });

  it('hides the mouth by default and shows it for HAPPY', () => {
    const n = createNox();
    ticks(n, 4000);
    expect(n.pose.mouthAlpha).toBeCloseTo(0, 3);
    n.setEmotion('HAPPY');
    ticks(n, 4000);
    expect(n.pose.mouthAlpha).toBeCloseTo(1, 3);
  });

  it('the head follows the look direction', () => {
    const tuning = structuredClone(DEFAULT_TUNING);
    tuning.dart.rangeX = 0;
    tuning.dart.rangeY = 0;
    tuning.breathe.yawAmp = 0;
    const n = createNox({ tuning });
    n.setEmotion('CURIOUS');
    ticks(n, 4000);
    expect(n.pose.yaw).toBeCloseTo(0.35 * tuning.springs.headFollow, 2);
  });

  it('PROCESSING morphs the eyes into dots and back', () => {
    const n = createNox();
    n.setActivity('PROCESSING');
    ticks(n, 1000);
    expect(n.pose.loader).toBeCloseTo(1, 3);
    expect(n.pose.loaderPhase).toBeGreaterThanOrEqual(0);
    expect(n.pose.loaderPhase).toBeLessThan(1);
    n.setActivity(null);
    ticks(n, 1000);
    expect(n.pose.loader).toBeCloseTo(0, 3);
  });

  it('notify shows the badge until seen', () => {
    const n = createNox();
    n.notify();
    ticks(n, 4000);
    expect(n.pose.badge).toBeCloseTo(1, 2);
    expect(n.resolver.playing).toBeNull();
    n.seen();
    ticks(n, 3000);
    expect(n.pose.badge).toBeLessThan(0.01);
  });

  it('still motion freezes the body but not blinks or faces', () => {
    const n = createNox();
    n.setMotion('still');
    ticks(n, 2000);
    n.trigger('SUCCESS');
    let body = { floatY: 0, yaw: 0, tilt: 0, lookX: 0 };
    let minOpen = 1;
    let maxChevron = 0;
    ticks(n, 15_000, (p) => {
      body = {
        floatY: Math.max(body.floatY, Math.abs(p.floatY)),
        yaw: Math.max(body.yaw, Math.abs(p.yaw)),
        tilt: Math.max(body.tilt, Math.abs(p.tilt)),
        lookX: Math.max(body.lookX, Math.abs(p.lookX)),
      };
      minOpen = Math.min(minOpen, p['eyeL.open']);
      maxChevron = Math.max(maxChevron, p['eyeL.chevron']);
    });
    for (const v of Object.values(body)) expect(v).toBeLessThan(1e-6);
    expect(minOpen).toBeLessThan(0.1);
    expect(maxChevron).toBeGreaterThan(0.5);
  });

  it('new expressions reach their shapes and symbols', () => {
    const n = createNox();
    n.setEmotion('LOVE');
    ticks(n, 2000);
    expect(n.pose.glyphHeart).toBeCloseTo(1, 2);
    n.setEmotion('CONFUSED');
    ticks(n, 2000);
    expect(n.pose.symAsk).toBeCloseTo(1, 2);
    n.setEmotion(null);
    n.setActivity('CONNECTING');
    ticks(n, 2000);
    expect(n.pose.glyphRing).toBeCloseTo(1, 2);
  });

  it('DROWSY nods off', () => {
    const n = createNox();
    n.setBase('DROWSY');
    let max = 0;
    ticks(n, 9000, (p) => (max = Math.max(max, p['eyeL.upperLidY'])));
    expect(max).toBeGreaterThan(0.7);
  });

  it('tick(0) is a no-op', () => {
    const n = createNox();
    ticks(n, 500);
    const before = { ...n.pose };
    n.tick(0);
    expect(n.pose).toEqual(before);
  });
});

/** Largest pose difference between runs that differ only in fades.interruptOut: `first`, `gap` ms, then `second`. */
function interruptOutEffect(first: EventName, second: EventName, gap: number): number {
  const run = (interruptOut: number): Pose[] => {
    const tuning = structuredClone(DEFAULT_TUNING);
    tuning.fades.interruptOut = interruptOut;
    const n = createNox({ tuning });
    ticks(n, 500);
    n.trigger(first);
    ticks(n, gap);
    n.trigger(second);
    const out: Pose[] = [];
    ticks(n, 1500, (p) => out.push({ ...p }));
    return out;
  };
  const a = run(120);
  const b = run(5000);
  return Math.max(...a.flatMap((p, i) => PARAM_KEYS.map((k) => Math.abs(p[k] - b[i][k]))));
}

describe('event fades', () => {
  it('a queued hand-off fades the old clip out with eventOut, not interruptOut', () => {
    expect(interruptOutEffect('ERROR', 'NOTIFICATION', 0)).toBe(0); // NOTIFICATION queues behind ERROR
  });

  it('a real interrupt fades the old clip out with interruptOut', () => {
    expect(interruptOutEffect('NOTIFICATION', 'ERROR', 300)).toBeGreaterThan(0.01);
  });
});

describe('base change', () => {
  it('eases the breath instead of stepping floatY', () => {
    const n = createNox();
    const steps: number[] = [];
    let last = 0;
    const record = (p: Pose) => {
      steps.push(Math.abs(p.floatY - last));
      last = p.floatY;
    };
    ticks(n, 1825, record); // a quarter of the float period: the breath is at its peak, so a step in energy shows most
    const before = Math.max(...steps.slice(60));
    steps.length = 0;
    n.setBase('FOCUSED');
    ticks(n, 1000, record);
    expect(Math.max(...steps)).toBeLessThan(before * 10); // an eased switch is about 4x; the old instant step was about 50x
  });
});

describe('SPEAKING', () => {
  it('re-selecting mid-fade keeps the mouth amplitude from collapsing', () => {
    const tuning = structuredClone(DEFAULT_TUNING);
    tuning.talk.hz = 0.001; // near-constant talker value, so mouthOpen tracks the fade weight
    const n = createNox({ tuning });
    n.setActivity('SPEAKING');
    ticks(n, 1000);
    const settled = n.pose.mouthOpen;
    expect(settled).toBeGreaterThan(0.1);
    n.setActivity(null);
    ticks(n, 100); // fade-out is a third done
    n.setActivity('SPEAKING');
    let min = settled;
    ticks(n, 400, (p) => (min = Math.min(min, p.mouthOpen)));
    expect(min).toBeGreaterThan(settled * 0.6); // holds near the weight it had when re-selected
  });
});

describe('retune (M3 spec §4.1)', () => {
  const D = PERSONALITIES.default;

  it('re-rolls only the schedulers whose interval changed', () => {
    const nox = createNox({ seed: 1, tuning: tuningFor(D) });
    expect(nox.retune(tuningFor(D))).toEqual([]);
    expect(nox.retune(tuningFor({ ...D, glance: 2 }))).toEqual(['dart']);
    expect(nox.retune(tuningFor({ ...D, glance: 2, bounce: 2 }))).toEqual([]);
    expect(nox.tuning.breathe.floatAmp).toBe(10);
    expect(nox.retune(tuningFor({ ...D, glance: 2, bounce: 2, blink: 0, wiggle: 0 }))).toEqual(['blink', 'twitch']);
  });

  it('keeps the live tuning objects (springs hold references into them)', () => {
    const nox = createNox({ seed: 1 });
    const t = nox.tuning;
    const ear = nox.tuning.springs.ear;
    nox.retune(tuningFor({ ...D, wiggle: 2 }));
    expect(nox.tuning).toBe(t);
    expect(nox.tuning.springs.ear).toBe(ear);
    expect(ear.z).toBeCloseTo(0.175);
  });

  it('a brain at blink 0 never blinks; retuned to 1 it blinks within one interval', () => {
    const nox = createNox({ seed: 3, tuning: tuningFor({ ...D, blink: 0 }) });
    const closedIn = (ms: number) => {
      for (let t = 0; t < ms; t += STEP) if (nox.tick(STEP)['eyeL.open'] < 0.2) return true;
      return false;
    };
    expect(closedIn(60_000)).toBe(false);
    nox.retune(tuningFor(D));
    expect(closedIn(7000)).toBe(true);
  });
});
