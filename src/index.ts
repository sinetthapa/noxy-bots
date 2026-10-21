// noxy-bots: createBot puts one Nox on a page and drives it with plain words (M2 spec §5).
import { createNox } from './brain/nox.ts';
import { DIALS, isPersonality, PERSONALITIES, tuningFor, type DialName, type Dials, type Personality } from './brain/personality.ts';
import { buildRig } from './character/build.ts';
import { resolveLook } from './character/look.ts';
import { DEFAULT_LOOK, nox as character } from './character/nox/index.ts';
import type { Look } from './character/types.ts';
import { commands, fail, NAMES, num, show, type ActivityName, type BaseName, type EmotionName, type EventName, type StateName } from './commands.ts';
import { halt, run, type Runner } from './loop.ts';
import { createSvgRenderer } from './render/svg.ts';

export { DEFAULT_LOOK, nox } from './character/nox/index.ts';
export { NAMES } from './commands.ts';
export { DIALS, PERSONALITIES } from './brain/personality.ts';
export type { DialName, Personality } from './brain/personality.ts';
export type { ActivityName, BaseName, EmotionName, EventName, StateName } from './commands.ts';
export type { Look, ThemeBase } from './character/types.ts';

/** A look with any part left out: missing parts and sizes come from the current look. */
export type LookPatch = Partial<Omit<Look, 'sizes'>> & { sizes?: Partial<Look['sizes']> };
export type Motion = 'auto' | 'full' | 'calm' | 'still';

/**
 * Dials, 0–2 each (1 = today's Nox): energy, bounce, squish, blink, glance, wiggle, head, snap (M3 spec §4.1).
 * A given dial wins over the personality; null goes back to the personality's value (unlike `look: null`, which means no patch).
 */
export interface BotOptions extends Partial<Record<DialName, number | null>> {
  /** Merged onto DEFAULT_LOOK. */
  look?: LookPatch;
  /** Applied before the first draw: the bot appears already in it. */
  state?: StateName;
  /** An integer 0–4294967295; default random, so bots don't blink in sync. */
  seed?: number;
  /** 0.1–4, default 1. */
  speed?: number;
  /** Default 'auto': 'still' when the visitor prefers reduced motion, else 'full'. */
  motion?: Motion;
  /** Frames per second, an integer 1–60; default 30. */
  fps?: number;
  /** What a screen reader says. Without it the bot is decorative. */
  label?: string;
  /** A preset for the 8 dials: default, chill, curious, bouncy or shy. Default 'default'. */
  personality?: Personality;
}

export interface Bot {
  state(name: StateName): void;
  base(name: BaseName): void;
  activity(name: ActivityName | null): void;
  emotion(name: EmotionName | null, holdMs?: number): void;
  play(name: EventName): void;
  /** Plays the notification and keeps the badge up until seen(). */
  notify(): void;
  seen(): void;
  /** Holds the eyes on a point: −1..1 each way, +x right, −y up. null goes back to looking around. */
  lookAt(x: number, y: number): void;
  lookAt(target: null): void;
  /** Look patches merge onto the current look. */
  update(options: Omit<BotOptions, 'seed' | 'state'>): void;
  readonly look: Look;
  pause(): void;
  resume(): void;
  readonly paused: boolean;
  /** The current frame as a standalone SVG document: frame-sized, no aria or style. Works while paused (M3 spec §4.3). */
  snapshot(): string;
  /** Removes the bot. Calling it again does nothing; any other call afterwards throws. */
  destroy(): void;
}

const MOTIONS: readonly Motion[] = ['auto', 'full', 'calm', 'still'];
const SETTLE_MS = 3000; // run ahead before the first draw, so a bot appears settled in its state
const hosts = new WeakSet<Element | ShadowRoot>();
// Ids are `n<copy><count>-`: the random part keeps two copies of this package on one page from colliding.
const copy = Math.random().toString(36).slice(2, 6);
let count = 0;

/** Drops undefined values, so `{ speed: undefined }` means "unchanged". */
const defined = <T extends object>(o: T): Partial<T> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
const merge = (look: Look, patch: LookPatch = {}): Look => {
  const p = defined(patch ?? {}); // null from JSON means no patch
  return { ...look, ...p, sizes: { ...look.sizes, ...defined(p.sizes ?? {}) } } as Look;
};

/** Checks every option and returns the ones given; throws on the first bad one. */
function check(o: BotOptions, look: Look): Partial<BotOptions> & { nextLook: Look } {
  const v = defined(o);
  if (v.seed !== undefined) num('seed', v.seed, 0, 4294967295, true);
  if (v.speed !== undefined) num('speed', v.speed, 0.1, 4);
  if (v.fps !== undefined) num('fps', v.fps, 1, 60, true);
  if (v.motion !== undefined && !MOTIONS.includes(v.motion)) fail(`motion must be one of ${MOTIONS.join(', ')}, got ${show(v.motion)}`);
  if (v.label !== undefined && typeof v.label !== 'string') fail(`label must be a string, got ${show(v.label)}`);
  if (v.personality !== undefined && !isPersonality(v.personality)) {
    fail(`personality must be one of ${Object.keys(PERSONALITIES).join(', ')}, got ${show(v.personality)}`);
  }
  for (const k of DIALS) {
    const d = v[k];
    if (d !== undefined && d !== null) num(k, d, 0, 2);
  }
  const nextLook = merge(look, v.look);
  resolveLook(character, nextLook); // throws naming the bad part, theme or size
  return { ...v, nextLook };
}

/**
 * Puts a bot into `host` (an element or a shadow root): appends one <svg>, leaves other children alone, and
 * draws before returning. One bot per host.
 */
export function createBot(host: Element | ShadowRoot, options: BotOptions = {}): Bot {
  if (hosts.has(host)) fail('this element already has a bot; destroy() it first');
  const o = check(options, DEFAULT_LOOK);
  const seed = o.seed ?? (Math.random() * 2 ** 32) >>> 0;
  let personality: Personality = o.personality ?? 'default';
  const own: Partial<Dials> = {}; // the dials given explicitly; they win over the personality
  const setDials = (u: Partial<BotOptions>) => {
    for (const k of DIALS) {
      const v = u[k];
      if (v === null) delete own[k];
      else if (v !== undefined) own[k] = v;
    }
  };
  setDials(o);
  const dials = (): Dials => ({ ...PERSONALITIES[personality], ...own });
  let tuned = dials();
  const brain = createNox({ seed, tuning: tuningFor(tuned) });
  const c = commands(brain);
  const prefix = `n${copy}${++count}-`;
  let look = o.nextLook;
  let speed = o.speed ?? 1;
  let fps = o.fps ?? 30;
  let motion = o.motion ?? 'auto';
  let label = o.label ?? '';
  let paused = false;
  let destroyed = false;
  let svg: SVGSVGElement | undefined;
  let renderer: ReturnType<typeof createSvgRenderer>;
  let last = -1; // the previous frame time; -1 = none yet
  let acc = 0;

  const mq = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const applyMotion = () => brain.setMotion(motion === 'auto' ? (mq?.matches ? 'still' : 'full') : motion);

  const runner: Runner = {
    el: null as unknown as Element,
    frame(now) {
      let dt = last < 0 ? 0 : now - last;
      last = now;
      if (dt > 250) dt = 1000 / 60; // a gap (hidden tab, resume, back on screen) counts as one step, so the bot never jumps
      acc += dt;
      if (acc < 1000 / fps - 1) return; // -1: rAF jitter shouldn't skip a frame
      for (let ms = acc * speed; ms > 0; ms -= 250) brain.tick(Math.min(ms, 250)); // tick() caps one call at 250 ms
      acc = 0;
      renderer.draw(brain.pose);
    },
  };

  const aria = (el: SVGSVGElement) => {
    for (const a of ['role', 'aria-label', 'aria-hidden']) el.removeAttribute(a);
    if (label) {
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', label);
    } else el.setAttribute('aria-hidden', 'true');
  };

  /** Builds the rig for the current look and draws the current pose before it is on the page. */
  function mount(): void {
    const t = (host.ownerDocument ?? document).createElement('template');
    t.innerHTML = buildRig(character, look, { prefix });
    const next = t.content.firstElementChild as SVGSVGElement;
    next.setAttribute('width', '100%');
    next.setAttribute('height', '100%');
    next.setAttribute('focusable', 'false');
    next.style.display = 'block';
    aria(next);
    renderer = createSvgRenderer(next, resolveLook(character, look), brain.tuning, { prefix });
    renderer.draw(brain.pose);
    if (svg) {
      halt(runner);
      svg.replaceWith(next);
    } else host.appendChild(next);
    svg = next;
    runner.el = next;
    if (!paused) run(runner);
  }

  // Settle: apply the starting state, run the brain ahead, then play a starting event so it isn't over before the first draw.
  applyMotion();
  const start = o.state;
  const isEvent = start !== undefined && (NAMES.event as readonly string[]).includes(start);
  if (start !== undefined && !isEvent) c.state(start); // throws on an unknown name, before anything is on the page
  for (let t = 0; t < SETTLE_MS; t += 250) brain.tick(250);
  if (isEvent) c.state(start);
  mount();
  hosts.add(host);
  mq?.addEventListener?.('change', applyMotion);

  const live = () => {
    if (destroyed) fail('this bot was destroyed');
  };
  return {
    state: (name) => (live(), c.state(name)),
    base: (name) => (live(), c.base(name)),
    activity: (name) => (live(), c.activity(name)),
    emotion: (name, holdMs) => (live(), c.emotion(name, holdMs)),
    play: (name) => (live(), c.play(name)),
    notify: () => (live(), brain.notify()),
    seen: () => (live(), brain.seen()),
    lookAt(x: number | null, y?: number) {
      live();
      if (x === null) return brain.setGaze(null);
      if (!Number.isFinite(x) || !Number.isFinite(y)) fail(`lookAt needs two finite numbers or null, got ${show(x)}, ${show(y)}`);
      brain.setGaze(x, y!);
    },
    update(options) {
      live();
      const u = check(options, look);
      if (u.speed !== undefined) speed = u.speed;
      if (u.fps !== undefined) fps = u.fps;
      if (u.motion !== undefined) {
        motion = u.motion;
        applyMotion();
      }
      if (u.label !== undefined) {
        label = u.label;
        aria(svg!);
      }
      if (u.look !== undefined) {
        look = u.nextLook;
        mount();
      }
      if (u.personality !== undefined) personality = u.personality;
      setDials(u);
      const next = dials();
      if (DIALS.some((k) => next[k] !== tuned[k])) {
        tuned = next;
        brain.retune(tuningFor(next)); // only on a real change: a speed or label update never restarts the waits
      }
    },
    get look() {
      return look;
    },
    pause() {
      live();
      if (paused) return;
      paused = true;
      halt(runner);
    },
    resume() {
      live();
      if (!paused) return;
      paused = false;
      last = -1;
      run(runner);
    },
    get paused() {
      return paused;
    },
    snapshot() {
      live();
      const c = svg!.cloneNode(true) as SVGSVGElement; // the live svg is never touched
      for (const a of ['style', 'role', 'aria-label', 'aria-hidden', 'focusable']) c.removeAttribute(a);
      // Every url(#…) and the glow filter sit in this svg's own <defs> with the bot's prefix, so the copy stands alone.
      c.setAttribute('width', String(character.frame[2]));
      c.setAttribute('height', String(character.frame[3]));
      return new XMLSerializer().serializeToString(c);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      halt(runner);
      mq?.removeEventListener?.('change', applyMotion);
      svg?.remove();
      hosts.delete(host);
    },
  };
}
