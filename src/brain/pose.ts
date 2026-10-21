import { PARAMS, PARAM_KEYS, type ParamKey } from './params.ts';

export type Pose = Record<ParamKey, number>;
export type PartialPose = Partial<Pose>;

export function neutralPose(): Pose {
  const p = {} as Pose;
  for (const k of PARAM_KEYS) p[k] = PARAMS[k].def;
  return p;
}

/** Mutates `pose`: applies each key of `partial` with that param's rule (add / mul / min / max). */
export function combine(pose: Pose, partial: PartialPose): Pose {
  for (const k in partial) {
    const key = k as ParamKey;
    const b = partial[key];
    if (b === undefined) continue;
    const a = pose[key];
    switch (PARAMS[key].rule) {
      case 'add': pose[key] = a + b; break;
      case 'mul': pose[key] = a * b; break;
      case 'min': pose[key] = Math.min(a, b); break;
      case 'max': pose[key] = Math.max(a, b); break;
    }
  }
  return pose;
}

/** Mutates `pose`: moves each key of `partial` toward its value by `weight` (1 = replace). */
export function override(pose: Pose, partial: PartialPose, weight = 1): Pose {
  for (const k in partial) {
    const key = k as ParamKey;
    const b = partial[key];
    if (b === undefined) continue;
    pose[key] += (b - pose[key]) * weight;
  }
  return pose;
}

/** Mutates `pose`: clamps every param to its range. */
export function clampPose(pose: Pose): Pose {
  for (const k of PARAM_KEYS) pose[k] = Math.min(PARAMS[k].max, Math.max(PARAMS[k].min, pose[k]));
  return pose;
}
