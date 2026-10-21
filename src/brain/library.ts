import type { Clip, Key } from './clips.ts';
import type { ParamKey } from './params.ts';
import type { PartialPose } from './pose.ts';

export const BASES = ['IDLE', 'FOCUSED', 'BREAK', 'DROWSY', 'SLEEP', 'DEEP_SLEEP'] as const;
export type Base = (typeof BASES)[number];
/** SLEEP and DEEP_SLEEP: blinks stop, activities pause, and events wake Nox first. */
export const isAsleep = (b: Base): b is 'SLEEP' | 'DEEP_SLEEP' => b === 'SLEEP' || b === 'DEEP_SLEEP';
export const ACTIVITIES = ['THINKING', 'LISTENING', 'PROCESSING', 'SPEAKING', 'CONNECTING', 'OFFLINE'] as const;
export type Activity = (typeof ACTIVITIES)[number];
export const EMOTIONS = ['HAPPY', 'CURIOUS', 'CONCERNED', 'EXCITED', 'CONFUSED', 'SAD', 'LOVE', 'AMAZED'] as const;
export type Emotion = (typeof EMOTIONS)[number];
export const EVENTS = ['WAKE', 'ERROR', 'SUCCESS', 'REMINDER', 'NOTIFICATION', 'BOOT', 'ALERT', 'IDEA', 'LAUGH', 'DIZZY'] as const;
export type EventName = (typeof EVENTS)[number];

/** Same value for the left and right eye (or ear): both('eye', { open: 0 }) → { 'eyeL.open': 0, 'eyeR.open': 0 }. */
function both<T>(part: 'eye' | 'ear', props: Record<string, T>): Partial<Record<ParamKey, T>> {
  const out: Partial<Record<ParamKey, T>> = {};
  for (const [k, v] of Object.entries(props)) {
    out[`${part}L.${k}` as ParamKey] = v;
    out[`${part}R.${k}` as ParamKey] = v;
  }
  return out;
}

/** Absolute partial poses (applied with override over neutral). */
export const BASE_PRESETS: Record<Base, PartialPose> = {
  IDLE: {},
  FOCUSED: { ...both('eye', { upperLidY: 0.14, upperLidAngle: 12, lowerLidY: 0.05 }), ...both('ear', { angle: -5 }), lookY: 0.15, mouthCurve: 0.3 },
  BREAK: { ...both('eye', { lowerLidY: 0.12 }), 'earL.angle': 22, 'earR.angle': 18, mouthCurve: 0.8 },
  DROWSY: { ...both('eye', { upperLidY: 0.42, lowerLidY: 0.06 }), ...both('ear', { angle: 22 }), lookY: 0.3, floatY: -3, eyeBrightness: 0.85, mouthCurve: 0.2 },
  SLEEP: {
    ...both('eye', { open: 0.06 }),
    'earL.angle': 55,
    'earR.angle': 50,
    ...both('ear', { scaleY: 0.92 }),
    floatY: -6,
    squash: 0.03,
    tilt: 3,
    eyeBrightness: 0.6,
    lookY: 1,
    mouthCurve: 0.1,
    symZ: 1,
  },
  DEEP_SLEEP: {
    ...both('eye', { open: 0.04 }),
    'earL.angle': 72,
    'earR.angle': 68,
    ...both('ear', { scaleY: 0.88 }),
    floatY: -10,
    squash: 0.05,
    tilt: 4,
    eyeBrightness: 0.35,
    lookY: 1,
    mouthCurve: 0.1,
    symZ: 1,
  },
};

/** Absolute partial poses, applied with override over the base preset. */
export const ACTIVITY_PRESETS: Record<Activity, PartialPose> = {
  THINKING: { 'earL.angle': -12, 'earR.angle': 10 },
  LISTENING: {
    ...both('ear', { angle: -14 }),
    ...both('eye', { scaleX: 1.05, scaleY: 1.06, upperLidY: 0 }),
    squash: -0.03,
    floatY: 3,
  },
  PROCESSING: { ...both('ear', { angle: -4 }) },
  SPEAKING: { mouthAlpha: 1 },
  CONNECTING: { ...both('ear', { angle: -8 }) },
  OFFLINE: { ...both('eye', { upperLidY: 0.4 }), ...both('ear', { angle: 35 }), eyeBrightness: 0.45, floatY: -4, squash: 0.02 },
};

/** Modifiers combined by each param's rule: add → delta, mul → factor, min/max → level. */
export const EMOTION_MODS: Record<Emotion, PartialPose> = {
  HAPPY: {
    ...both('eye', { chevron: 1, scaleX: 1.25, scaleY: 1.1 }),
    ...both('ear', { angle: -6 }),
    mouthCurve: 0.4,
    mouthAlpha: 1,
  },
  CURIOUS: { tilt: 7, 'earL.angle': -15, 'earR.angle': 6, lookX: 0.35, ...both('eye', { scaleX: 1.05, scaleY: 1.05 }) },
  CONCERNED: {
    ...both('eye', { upperLidY: 0.18, upperLidAngle: -14 }),
    'earL.angle': 10,
    'earR.angle': 28,
    tilt: -4,
    mouthCurve: -0.7,
    mouthAlpha: 1,
  },
  EXCITED: {
    ...both('eye', { scaleX: 1.1, scaleY: 1.15 }),
    ...both('ear', { angle: -15, scaleY: 1.06 }),
    floatY: 4,
    mouthCurve: 0.4,
    mouthOpen: 0.35,
    mouthAlpha: 1,
  },
  CONFUSED: { tilt: -8, 'earL.angle': -14, 'earR.angle': 32, lookX: -0.3, lookY: -0.2, 'eyeR.scaleY': 0.85, mouthCurve: -0.5, mouthAlpha: 1, symAsk: 1 },
  SAD: {
    ...both('eye', { upperLidY: 0.25, upperLidAngle: -16 }),
    ...both('ear', { angle: 45 }),
    lookY: 0.35,
    floatY: -4,
    mouthCurve: -1.2,
    mouthAlpha: 1,
    eyeBrightness: 0.85,
  },
  LOVE: { glyphHeart: 1, ...both('ear', { angle: 12 }), tilt: 5, floatY: 2, mouthCurve: 0.4, mouthAlpha: 1 },
  AMAZED: { glyphStar: 1, ...both('ear', { angle: -14, scaleY: 1.06 }), floatY: 3, mouthOpen: 0.4, mouthCurve: -0.6, mouthAlpha: 1 },
};

export const EVENT_META: Record<EventName, { priority: number; interruptible: boolean; emotion?: Emotion }> = {
  WAKE: { priority: 100, interruptible: false },
  ERROR: { priority: 40, interruptible: false, emotion: 'CONCERNED' },
  SUCCESS: { priority: 30, interruptible: false, emotion: 'HAPPY' },
  REMINDER: { priority: 25, interruptible: true, emotion: 'CURIOUS' },
  NOTIFICATION: { priority: 20, interruptible: true, emotion: 'CURIOUS' },
  BOOT: { priority: 100, interruptible: false },
  ALERT: { priority: 45, interruptible: false },
  IDEA: { priority: 25, interruptible: true },
  LAUGH: { priority: 25, interruptible: true, emotion: 'HAPPY' },
  DIZZY: { priority: 25, interruptible: true },
};

export const CLIPS: Record<EventName, Clip> = {
  // Tiny creature waking: ear twitch → both eyes open → stretch → ears up → tiny shake.
  WAKE: {
    name: 'WAKE',
    duration: 1600,
    tracks: {
      ...both('eye', { open: [[0, 0.06], [400, 0.06], [560, 1, 'out']] as Key[] }),
      'earL.angle': [[0, 55], [900, -10, 'out'], [1600, 0]],
      'earR.angle': [[0, 50], [180, 30, 'out'], [320, 50], [900, -10, 'out'], [1600, 0]],
      ...both('ear', { scaleY: [[0, 0.92], [900, 1.08, 'out'], [1600, 1]] as Key[] }),
      squash: [[0, 0.03], [900, -0.14], [1150, 0.05], [1300, 0]],
      floatY: [[0, -6], [900, 6], [1300, 0]],
      tilt: [[0, 3], [1300, 0], [1370, 3], [1440, -3], [1510, 2], [1600, 0]],
      eyeBrightness: [[0, 0.6], [560, 1, 'out']],
    },
  },
  // Quietly proud: anticipation squash → hop with wide eyes and ears up → tiny wiggle.
  SUCCESS: {
    name: 'SUCCESS',
    duration: 1200,
    tracks: {
      squash: [[0, 0], [150, 0.12, 'out'], [300, -0.15, 'out'], [500, 0.08], [650, 0]],
      floatY: [[0, 0], [150, -3], [300, 14, 'out'], [500, 0, 'in']],
      ...both('ear', {
        angle: [[0, 0], [150, 4], [300, -14, 'out'], [1000, -8], [1200, 0]] as Key[],
        scaleY: [[0, 1], [300, 1.08, 'out'], [1000, 1.04], [1200, 1]] as Key[],
      }),
      ...both('eye', {
        scaleX: [[0, 1], [300, 1.12, 'out'], [950, 1.08], [1200, 1]] as Key[],
        scaleY: [[0, 1], [300, 1.15, 'out'], [950, 1.1], [1200, 1]] as Key[],
      }),
      tilt: [[0, 0], [650, 0], [800, -4], [950, 4], [1100, 0]],
      mouthOpen: [[0, 0], [300, 0.35, 'out'], [900, 0.3], [1200, 0]],
      mouthAlpha: [[0, 0], [150, 1, 'out'], [1200, 1]],
    },
  },
  // Brief: eyes widen → recoil → tiny shake → settle. Never loops.
  ERROR: {
    name: 'ERROR',
    duration: 700,
    tracks: {
      ...both('eye', {
        scaleX: [[0, 1], [80, 1.15, 'out'], [500, 1.1], [700, 1]] as Key[],
        scaleY: [[0, 1], [80, 1.18, 'out'], [500, 1.12], [700, 1]] as Key[],
      }),
      ...both('ear', { angle: [[0, 0], [80, -10, 'out'], [180, 22, 'out'], [700, 12]] as Key[] }),
      squash: [[0, 0], [80, -0.05, 'out'], [180, 0.1, 'out'], [330, 0]],
      floatY: [[0, 0], [180, -5, 'out'], [500, 0]],
      tilt: [[0, 0], [180, 0], [250, -3], [320, 3], [390, -2], [460, 0]],
    },
  },
  // Ear twitch → glance up-right toward the notification → small hop → back.
  NOTIFICATION: {
    name: 'NOTIFICATION',
    duration: 900,
    tracks: {
      'earR.angle': [[0, 0], [100, -16, 'out'], [220, 0]],
      lookX: [[0, 0], [200, 0.7, 'out'], [700, 0.7], [900, 0]],
      lookY: [[0, 0], [200, -0.5, 'out'], [700, -0.5], [900, 0]],
      floatY: [[0, 0], [200, 0], [350, 8, 'out'], [500, 0, 'in']],
      squash: [[0, 0], [200, 0], [350, -0.06, 'out'], [500, 0.04], [650, 0]],
    },
  },
  // Attention: eyes widen, ears raise, small hop, short hold.
  REMINDER: {
    name: 'REMINDER',
    duration: 1400,
    tracks: {
      ...both('eye', {
        scaleX: [[0, 1], [120, 1.12, 'out'], [1100, 1.12], [1400, 1]] as Key[],
        scaleY: [[0, 1], [120, 1.15, 'out'], [1100, 1.15], [1400, 1]] as Key[],
      }),
      ...both('ear', {
        angle: [[0, 0], [120, -14, 'out'], [1100, -14], [1400, 0]] as Key[],
        scaleY: [[0, 1], [120, 1.06, 'out'], [1100, 1.06], [1400, 1]] as Key[],
      }),
      floatY: [[0, 0], [300, 10, 'out'], [450, 0, 'in']],
      squash: [[0, 0], [300, -0.08, 'out'], [450, 0.05], [600, 0]],
    },
  },
  // Power on: screen goes dark, accents light, eyes appear as a line, flicker on and open, ears pop up with a hop.
  BOOT: {
    name: 'BOOT',
    duration: 2000,
    tracks: {
      accentGlow: [[0, 0], [300, 0.9, 'out'], [600, 0.2], [1400, 0.8, 'out'], [2000, 0]],
      eyeBrightness: [[0, 1], [120, 0, 'out'], [500, 0], [560, 1.2], [620, 0.3], [700, 1.3], [800, 0.5], [1000, 1]],
      ...both('eye', { open: [[0, 1], [120, 0.04, 'out'], [1000, 0.04], [1250, 1, 'out']] as Key[] }),
      ...both('ear', {
        angle: [[0, 0], [400, 20], [1100, 20], [1400, -12, 'out'], [1700, 0]] as Key[],
        scaleY: [[0, 1], [400, 0.92], [1100, 0.92], [1400, 1.08, 'out'], [1800, 1]] as Key[],
      }),
      floatY: [[0, 0], [400, -6], [1100, -6], [1400, 8, 'out'], [1650, 0, 'in']],
      squash: [[0, 0], [400, 0.03], [1100, 0.03], [1350, -0.1, 'out'], [1550, 0.05], [1750, 0]],
    },
  },
  // Startled: "!" pops above the head, eyes go wide, ears shoot up, a little hop back.
  ALERT: {
    name: 'ALERT',
    duration: 1500,
    tracks: {
      symBang: [[0, 0], [60, 1, 'out'], [1200, 1], [1500, 0]],
      ...both('eye', {
        scaleX: [[0, 1], [80, 1.15, 'out'], [1100, 1.12], [1500, 1]] as Key[],
        scaleY: [[0, 1], [80, 1.2, 'out'], [1100, 1.15], [1500, 1]] as Key[],
      }),
      ...both('ear', { angle: [[0, 0], [70, -25, 'out'], [1100, -18], [1500, 0]] as Key[] }),
      floatY: [[0, 0], [120, 9, 'out'], [300, 0, 'in']],
      squash: [[0, 0], [60, 0.06], [160, -0.08, 'out'], [320, 0]],
      lean: [[0, 0], [120, -6, 'out'], [600, 0]],
      mouthAlpha: [[0, 0], [80, 1], [1200, 1], [1500, 0]],
      mouthOpen: [[0, 0], [80, 0.3, 'out'], [1000, 0.2], [1500, 0]],
      mouthCurve: [[0, 0.6], [80, 0, 'out'], [1200, 0], [1500, 0.6]],
    },
  },
  // Idea: eyes look up, the bulb pops in and flickers on, then a bright-eyed smile.
  IDEA: {
    name: 'IDEA',
    duration: 2200,
    tracks: {
      symBulb: [[0, 0], [150, 1, 'out'], [1900, 1], [2200, 0]],
      bulbLit: [[0, 0], [350, 0], [400, 1], [460, 0.2], [520, 1], [600, 0.4], [700, 1], [1900, 1], [2200, 0]],
      lookY: [[0, 0], [200, -0.55, 'out'], [1500, -0.5], [2000, 0]],
      ...both('eye', {
        scaleX: [[0, 1], [700, 1], [800, 1.12, 'out'], [1900, 1.1], [2200, 1]] as Key[],
        scaleY: [[0, 1], [700, 1], [800, 1.14, 'out'], [1900, 1.12], [2200, 1]] as Key[],
      }),
      eyeBrightness: [[0, 1], [700, 1], [800, 1.3, 'out'], [1900, 1.2], [2200, 1]],
      ...both('ear', { angle: [[0, 0], [150, -16, 'out'], [1800, -10], [2200, 0]] as Key[] }),
      floatY: [[0, 0], [400, 6, 'out'], [1800, 4], [2200, 0]],
      tilt: [[0, 0], [300, -5], [1800, -4], [2200, 0]],
      mouthAlpha: [[0, 0], [700, 0], [850, 1], [1900, 1], [2200, 0]],
      mouthCurve: [[0, 0.6], [850, 1, 'out'], [1900, 1], [2200, 0.6]],
    },
  },
  // Laugh: > < eyes, the mouth chatters open, the body bounces.
  LAUGH: {
    name: 'LAUGH',
    duration: 1600,
    tracks: {
      glyphSqueeze: [[0, 0], [80, 1, 'out'], [1400, 1], [1600, 0]],
      mouthAlpha: [[0, 0], [60, 1], [1400, 1], [1600, 0]],
      mouthOpen: [[0, 0], [100, 0.7], [250, 0.3], [400, 0.75], [550, 0.3], [700, 0.7], [850, 0.3], [1000, 0.6], [1200, 0.2], [1600, 0]],
      mouthCurve: [[0, 0.6], [100, 1], [1400, 1], [1600, 0.6]],
      floatY: [[0, 0], [150, 5], [300, 0], [450, 5], [600, 0], [750, 4], [900, 0], [1050, 3], [1200, 0]],
      squash: [[0, 0], [150, -0.04], [300, 0.04], [450, -0.04], [600, 0.04], [750, -0.03], [900, 0.03], [1200, 0]],
      tilt: [[0, 0], [300, 4], [900, 3], [1600, 0]],
      ...both('ear', { angle: [[0, 0], [150, -10], [300, 0], [450, -10], [600, 0], [750, -8], [900, 0]] as Key[] }),
    },
  },
  // Dizzy: spinning swirl eyes, the head wobbles, the ears flop out of step.
  DIZZY: {
    name: 'DIZZY',
    duration: 2400,
    tracks: {
      glyphSwirl: [[0, 0], [150, 1, 'out'], [2100, 1], [2400, 0]],
      glyphSpin: [[0, 0], [2400, 4, 'linear']],
      tilt: [[0, 0], [300, -8], [700, 8], [1100, -7], [1500, 6], [1900, -4], [2400, 0]],
      yaw: [[0, 0], [400, 0.25], [800, -0.25], [1200, 0.2], [1600, -0.15], [2000, 0.1], [2400, 0]],
      lean: [[0, 0], [300, -6], [700, 6], [1100, -5], [1500, 4], [2400, 0]],
      'earL.angle': [[0, 0], [400, 30], [800, 10], [1200, 30], [2400, 0]],
      'earR.angle': [[0, 0], [400, 10], [800, 30], [1200, 10], [2400, 0]],
      mouthAlpha: [[0, 0], [200, 1], [2100, 1], [2400, 0]],
      mouthCurve: [[0, 0.6], [200, -0.3], [2100, -0.3], [2400, 0.6]],
    },
  },
};

/** Looping clips for activities that move. LISTENING is a static preset only. */
export const ACTIVITY_LOOPS: Partial<Record<Activity, Clip>> = {
  // Eyes left → tilt → pause → eyes right → tilt → pause → center.
  THINKING: {
    name: 'THINKING',
    duration: 4000,
    loop: true,
    tracks: {
      lookX: [[0, 0], [400, -0.6], [1600, -0.6], [2000, 0.6], [3200, 0.6], [3600, 0], [4000, 0]],
      lookY: [[0, 0], [400, -0.25], [3200, -0.25], [3600, 0], [4000, 0]],
      tilt: [[0, 0], [800, -4], [1600, -4], [2300, 4], [3200, 4], [3700, 0], [4000, 0]],
    },
  },
  // Eyes shrink into dots, a middle dot pops in, and the three bounce in a wave; eyes and accents pulse.
  PROCESSING: {
    name: 'PROCESSING',
    duration: 1600,
    loop: true,
    tracks: {
      loader: [[0, 1], [1600, 1]],
      loaderPhase: [[0, 0], [1600, 1, 'linear']],
      eyeBrightness: [[0, 0.9], [800, 1.25], [1600, 0.9]],
      accentGlow: [[0, 0], [800, 0.6], [1600, 0]],
      floatY: [[0, 0], [800, 1.5], [1600, 0]],
    },
  },
  // Slight squint rhythm + subtle head movement (the mouth is driven procedurally).
  SPEAKING: {
    name: 'SPEAKING',
    duration: 2400,
    loop: true,
    tracks: {
      ...both('eye', { upperLidY: [[0, 0], [300, 0.12], [700, 0], [1500, 0.08], [1900, 0], [2400, 0]] as Key[] }),
      tilt: [[0, 0], [600, 1.5], [1400, -1], [2400, 0]],
    },
  },
  // Dashed rings turn while the ears scan for a signal.
  CONNECTING: {
    name: 'CONNECTING',
    duration: 1600,
    loop: true,
    tracks: {
      glyphRing: [[0, 1], [1600, 1]],
      glyphSpin: [[0, 0], [1600, 1, 'linear']],
      'earL.angle': [[0, -8], [800, 4], [1600, -8]],
      'earR.angle': [[0, 4], [800, -8], [1600, 4]],
      accentGlow: [[0, 0], [800, 0.4], [1600, 0]],
    },
  },
  // About every 6 s the offline Nox glances up, as if looking for the signal.
  OFFLINE: {
    name: 'OFFLINE',
    duration: 6000,
    loop: true,
    tracks: {
      lookY: [[0, 0.2], [3800, 0.2], [4100, -0.35], [5200, -0.35], [5600, 0.2], [6000, 0.2]],
      lookX: [[0, 0], [4100, 0], [4400, 0.25], [5000, -0.25], [5600, 0], [6000, 0]],
      ...both('eye', { upperLidY: [[0, 0.4], [3800, 0.4], [4100, 0.2], [5200, 0.2], [5600, 0.4], [6000, 0.4]] as Key[] }),
    },
  },
};

/** Looping clips for bases that move on their own. An activity loop replaces it while one plays. */
export const BASE_LOOPS: Partial<Record<Base, Clip>> = {
  // Nodding off: the head sinks and the lids drop, then a quick catch with the ears up.
  DROWSY: {
    name: 'DROWSY',
    duration: 8000,
    loop: true,
    tracks: {
      ...both('eye', { upperLidY: [[0, 0.42], [5000, 0.42], [6200, 0.8, 'in'], [6700, 0.8], [6850, 0.15, 'out'], [7400, 0.42], [8000, 0.42]] as Key[] }),
      floatY: [[0, -3], [5000, -3], [6200, -9, 'in'], [6700, -9], [6850, -1, 'out'], [7400, -3], [8000, -3]],
      tilt: [[0, 0], [5000, 0], [6200, 5, 'in'], [6700, 5], [6850, 0, 'out'], [8000, 0]],
      lookY: [[0, 0.3], [5000, 0.3], [6200, 0.6, 'in'], [6700, 0.6], [6850, 0, 'out'], [7400, 0.3], [8000, 0.3]],
      ...both('ear', { angle: [[0, 22], [5000, 22], [6200, 35, 'in'], [6700, 35], [6850, 0, 'out'], [7600, 22], [8000, 22]] as Key[] }),
    },
  },
};
