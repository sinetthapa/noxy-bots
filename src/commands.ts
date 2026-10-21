// The public names (M2 spec §5.1), the input checks (§11) and the Bot's rules over the brain's four layers (§5.3).
import {
  ACTIVITIES, BASES, EMOTIONS, EVENTS, isAsleep,
  type Activity, type Base, type Emotion, type EventName as BrainEvent,
} from './brain/library.ts';
import type { Nox } from './brain/nox.ts';

type Kebab<S extends string> = S extends `${infer A}_${infer B}` ? `${Lowercase<A>}-${Kebab<B>}` : Lowercase<S>;
export type BaseName = Kebab<Base>;
export type ActivityName = Kebab<Activity>;
export type EmotionName = Kebab<Emotion>;
export type EventName = Kebab<Exclude<BrainEvent, 'WAKE'>>;
export type StateName = BaseName | ActivityName | EmotionName | EventName;

const kebab = <S extends string>(s: S) => s.toLowerCase().replaceAll('_', '-') as Kebab<S>;

/** Every public name by layer. `wake` is left out: base changes play it, and playing it while awake looks like a glitch. */
export const NAMES: {
  readonly base: readonly BaseName[];
  readonly activity: readonly ActivityName[];
  readonly emotion: readonly EmotionName[];
  readonly event: readonly EventName[];
} = Object.freeze({
  base: Object.freeze(BASES.map(kebab)),
  activity: Object.freeze(ACTIVITIES.map(kebab)),
  emotion: Object.freeze(EMOTIONS.map(kebab)),
  event: Object.freeze(EVENTS.filter((e) => e !== 'WAKE').map(kebab) as EventName[]),
});
type Layer = keyof typeof NAMES;
const LAYERS = Object.keys(NAMES) as Layer[];
/** Public name → brain name, one row per name. */
const BRAIN: Readonly<Record<string, string>> = Object.freeze(Object.fromEntries([...BASES, ...ACTIVITIES, ...EMOTIONS, ...EVENTS].map((n) => [kebab(n), n])));

export function fail(msg: string): never {
  throw new Error(`noxy-bots: ${msg}`);
}
export const show = (v: unknown): string => (typeof v === 'string' ? `"${v}"` : String(v));

/** A number in [lo, hi] (an integer if `int`), else throws naming the setting. */
export function num(key: string, v: unknown, lo: number, hi: number, int = false): number {
  if (typeof v !== 'number' || !(v >= lo && v <= hi) || (int && !Number.isInteger(v))) {
    fail(`${key} must be ${int ? 'an integer' : 'a number'} from ${lo} to ${hi}, got ${show(v)}`);
  }
  return v;
}

function find(name: unknown, layers: Layer[]): { layer: Layer; brain: string } {
  for (const layer of layers) if ((NAMES[layer] as readonly unknown[]).includes(name)) return { layer, brain: BRAIN[name as string] };
  fail(`unknown ${layers.length > 1 ? 'state' : layers[0]} ${show(name)}; valid: ${layers.flatMap((l) => NAMES[l]).join(', ')}`);
}

/** The Bot's state calls over one brain. It remembers the base it asked for: a sleep base can wait in the brain while events play. */
export function commands(brain: Nox) {
  let asked: Base = 'IDLE';
  const setBase = (b: Base) => {
    asked = b;
    brain.setBase(b);
  };
  const clearEmotion = () => {
    brain.setEmotion(null); // the sticky one
    brain.setEmotion(null, 0); // the timed one
  };
  return {
    state(name: StateName): void {
      const { layer, brain: b } = find(name, LAYERS);
      if (layer === 'base') {
        setBase(b as Base); // "idle" means nothing going on
        brain.setActivity(null);
        clearEmotion();
      } else if (layer === 'activity') {
        if (isAsleep(asked)) setBase('IDLE'); // "the bot is thinking" means awake
        brain.setActivity(b as Activity);
      } else if (layer === 'emotion') brain.setEmotion(b as Emotion);
      else brain.trigger(b as BrainEvent);
    },
    base: (name: BaseName) => setBase(find(name, ['base']).brain as Base),
    activity: (name: ActivityName | null) => brain.setActivity(name === null ? null : (find(name, ['activity']).brain as Activity)),
    emotion(name: EmotionName | null, holdMs?: number): void {
      if (name === null) return clearEmotion();
      const e = find(name, ['emotion']).brain as Emotion;
      if (holdMs === undefined) return brain.setEmotion(e);
      num('holdMs', holdMs, 0, Infinity);
      brain.setEmotion(null); // a sticky emotion would hide the timed one
      brain.setEmotion(e, holdMs);
    },
    play: (name: EventName) => brain.trigger(find(name, ['event']).brain as BrainEvent),
  };
}
