import type { ParamKey } from './params.ts';
import type { PartialPose } from './pose.ts';

export type Ease = 'linear' | 'in' | 'out' | 'inOut' | 'outBack';
/** [time ms, value, ease of the segment that ends at this key (default inOut)] */
export type Key = [t: number, value: number, ease?: Ease];

/** Absolute values per param over time. Applied with override() and a fade weight. */
export interface Clip {
  name: string;
  duration: number;
  loop?: boolean;
  tracks: Partial<Record<ParamKey, Key[]>>;
}

export const EASE: Record<Ease, (x: number) => number> = {
  linear: (x) => x,
  in: (x) => x * x * x,
  out: (x) => 1 - (1 - x) ** 3,
  inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),
  outBack: (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2,
};

export function sampleTrack(keys: Key[], t: number): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, ease = 'inOut'] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      return v0 + (v1 - v0) * EASE[ease]((t - t0) / (t1 - t0));
    }
  }
  return keys[keys.length - 1][1];
}

export function sampleClip(clip: Clip, tMs: number): PartialPose {
  const t = clip.loop ? tMs % clip.duration : Math.min(tMs, clip.duration);
  const out: PartialPose = {};
  for (const k in clip.tracks) {
    const key = k as ParamKey;
    out[key] = sampleTrack(clip.tracks[key]!, t);
  }
  return out;
}
