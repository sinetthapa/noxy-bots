// Personality: 8 dials over DEFAULT_TUNING (M3 spec §4.1). 1 is today's Nox, 0 turns a trait off, and snap never freezes.
import { DEFAULT_TUNING, type Tuning } from './tuning.ts';

export const DIALS = ['energy', 'bounce', 'squish', 'blink', 'glance', 'wiggle', 'head', 'snap'] as const;
export type DialName = (typeof DIALS)[number];
export type Dials = Record<DialName, number>;
export type Personality = 'default' | 'chill' | 'curious' | 'bouncy' | 'shy';

const preset = (energy: number, bounce: number, squish: number, blink: number, glance: number, wiggle: number, head: number, snap: number): Readonly<Dials> =>
  Object.freeze({ energy, bounce, squish, blink, glance, wiggle, head, snap });

/** Starting values; the user tunes them in the studio before M3 merges (spec Q21). */
export const PERSONALITIES: Readonly<Record<Personality, Readonly<Dials>>> = Object.freeze({
  default: preset(1, 1, 1, 1, 1, 1, 1, 1),
  chill: preset(0.7, 0.8, 0.8, 0.7, 0.6, 0.7, 0.8, 0.6),
  curious: preset(1.1, 1, 1, 1.2, 1.6, 1.3, 1.4, 1.2),
  bouncy: preset(1.4, 1.8, 1.6, 1.1, 1.2, 1.5, 1.1, 1.4),
  shy: preset(0.8, 0.7, 0.9, 1.4, 1.3, 0.6, 0.6, 0.9),
});

/** By own key: "constructor" or "__proto__" from a URL or an attribute is not a personality. */
export const isPersonality = (v: unknown): v is Personality => typeof v === 'string' && Object.hasOwn(PERSONALITIES, v);

/** An interval at `d` times the rate; 0 means never (uniform() keeps [Infinity, Infinity] at Infinity). */
const every = (ms: number, d: number) => (d === 0 ? Infinity : ms / d);

export function tuningFor(d: Dials): Tuning {
  const D = DEFAULT_TUNING;
  const t = structuredClone(D);
  for (const b of Object.keys(t.energy) as (keyof Tuning['energy'])[]) t.energy[b] = D.energy[b] * d.energy;
  t.breathe.floatAmp = D.breathe.floatAmp * d.bounce;
  t.breathe.squashAmp = D.breathe.squashAmp * d.squish;
  for (const b of Object.keys(t.blink.interval) as (keyof Tuning['blink']['interval'])[]) {
    const r = D.blink.interval[b];
    t.blink.interval[b] = { min: every(r.min, d.blink), max: every(r.max, d.blink) };
  }
  t.dart.minMs = every(D.dart.minMs, d.glance);
  t.dart.maxMs = every(D.dart.maxMs, d.glance);
  t.dart.rangeX = D.dart.rangeX * (0.5 + d.glance / 2);
  t.dart.rangeY = D.dart.rangeY * (0.5 + d.glance / 2);
  t.springs.ear.z = Math.min(1, D.springs.ear.z / d.wiggle); // z / 0 = Infinity → 1: no wobble
  t.springs.earInertia = D.springs.earInertia * d.wiggle;
  t.twitch.minMs = every(D.twitch.minMs, d.wiggle);
  t.twitch.maxMs = every(D.twitch.maxMs, d.wiggle);
  t.springs.headFollow = D.springs.headFollow * d.head;
  t.springs.headTilt = D.springs.headTilt * d.head;
  t.breathe.tiltAmp = D.breathe.tiltAmp * d.head;
  t.breathe.yawAmp = D.breathe.yawAmp * d.head;
  const s = 2 ** (d.snap - 1); // 0 → half speed, 2 → double; never 0
  t.springs.transition.f = D.springs.transition.f * s;
  for (const k of Object.keys(t.fades) as (keyof Tuning['fades'])[]) t.fades[k] = D.fades[k] / s;
  return t;
}
