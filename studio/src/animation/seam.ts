// Pose math for seamless clips (M4 spec §4.3, §4.5): range-scaled distances, blends that take phases the short way
// round, the seam search, and resampling to 60 fps at any speed.
import { PARAMS, PARAM_KEYS, type ParamKey } from 'noxy-src/brain/params.ts';
import type { Pose } from 'noxy-src/brain/pose.ts';

/** The seam blend, in 60 Hz brain steps: 1 s. */
export const BLEND = 60;
/** Values the renderer only uses the fraction of (glyphSpin counts turns), so 0.99 → 0.01 is a small step forward. */
export const PHASES: readonly ParamKey[] = ['zPhase', 'loaderPhase', 'glyphSpin'];
const isPhase = new Set<ParamKey>(PHASES);
/** The short way round a circle of 1: −0.5..0.5. */
export const turn = (d: number): number => d - Math.round(d);
/** 0 → 1 with no speed at either end (3x² − 2x³). */
export const smooth = (x: number): number => x * x * (3 - 2 * x);

/** a → b by w (0 = a, 1 = b); phases go the short way round. */
export function mix(a: Pose, b: Pose, w: number): Pose {
  const p = {} as Pose;
  for (const k of PARAM_KEYS) p[k] = a[k] + (isPhase.has(k) ? turn(b[k] - a[k]) : b[k] - a[k]) * w;
  return p;
}

/** How far apart two poses are: each value's difference as a share of its range (a phase's as a share of a turn), summed. */
export function distance(a: Pose, b: Pose): number {
  let d = 0;
  for (const k of PARAM_KEYS) d += isPhase.has(k) ? Math.abs(turn(b[k] - a[k])) : Math.abs(b[k] - a[k]) / (PARAMS[k].max - PARAMS[k].min);
  return d;
}

/** Whether an eye's openness dips (a blink) in poses [from, from + BLEND). */
export function hasBlink(P: Pose[], from: number): boolean {
  return (['eyeL.open', 'eyeR.open'] as const).some((k) => {
    const v = P.slice(from, from + BLEND).map((p) => p[k]);
    return Math.max(...v) - Math.min(...v) > 0.1;
  });
}

/**
 * The seam of a loop of n poses from t0: its last second eases into the second before t0. The rank is how far apart
 * those two seconds are; a blink in either would show as a half-blink, so it ranks after every clean seam.
 */
export function seamRank(P: Pose[], t0: number, n: number): number {
  let cost = 0;
  for (let i = 0; i < BLEND; i++) cost += distance(P[t0 + n - BLEND + i], P[t0 - BLEND + i]);
  return cost + (hasBlink(P, t0 - BLEND) || hasBlink(P, t0 + n - BLEND) ? 1e9 : 0);
}

/** The best start among the candidates (spec §4.3): blink-free first, then the closest match. */
export function findSeam(P: Pose[], n: number, candidates: number[]): number {
  let best = candidates[0];
  let rank = Infinity;
  for (const t0 of candidates) {
    const r = seamRank(P, t0, n);
    if (r < rank) [best, rank] = [t0, r];
  }
  return best;
}

/** The loop: n poses from t0, the last BLEND easing into the poses just before t0, so the last frame flows into the first. */
export function closeLoop(P: Pose[], t0: number, n: number): Pose[] {
  return Array.from({ length: n }, (_, k) => {
    const j = k - (n - BLEND); // 0..BLEND − 1 inside the blend
    return j < 0 ? P[t0 + k] : mix(P[t0 + k], P[t0 + k - n], smooth((j + 1) / BLEND));
  });
}

/** The loop at 60 fps for a speed (spec §4.5): round(n / speed) frames, each interpolated between steps, wrapping. */
export function resample(F: Pose[], speed: number): Pose[] {
  const n = F.length;
  const N = Math.max(1, Math.round(n / speed));
  return Array.from({ length: N }, (_, i) => {
    const x = (i * n) / N;
    const k = Math.floor(x);
    return mix(F[k], F[(k + 1) % n], x - k);
  });
}
