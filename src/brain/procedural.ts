import { EASE } from './clips.ts';
import { isAsleep, type Base } from './library.ts';
import { uniform, type Rng } from './rng.ts';
import type { Tuning } from './tuning.ts';

/** Sines (squash, float, tilt, yaw) with periods that don't divide evenly, so the combined motion never visibly repeats. */
export function breathe(
  tMs: number,
  energy: number,
  b: Tuning['breathe'],
): { squash: number; floatY: number; tilt: number; yaw: number } {
  return {
    squash: Math.sin((2 * Math.PI * tMs) / b.squashPeriod) * b.squashAmp * energy,
    floatY: Math.sin((2 * Math.PI * tMs) / b.floatPeriod) * b.floatAmp * energy,
    tilt: Math.sin((2 * Math.PI * tMs) / b.tiltPeriod) * b.tiltAmp * energy,
    yaw: Math.sin((2 * Math.PI * tMs) / b.yawPeriod) * b.yawAmp * energy,
  };
}

/** Random blinks: fast close, short hold, slower open; sometimes a double blink; slow when drowsy; never while asleep. */
export class Blinker {
  blinks = 0;
  private rng: Rng;
  private tuning: Tuning;
  private waited = 0;
  private next: number;
  private nextBase!: Base; // the base whose interval set `next` (assigned by schedule)
  private blinkT = -1; // ms into the current blink; −1 = not blinking
  private double = false;

  constructor(rng: Rng, tuning: Tuning, base: Base) {
    this.rng = rng;
    this.tuning = tuning;
    this.next = this.schedule(base);
  }

  /** A new wait from the live interval, keeping the time already waited; a wait that was endless (dial at 0) starts fresh. A blink or a pending double blink finishes first. */
  reroll(): void {
    if (this.next === Infinity) this.waited = 0;
    if (this.blinkT < 0 && !this.double) this.next = this.schedule(this.nextBase);
  }

  private schedule(base: Base): number {
    this.nextBase = base;
    if (isAsleep(base)) return Infinity;
    const r = this.tuning.blink.interval[base];
    return uniform(this.rng, r.min, r.max);
  }

  /** Returns eye openness 0..1 (1 = not blinking). */
  update(dt: number, base: Base): number {
    const b = this.tuning.blink;
    const k = base === 'DROWSY' ? b.drowsyScale : 1;
    if (this.blinkT < 0) {
      if (isAsleep(base)) {
        this.waited = 0;
        this.next = Infinity;
        return 1;
      }
      if (this.next === Infinity) this.next = this.schedule(base); // just woke up
      else if (base !== this.nextBase && !this.double) this.next = this.schedule(base); // new base: re-roll, keep `waited`
      this.waited += dt;
      if (this.waited < this.next) return 1;
      this.blinkT = 0;
      this.blinks++;
    }
    this.blinkT += dt;
    const t = this.blinkT;
    if (t >= b.closeMs * k + b.holdMs * k + b.openMs * k) {
      this.blinkT = -1;
      this.waited = 0;
      this.double = !this.double && this.rng() < b.doubleChance;
      this.next = this.double ? b.doubleGapMs : this.schedule(base);
      return 1;
    }
    if (t < b.closeMs * k) return 1 - EASE.in(t / (b.closeMs * k));
    if (t < b.closeMs * k + b.holdMs * k) return 0;
    return EASE.out((t - b.closeMs * k - b.holdMs * k) / (b.openMs * k));
  }
}

/** Small random glances (Vector-style eye darts). Snaps quickly, holds, and eases home while paused. */
export class Darter {
  private rng: Rng;
  private tuning: Tuning;
  private waited = 0;
  private next: number;
  // Unit space (-1..1); range × energy is applied on the way out, so a held glance follows energy.
  private from = { x: 0, y: 0 };
  private to = { x: 0, y: 0 };
  private moveT = 0;

  constructor(rng: Rng, tuning: Tuning) {
    this.rng = rng;
    this.tuning = tuning;
    this.next = uniform(rng, tuning.dart.minMs, tuning.dart.maxMs);
  }

  /** A new wait from the live interval, keeping the time already waited; a wait that was endless (dial at 0) starts fresh. */
  reroll(): void {
    if (this.next === Infinity) this.waited = 0;
    this.next = uniform(this.rng, this.tuning.dart.minMs, this.tuning.dart.maxMs);
  }

  private current(): { x: number; y: number } {
    const k = EASE.out(Math.min(1, this.moveT / this.tuning.dart.moveMs));
    return { x: this.from.x + (this.to.x - this.from.x) * k, y: this.from.y + (this.to.y - this.from.y) * k };
  }

  private moveTo(x: number, y: number): void {
    this.from = this.current();
    this.to = { x, y };
    this.moveT = 0;
  }

  update(dt: number, energy: number, paused: boolean): { x: number; y: number } {
    const d = this.tuning.dart;
    this.moveT += dt;
    if (paused) {
      if (this.to.x !== 0 || this.to.y !== 0) this.moveTo(0, 0);
    } else {
      this.waited += dt;
      if (this.waited >= this.next) {
        this.waited = 0;
        this.next = uniform(this.rng, d.minMs, d.maxMs);
        this.moveTo(uniform(this.rng, -1, 1), uniform(this.rng, -1, 1));
      }
    }
    const u = this.current();
    return { x: u.x * d.rangeX * energy, y: u.y * d.rangeY * energy };
  }
}

/** Mouth openness while speaking: smoothed value noise. ponytail: random, not audio-driven; feed amplitude/visemes later. */
export class Talker {
  private rng: Rng;
  private t = 0;
  private a: number;
  private b: number;

  constructor(rng: Rng) {
    this.rng = rng;
    this.a = rng();
    this.b = rng();
  }

  update(dt: number, hz: number, max: number): number {
    this.t += (dt / 1000) * hz;
    while (this.t >= 1) {
      this.t -= 1;
      this.a = this.b;
      this.b = this.rng();
    }
    const s = this.t * this.t * (3 - 2 * this.t);
    return (this.a + (this.b - this.a) * s) * max;
  }
}

/** Rare random ear twitches. Time only counts while enabled. */
export class Twitcher {
  private rng: Rng;
  private tuning: Tuning;
  private waited = 0;
  private next: number;

  constructor(rng: Rng, tuning: Tuning) {
    this.rng = rng;
    this.tuning = tuning;
    this.next = uniform(rng, tuning.twitch.minMs, tuning.twitch.maxMs);
  }

  /** A new wait from the live interval, keeping the time already waited; a wait that was endless (dial at 0) starts fresh. */
  reroll(): void {
    if (this.next === Infinity) this.waited = 0;
    this.next = uniform(this.rng, this.tuning.twitch.minMs, this.tuning.twitch.maxMs);
  }

  update(dt: number, enabled: boolean): 'L' | 'R' | null {
    if (!enabled) return null;
    this.waited += dt;
    if (this.waited < this.next) return null;
    this.waited = 0;
    this.next = uniform(this.rng, this.tuning.twitch.minMs, this.tuning.twitch.maxMs);
    return this.rng() < 0.5 ? 'L' : 'R';
  }
}
