import { describe, it, expect } from 'vitest';
import { PARAMS, PARAM_KEYS, type ParamKey } from './params.ts';
import {
  ACTIVITY_LOOPS, ACTIVITY_PRESETS, BASE_LOOPS, BASE_PRESETS, CLIPS, EMOTION_MODS, EVENT_META, EVENTS,
} from './library.ts';
import type { Clip } from './clips.ts';

const loops = [...Object.values(ACTIVITY_LOOPS), ...Object.values(BASE_LOOPS)] as Clip[];
const allClips: Clip[] = [...Object.values(CLIPS), ...loops];

describe('library', () => {
  it('only uses real param keys (both() builds keys from strings)', () => {
    const partials = [
      ...Object.values(BASE_PRESETS), ...Object.values(ACTIVITY_PRESETS), ...Object.values(EMOTION_MODS),
      ...allClips.map((c) => c.tracks),
    ];
    for (const partial of partials) for (const k of Object.keys(partial)) expect(PARAM_KEYS).toContain(k);
  });

  it('absolute presets stay inside param ranges', () => {
    for (const preset of [...Object.values(BASE_PRESETS), ...Object.values(ACTIVITY_PRESETS)]) {
      for (const [k, v] of Object.entries(preset)) {
        expect(v).toBeGreaterThanOrEqual(PARAMS[k as ParamKey].min);
        expect(v).toBeLessThanOrEqual(PARAMS[k as ParamKey].max);
      }
    }
  });

  it('clip keys are time-ordered and inside the clip', () => {
    for (const clip of allClips) {
      for (const keys of Object.values(clip.tracks)) {
        for (let i = 1; i < keys!.length; i++) expect(keys![i][0]).toBeGreaterThan(keys![i - 1][0]);
        expect(keys![keys!.length - 1][0]).toBeLessThanOrEqual(clip.duration);
      }
    }
  });

  it('activity and base loops are seamless', () => {
    for (const clip of loops) {
      for (const [k, keys] of Object.entries(clip.tracks)) {
        expect(keys![0][0]).toBe(0);
        expect(keys![keys!.length - 1][0]).toBe(clip.duration);
        // Phase ramps (loaderPhase, glyphSpin) wrap: the renderer takes the fraction, so they are exempt.
        if (!['loaderPhase', 'glyphSpin'].includes(k)) expect(keys![keys!.length - 1][1]).toBe(keys![0][1]);
      }
    }
  });

  it('WAKE starts exactly at the SLEEP pose, so it never pops', () => {
    for (const [k, keys] of Object.entries(CLIPS.WAKE.tracks)) {
      const sleep = BASE_PRESETS.SLEEP[k as ParamKey];
      if (sleep !== undefined) expect(keys![0][1]).toBe(sleep);
    }
  });

  it('the DROWSY loop starts at the DROWSY pose, so it never pops', () => {
    for (const [k, keys] of Object.entries(BASE_LOOPS.DROWSY!.tracks)) {
      expect(keys![0][1]).toBe(BASE_PRESETS.DROWSY[k as ParamKey] ?? PARAMS[k as ParamKey].def);
    }
  });

  it('every event has a clip and metadata', () => {
    for (const e of EVENTS) {
      expect(CLIPS[e].duration).toBeGreaterThan(0);
      expect(EVENT_META[e].priority).toBeGreaterThan(0);
    }
  });
});
