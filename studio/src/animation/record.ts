// The recorder (M4 spec §4): studio settings → the 60 fps poses of one seamless loop or one event clip. It drives a
// brain exactly like createBot does, without a screen; the MP4 (and PR 2's Lottie) draw from the same poses.
import { ACTIVITY_LOOPS, BASE_LOOPS, type Activity, type Base, type EventName as BrainEvent } from 'noxy-src/brain/library.ts';
import { createNox, STEP } from 'noxy-src/brain/nox.ts';
import { tuningFor, type Dials } from 'noxy-src/brain/personality.ts';
import type { Pose } from 'noxy-src/brain/pose.ts';
import { commands, NAMES, type EventName, type StateName } from 'noxy-src/commands.ts';
import { BLEND, closeLoop, findSeam, resample, seamRank } from './seam.ts';

export interface ClipSpec {
  dials: Dials;
  speed: number;
  seed: number;
  /** The board's state: a base, activity or emotion. */
  state: StateName;
  /** null = a loop of the state; else this event on top of it. */
  event: EventName | null;
  /** Held for the whole clip; null = free eyes (spec §4.1, Q9). */
  gaze: { x: number; y: number } | null;
}

export const WARM = 180; // 3 s, like createBot's settle
const LOOP = 480; // about 8 s (Q11)
const SEARCH = 6; // seam candidates every 100 ms
const LEAD = 30; // 0.5 s of rest before an event (Q13)
const MAX_SETTLE = 240; // an event clip stops at most 4 s after the event ends
const ZZZ_MS = 3600;

const brainName = (name: string) => name.toUpperCase().replaceAll('-', '_');

/** The state's own cycle in steps (its loop clip), or 0 when it has none. */
export function cycleSteps(state: StateName): number {
  const n = brainName(state);
  const clip = ACTIVITY_LOOPS[n as Activity] ?? BASE_LOOPS[n as Base];
  return clip ? Math.round(clip.duration / STEP) : 0;
}

/** Spec §4.2: the multiple of the state's cycle closest to 8 s, else 8 s. In steps. */
export function loopSteps(state: StateName): number {
  const c = cycleSteps(state);
  return c ? c * Math.max(1, Math.round(LOOP / c)) : LOOP;
}

/** A brain set up like createBot({ state }) with the studio's dials and gaze; full motion is createNox's default. */
function setUp(spec: ClipSpec) {
  const brain = createNox({ seed: spec.seed, tuning: tuningFor(spec.dials) });
  const c = commands(brain);
  if (!(NAMES.base as readonly string[]).includes(spec.state)) c.state('idle'); // like the studio's showState
  c.state(spec.state);
  if (spec.gaze) brain.setGaze(spec.gaze.x, spec.gaze.y);
  return { brain, c, step: (): Pose => brain.tick(STEP) };
}

/**
 * Spec §4.1: the Zzz drift on a period that divides the loop, so it repeats exactly. zPhase is (clock / period) % 1 and
 * nothing else reads the period, so it's recomputed from the step count. `first` = the brain step that made P[0].
 */
function fixZzz(P: Pose[], first: number, n: number): void {
  const L = n * STEP;
  const period = L / Math.max(1, Math.round(L / ZZZ_MS));
  P.forEach((p, i) => (p.zPhase = (((first + i) * STEP) / period) % 1));
}

/** Lets the browser paint and Cancel run; throws if the export was cancelled. */
export async function pause(signal?: AbortSignal): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  signal?.throwIfAborted();
}

/** A loop's raw poses after warm-up: a blend second before the first candidate start, then two loop lengths. */
export function takeLoop(spec: ClipSpec, n: number): Pose[] {
  const { step } = setUp(spec);
  for (let i = 0; i < WARM; i++) step();
  const P = Array.from({ length: BLEND + 2 * n }, step);
  fixZzz(P, WARM + 1, n);
  return P;
}

/**
 * One take of an event clip after `warm` steps (spec §4.4): a blend second of rest, the 0.5 s lead-in, the event, then
 * rest until the bot has settled. n is the clip (lead-in to settled) plus a blend second, rounded up to the state's cycle,
 * or to 100 ms. poses[BLEND] is the clip's first frame. `played` says the event really ran.
 */
export function takeEvent(spec: ClipSpec & { event: EventName }, warm: number): { poses: Pose[]; n: number; played: boolean } {
  const { brain, c, step } = setUp(spec);
  for (let i = 0; i < warm - BLEND; i++) step();
  const P = Array.from({ length: BLEND + LEAD }, step);
  const r = brain.resolver;
  const base = r.base;
  const t = brain.tuning;
  // After the clip fades, the face eases back on the transition springs and the head spring: one period of the slower.
  const settle = Math.ceil((t.fades.eventOut + 1000 / Math.min(t.springs.transition.f, t.springs.head.f)) / STEP);
  const name = brainName(spec.event) as BrainEvent;
  c.play(spec.event);
  let played = false;
  let ended = -1;
  let rested = -1;
  for (let k = LEAD; ; k++) {
    P.push(step());
    played ||= r.playing?.name === name;
    if (ended < 0 && !r.busy) ended = k;
    // Rest: nothing playing or queued, the event's emotion gone, awake hold over (asleep again, if it was).
    if (rested < 0 && !r.busy && r.emotion === r.sticky && !r.awakeHold && r.base === base) rested = k;
    if ((rested >= 0 && k >= rested + settle) || (ended >= 0 && k >= ended + MAX_SETTLE)) break;
  }
  const unit = cycleSteps(spec.state) || SEARCH;
  const clip = P.length - BLEND; // lead-in to settled
  const n = Math.ceil((clip + BLEND) / unit) * unit; // plus a blend second
  while (P.length < BLEND + n) P.push(step());
  fixZzz(P, warm - BLEND + 1, n);
  return { poses: P, n, played };
}

/** The clip's frames at 60 fps (spec §4): a seamless loop of the state, or the event clip, at the spec's speed. */
export async function record(spec: ClipSpec, signal?: AbortSignal): Promise<Pose[]> {
  const { event } = spec;
  if (event === null) {
    const n = loopSteps(spec.state);
    const P = takeLoop(spec, n);
    await pause(signal);
    const starts = Array.from({ length: Math.floor(n / SEARCH) }, (_, i) => BLEND + i * SEARCH);
    return resample(closeLoop(P, findSeam(P, n, starts), n), spec.speed);
  }
  // The seam sits in the rest before the lead-in, so the start is chosen by trying warm-ups of 3–5 s (spec §4.4).
  let best: { poses: Pose[]; n: number } | undefined;
  let rank = Infinity;
  for (let warm = WARM; warm <= WARM + 120; warm += SEARCH) {
    const take = takeEvent({ ...spec, event }, warm);
    const r = seamRank(take.poses, BLEND, take.n);
    if (r < rank) [best, rank] = [take, r];
    await pause(signal);
  }
  return resample(closeLoop(best!.poses, BLEND, best!.n), spec.speed);
}
