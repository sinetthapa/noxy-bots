import { sampleClip, type Clip } from './clips.ts';
import {
  ACTIVITY_LOOPS, ACTIVITY_PRESETS, BASE_LOOPS, BASE_PRESETS, CLIPS, EMOTION_MODS, EVENTS,
  type Activity, type Base, type Emotion, type EventName,
} from './library.ts';
import { PARAMS, PARAM_KEYS, type ParamKey } from './params.ts';
import { clampPose, combine, neutralPose, override, type Pose } from './pose.ts';
import { Blinker, Darter, Talker, Twitcher, breathe } from './procedural.ts';
import { Resolver } from './resolver.ts';
import { mulberry32 } from './rng.ts';
import { Spring } from './spring.ts';
import { DEFAULT_TUNING, type Tuning } from './tuning.ts';

/** Fixed simulation step (ms). tick() runs whole steps, so results don't depend on frame rate. */
export const STEP = 1000 / 60;
const MAX_FRAME = 250;
const EAR_KEYS = ['earL.angle', 'earR.angle', 'earL.scaleY', 'earR.scaleY'] as const;
const BODY = ['floatY', 'squash', 'tilt', 'lean', 'yaw'] as const;

export type Motion = keyof Tuning['motion'];

interface ClipLayer {
  clip: Clip;
  t: number;
  weight: number;
  fadeIn: number;
  fadeOut: number;
  ending: boolean;
}

export interface NoxOptions {
  seed?: number;
  tuning?: Tuning;
}

/** Writes every value of `from` into `to`, keeping `to`'s objects: springs and schedulers hold references into the live tuning. */
function copyInto(to: Record<string, unknown>, from: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(from)) {
    if (typeof v === 'object' && v !== null) copyInto(to[k] as Record<string, unknown>, v as Record<string, unknown>);
    else to[k] = v;
  }
}

export function createNox(opts: NoxOptions = {}) {
  const tuning = opts.tuning ?? structuredClone(DEFAULT_TUNING);
  const rng = mulberry32(opts.seed ?? 1);
  const durations = Object.fromEntries(EVENTS.map((e) => [e, CLIPS[e].duration])) as Record<EventName, number>;
  const resolver = new Resolver(durations, tuning);
  const springs = Object.fromEntries(PARAM_KEYS.map((k) => [k, new Spring(PARAMS[k].def)])) as Record<ParamKey, Spring>;
  const earSprings = Object.fromEntries(EAR_KEYS.map((k) => [k, new Spring(PARAMS[k].def)])) as Record<
    (typeof EAR_KEYS)[number],
    Spring
  >;
  const blinker = new Blinker(rng, tuning, 'IDLE');
  const darter = new Darter(rng, tuning);
  const talker = new Talker(rng);
  const talkerW = new Talker(mulberry32((opts.seed ?? 1) + 7));
  const twitcher = new Twitcher(rng, tuning);
  const head = new Spring(0);
  // Energy and breath depth ease with the pose on a base change, so the breath doesn't step.
  const energySpring = new Spring(tuning.energy[resolver.effectiveBase]);
  const depthSpring = new Spring(tuning.breath.depth[resolver.effectiveBase]);

  let pose = neutralPose();
  let clock = 0;
  let breathClock = 0;
  let pending = false;
  let motion: Motion = 'full';
  let acc = 0;
  let lastFloatY = 0;
  let lastPlayId = 0;
  let gaze: { x: number; y: number } | null = null;
  let activityLayers: ClipLayer[] = [];
  let eventLayers: ClipLayer[] = [];

  const layer = (clip: Clip, fadeIn: number, fadeOut: number): ClipLayer => ({
    clip, t: 0, weight: 0, fadeIn, fadeOut, ending: false,
  });

  /** Impulse into the ear's secondary spring (deg/s); negative flicks the ear up. */
  function kick(side: 'L' | 'R', scale: number): void {
    earSprings[`ear${side}.angle` as const].yd += tuning.twitch.impulse * scale;
  }

  function targetPose(): Pose {
    const p = neutralPose();
    override(p, BASE_PRESETS[resolver.effectiveBase]);
    const act = resolver.effectiveActivity;
    if (act) override(p, ACTIVITY_PRESETS[act]);
    const emo = resolver.emotion;
    if (emo) combine(p, EMOTION_MODS[emo]);
    // A held gaze replaces the look direction of the presets and emotion; the transition springs smooth it.
    if (gaze) {
      p.lookX = gaze.x;
      p.lookY = gaze.y;
    }
    if (pending) p.badge = 1;
    return p;
  }

  /** Advances clip layers, blends them onto p by fade weight, and drops fully faded ones. */
  function applyLayers(layers: ClipLayer[], p: Pose, dt: number): ClipLayer[] {
    for (const l of layers) {
      l.t += dt;
      if (!l.clip.loop && l.t >= l.clip.duration) l.ending = true;
      l.weight = l.ending ? Math.max(0, l.weight - dt / l.fadeOut) : Math.min(1, l.weight + dt / l.fadeIn);
      override(p, sampleClip(l.clip, l.t), l.weight);
    }
    return layers.filter((l) => !(l.ending && l.weight === 0));
  }

  function step(dt: number): void {
    clock += dt;
    resolver.update(dt);

    // Event layers follow the resolver: a new play id starts a layer; older live layers fade out.
    const playing = resolver.playing;
    if (playing && playing.id !== lastPlayId) {
      lastPlayId = playing.id;
      for (const l of eventLayers) {
        if (!l.ending) {
          l.ending = true;
          // A layer at its natural end this step (queued hand-off) keeps eventOut; only a real interrupt is quicker.
          if (l.t + dt < l.clip.duration) l.fadeOut = tuning.fades.interruptOut;
        }
      }
      eventLayers.push(layer(CLIPS[playing.name], tuning.fades.eventIn, tuning.fades.eventOut));
    }

    // The loop layer follows the effective activity, else the base's own loop.
    const act = resolver.effectiveActivity;
    const loop = (act && ACTIVITY_LOOPS[act]) || BASE_LOOPS[resolver.effectiveBase] || null;
    const live = activityLayers.find((l) => !l.ending);
    if ((live?.clip ?? null) !== loop) {
      if (live) live.ending = true;
      if (loop) activityLayers.push(layer(loop, tuning.fades.activity, tuning.fades.activity));
    }

    // 1–2. Target pose (base → activity → emotion), smoothed by transition springs.
    const target = targetPose();
    const p = neutralPose();
    for (const k of PARAM_KEYS) p[k] = springs[k].step(target[k], dt / 1000, tuning.springs.transition);

    const settled = BODY.map((k) => p[k]);

    // 3–4. Clips override: activity loops under event clips.
    activityLayers = applyLayers(activityLayers, p, dt);
    eventLayers = applyLayers(eventLayers, p, dt);
    const eventActive = eventLayers.length > 0;
    // Motion modes scale what clips add to the body; faces, ears and symbols play in full.
    const m = tuning.motion[motion];
    BODY.forEach((k, i) => (p[k] = settled[i] + (p[k] - settled[i]) * m));

    // 5. Procedural layers, scaled by the base's energy and the motion mode.
    const base = resolver.effectiveBase;
    const energy = energySpring.step(tuning.energy[base], dt / 1000, tuning.springs.transition) * m;
    const depth = depthSpring.step(tuning.breath.depth[base], dt / 1000, tuning.springs.transition);
    breathClock += dt * tuning.breath.rate[base];
    const br = breathe(breathClock, energy, tuning.breathe);
    p.squash += br.squash * depth;
    p.floatY += br.floatY;
    p.tilt += br.tilt;
    p.yaw += br.yaw;
    const open = blinker.update(dt, base);
    p['eyeL.open'] = Math.min(p['eyeL.open'], open);
    p['eyeR.open'] = Math.min(p['eyeR.open'], open);
    const dart = darter.update(dt, energy, eventActive);
    const ds = gaze ? tuning.gaze.dartScale : 1;
    p.lookX += dart.x * ds;
    p.lookY += dart.y * ds;
    // The head turns after the eyes (eyes lead, head follows) for a 2.5D look-around.
    const h = head.step(p.lookX, dt / 1000, tuning.springs.head);
    p.yaw += h * tuning.springs.headFollow * m;
    p.tilt += h * tuning.springs.headTilt * m;
    // The talker follows the SPEAKING loop layers' fade, so the mouth eases shut when SPEAKING ends. Summed: a re-select
    // mid-fade cross-fades two SPEAKING layers, and their weights add up to the level it was re-selected at.
    const w = Math.min(1, activityLayers.reduce((sum, l) => sum + (l.clip === ACTIVITY_LOOPS.SPEAKING ? l.weight : 0), 0));
    if (w > 0) {
      p.mouthOpen = Math.max(p.mouthOpen, talker.update(dt, tuning.talk.hz, tuning.talk.max) * w);
      p.mouthWidth *= 1 + tuning.talk.widthAmp * (talkerW.update(dt, tuning.talk.hz * 0.7, 1) - 0.5) * w;
    }
    const side = twitcher.update(dt, m > 0 && !eventActive && (base === 'IDLE' || base === 'BREAK'));
    if (side) kick(side, energy);
    // Zzz drift phase, and a slow accent pulse that fades with the notification badge.
    p.zPhase = (clock / tuning.zzz.periodMs) % 1;
    p.accentGlow = Math.max(p.accentGlow, tuning.badge.pulse * p.badge * (0.5 - 0.5 * Math.cos((2 * Math.PI * clock) / tuning.badge.pulsePeriod)));

    // 6. Secondary ear springs: follow-through on everything above, plus lag from vertical body motion.
    const floatVel = (p.floatY - lastFloatY) / (dt / 1000);
    lastFloatY = p.floatY;
    for (const k of EAR_KEYS) {
      const lag = k.endsWith('angle') ? tuning.springs.earInertia * floatVel : 0;
      p[k] = earSprings[k].step(p[k] + lag, dt / 1000, tuning.springs.ear);
    }

    pose = clampPose(p);
  }

  return {
    tuning,
    resolver,
    setBase: (b: Base) => resolver.setBase(b),
    setActivity: (a: Activity | null) => resolver.setActivity(a),
    setEmotion: (e: Emotion | null, holdMs?: number) => resolver.setEmotion(e, holdMs),
    trigger: (e: EventName) => resolver.trigger(e),
    twitch: (side: 'L' | 'R') => kick(side, 1),
    /**
     * Takes a new tuning (M3 spec §4.1): energy and breath depth ease through their springs, amplitudes step at once,
     * and only the waits whose intervals changed are re-rolled. Returns the re-rolled schedulers.
     */
    retune(next: Tuning): ('blink' | 'dart' | 'twitch')[] {
      const changed: ('blink' | 'dart' | 'twitch')[] = [];
      // JSON turns Infinity into null on both sides, so "never" still compares equal to "never".
      if (JSON.stringify(next.blink.interval) !== JSON.stringify(tuning.blink.interval)) changed.push('blink');
      if (next.dart.minMs !== tuning.dart.minMs || next.dart.maxMs !== tuning.dart.maxMs) changed.push('dart');
      if (next.twitch.minMs !== tuning.twitch.minMs || next.twitch.maxMs !== tuning.twitch.maxMs) changed.push('twitch');
      copyInto(tuning as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>);
      if (changed.includes('blink')) blinker.reroll();
      if (changed.includes('dart')) darter.reroll();
      if (changed.includes('twitch')) twitcher.reroll();
      return changed;
    },
    /** Holds the eyes on a point (−1..1, +x right, −y up; clamped); the head follows as usual. null releases it. */
    setGaze(x: number | null, y = 0): void {
      const c = (v: number) => Math.min(1, Math.max(-1, v));
      gaze = x === null ? null : { x: c(x), y: c(y) };
    },
    /** Plays NOTIFICATION and keeps the badge up until seen(). */
    notify(): void {
      pending = true;
      resolver.trigger('NOTIFICATION');
    },
    seen(): void {
      pending = false;
    },
    get notifying(): boolean {
      return pending;
    },
    setMotion(m: Motion): void {
      motion = m;
    },
    get motion(): Motion {
      return motion;
    },
    /** Advance by a real frame delta (ms). Runs fixed STEPs; a gap over 250 ms (hidden tab) is capped. */
    tick(dtMs: number): Pose {
      acc += Math.min(Math.max(dtMs || 0, 0), MAX_FRAME);
      while (acc >= STEP - 1e-6) {
        step(STEP);
        acc -= STEP;
      }
      return pose;
    },
    get pose(): Pose {
      return pose;
    },
  };
}

export type Nox = ReturnType<typeof createNox>;
