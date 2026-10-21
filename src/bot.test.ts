// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Nox } from './brain/nox.ts';
import { createBot, DIALS, nox, PERSONALITIES, type Bot, type BotOptions } from './index.ts';
import { tuningFor } from './brain/personality.ts';

// Every brain createBot makes, so tests can look inside.
const brains = vi.hoisted(() => [] as Nox[]);
vi.mock('./brain/nox.ts', async (importOriginal) => {
  const m = await importOriginal<typeof import('./brain/nox.ts')>();
  return { ...m, createNox: (o: Parameters<typeof m.createNox>[0]) => (brains.push(m.createNox(o)), brains.at(-1)!) };
});

let frames: ((now: number) => void)[] = [];
const observers: IntersectionObserverCallback[] = [];
const reduce = { matches: false, listeners: new Set<() => void>() };
beforeAll(() => {
  vi.stubGlobal('requestAnimationFrame', (f: (now: number) => void) => frames.push(f));
  vi.stubGlobal('cancelAnimationFrame', () => (frames = []));
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: IntersectionObserverCallback) {
        observers.push(cb);
      }
      observe() {}
      unobserve() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return reduce.matches;
    },
    addEventListener: (_: string, f: () => void) => reduce.listeners.add(f),
    removeEventListener: (_: string, f: () => void) => reduce.listeners.delete(f),
  }));
});
const tick = (now: number) => {
  const due = frames;
  frames = [];
  for (const f of due) f(now);
};
/** Tells every loop's observer that `el` went on or off screen. */
const onScreen = (el: Element, isIntersecting: boolean) => {
  for (const cb of observers) cb([{ target: el, isIntersecting } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
};
/** rAF frames every 1000/60 ms from `from` for `ms`. */
const play = (from: number, ms: number) => {
  for (let t = from; t <= from + ms; t += 1000 / 60) tick(t);
};

const made: Bot[] = [];
const make = (options?: BotOptions, host: Element = document.body.appendChild(document.createElement('div'))) => {
  const bot = createBot(host, options);
  made.push(bot);
  return { bot, host, svg: host.querySelector('svg')!, brain: brains.at(-1)! };
};
afterEach(() => {
  for (const b of made.splice(0)) b.destroy();
  document.body.innerHTML = '';
  reduce.matches = false;
});
const part = (svg: Element, id: string) => svg.querySelector(`[id$="-${id}"]`)!;

describe('createBot', () => {
  it('appends one drawn <svg>, leaving other children alone', () => {
    const host = document.body.appendChild(document.createElement('div'));
    host.append(document.createElement('p'));
    const { svg } = make({}, host);
    expect([...host.children].map((c) => c.tagName.toLowerCase())).toEqual(['p', 'svg']);
    expect(part(svg, 'ear-r').getAttribute('transform')).toMatch(/scale\(-/); // drawn: the right ear is mirrored
    expect([svg.getAttribute('width'), svg.getAttribute('height'), svg.style.display]).toEqual(['100%', '100%', 'block']);
  });

  it('gives each bot its own ids', () => {
    make();
    make();
    const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
    expect(ids.length).toBeGreaterThan(50);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('two copies of the package on one page still give unique ids', async () => {
    const copies = [];
    for (let i = 0; i < 2; i++) {
      vi.resetModules(); // a fresh copy, as with a duplicated dependency: its bot count starts at 1 too
      copies.push(await import('./index.ts'));
    }
    made.push(...copies.map((c) => c.createBot(document.body.appendChild(document.createElement('div'))))); // afterEach destroys them
    const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('works on an element that is not on the page yet', () => {
    // The loop and the draw only: the stubbed observer never reports. A real one reports on attach (browser-checked in Task 11).
    const host = document.createElement('div');
    const { brain } = make({ fps: 60 }, host);
    document.body.append(host);
    const spy = vi.spyOn(brain, 'tick');
    play(0, 100);
    expect(spy).toHaveBeenCalled();
    expect(host.querySelector('svg')).not.toBe(null);
  });

  it('refuses a second bot on one element until the first is destroyed', () => {
    const { bot, host } = make();
    expect(() => createBot(host)).toThrow('noxy-bots: this element already has a bot; destroy() it first');
    bot.destroy();
    expect(() => make({}, host)).not.toThrow();
  });

  it('destroy() removes only its <svg>, can be called twice, and ends the bot', () => {
    const host = document.body.appendChild(document.createElement('div'));
    host.append(document.createElement('p'));
    const { bot } = make({}, host);
    bot.destroy();
    bot.destroy();
    expect(host.innerHTML).toBe('<p></p>');
    expect(() => bot.state('happy')).toThrow('noxy-bots: this bot was destroyed');
    expect(frames.length).toBe(0); // the loop stopped with its last bot
  });

  it('appears settled in its starting state', () => {
    const { brain } = make({ state: 'sleep' });
    expect(brain.resolver.base).toBe('SLEEP');
    expect(brain.pose.symZ).toBeGreaterThan(0.9); // the Zzz are already up
  });

  it('plays a starting event after settling, so it shows', () => {
    const { brain } = make({ state: 'success' });
    expect(brain.resolver.playing?.name).toBe('SUCCESS');
  });

  it('does not play BOOT on mount', () => {
    expect(make().brain.resolver.log.join()).not.toMatch(/BOOT/);
  });

  it.each([
    [{ seed: -1 }, 'seed must be an integer from 0 to 4294967295, got -1'],
    [{ seed: 1.5 }, 'seed must be an integer from 0 to 4294967295, got 1.5'],
    [{ speed: 0 }, 'speed must be a number from 0.1 to 4, got 0'],
    [{ fps: 61 }, 'fps must be an integer from 1 to 60, got 61'],
    [{ motion: 'slow' }, 'motion must be one of auto, full, calm, still, got "slow"'],
    [{ label: 5 }, 'label must be a string, got 5'],
    [{ look: { ears: 'x' } }, 'unknown ears "x"; valid: antenna, nox, none'],
    [{ look: { sizes: { eye: 2 } } }, 'sizes.eye must be a number from 0.7 to 1.3, got 2'],
    [{ state: 'wake' }, 'unknown state "wake"'],
  ])('rejects %j, leaving the element as it was', (options, message) => {
    const host = document.body.appendChild(document.createElement('div'));
    expect(() => createBot(host, options as BotOptions)).toThrow(`noxy-bots: ${message}`);
    expect(host.innerHTML).toBe('');
    expect(() => make({}, host)).not.toThrow();
  });
});

describe('Bot', () => {
  it('update() merges a look patch and rebuilds with the same ids, drawn before it is shown', () => {
    const { bot, host, svg } = make({ look: { theme: 'mint' } });
    bot.update({ look: { ears: 'none', sizes: { eye: 1.2 } } });
    const next = host.querySelector('svg')!;
    expect(next).not.toBe(svg);
    expect(bot.look).toMatchObject({ theme: 'mint', ears: 'none', sizes: { eye: 1.2, ear: 1 } });
    expect(part(next, 'ear-r').id).toBe(part(svg, 'ear-r').id);
    expect(part(next, 'ear-r').getAttribute('transform')).toMatch(/scale\(-/);
    expect(host.querySelectorAll('svg').length).toBe(1);
  });

  it('update() checks everything before changing anything', () => {
    const { bot } = make();
    expect(() => bot.update({ look: { ears: 'none' }, fps: 0 })).toThrow('noxy-bots: fps must be an integer');
    expect(bot.look.ears).toBe('nox');
  });

  it('a label makes it an image with a name; none makes it decorative', () => {
    const { bot, host } = make({ label: 'Nox is thinking' });
    const svg = () => host.querySelector('svg')!;
    expect([svg().getAttribute('role'), svg().getAttribute('aria-label'), svg().getAttribute('aria-hidden')]).toEqual(['img', 'Nox is thinking', null]);
    bot.update({ label: '' });
    expect([svg().getAttribute('role'), svg().getAttribute('aria-hidden'), svg().getAttribute('focusable')]).toEqual([null, 'true', 'false']);
  });

  it('ticks at its fps, scaled by speed', () => {
    const { brain } = make({ fps: 30, speed: 2 });
    const spy = vi.spyOn(brain, 'tick');
    play(0, 1000);
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(29);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(31);
    expect(spy.mock.calls.reduce((sum, [dt]) => sum + dt, 0)).toBeCloseTo(2000, -2);
  });

  it('a low fps or a high speed still advances the brain by elapsed × speed', () => {
    const { brain } = make({ fps: 2, speed: 4 });
    const spy = vi.spyOn(brain, 'tick');
    play(0, 1000);
    expect(Math.max(...spy.mock.calls.map(([dt]) => dt))).toBeLessThanOrEqual(250); // tick() caps one call at 250 ms
    expect(spy.mock.calls.reduce((sum, [dt]) => sum + dt, 0)).toBeCloseTo(4000, -2);
  });

  it('a gap over 250 ms counts as one step', () => {
    const { brain } = make({ fps: 60 });
    const spy = vi.spyOn(brain, 'tick');
    tick(0);
    tick(5000);
    expect(spy.mock.calls.at(-1)![0]).toBeCloseTo(1000 / 60);
  });

  it('skips frames off screen', () => {
    const { brain, svg } = make({ fps: 60 });
    const spy = vi.spyOn(brain, 'tick');
    onScreen(svg, false);
    play(0, 500);
    expect(spy).not.toHaveBeenCalled();
    onScreen(svg, true);
    play(600, 100);
    expect(spy.mock.calls[0][0]).toBeCloseTo(1000 / 60); // back on screen: no jump
  });

  it('pause() stops it; resume() starts it again without a jump', () => {
    const { bot, brain } = make({ fps: 60 });
    const spy = vi.spyOn(brain, 'tick');
    bot.pause();
    expect(bot.paused).toBe(true);
    play(0, 500);
    expect(spy).not.toHaveBeenCalled();
    bot.resume();
    play(600, 50);
    expect(spy.mock.calls[0][0]).toBeLessThan(20);
  });

  it("motion 'auto' follows the reduced-motion setting, live; an explicit motion ignores it", () => {
    reduce.matches = true;
    const a = make();
    const b = make({ motion: 'calm' });
    expect([a.brain.motion, b.brain.motion]).toEqual(['still', 'calm']);
    reduce.matches = false;
    for (const f of reduce.listeners) f();
    expect([a.brain.motion, b.brain.motion]).toEqual(['full', 'calm']);
    a.bot.destroy();
    b.bot.destroy();
    expect(reduce.listeners.size).toBe(0);
  });

  it('lookAt() holds the eyes on a point', () => {
    const { bot, brain } = make();
    bot.lookAt(0.6, -0.3);
    for (let i = 0; i < 12; i++) brain.tick(250);
    expect(brain.pose.lookX).toBeGreaterThan(0.4);
    bot.lookAt(null);
    expect(() => bot.lookAt(Number.NaN, 0)).toThrow('noxy-bots: lookAt needs two finite numbers or null, got NaN, 0');
  });
});

describe('personality and dials (M3 spec §4.1)', () => {
  const host = () => document.body.appendChild(document.createElement('div'));
  const P = PERSONALITIES;

  it('exports the dial names and presets', () => {
    expect(DIALS).toEqual(['energy', 'bounce', 'squish', 'blink', 'glance', 'wiggle', 'head', 'snap']);
    expect(Object.keys(P)).toEqual(['default', 'chill', 'curious', 'bouncy', 'shy']);
  });

  it('applies the personality, with given dials winning', () => {
    createBot(host(), { personality: 'curious', blink: 0.5 });
    expect(brains.at(-1)!.tuning).toEqual(tuningFor({ ...P.curious, blink: 0.5 }));
  });

  it('update() retunes only on a real change', () => {
    const bot = createBot(host());
    const retune = vi.spyOn(brains.at(-1)!, 'retune');
    bot.update({ speed: 2, label: 'x', look: { ears: 'none' } });
    bot.update({ personality: 'default' });
    bot.update({ blink: 1 });
    expect(retune).not.toHaveBeenCalled();
    bot.update({ blink: 1.5 });
    expect(retune).toHaveBeenCalledTimes(1);
  });

  it('update({ personality }) keeps given dials; null clears one', () => {
    const bot = createBot(host(), { blink: 0.5 });
    bot.update({ personality: 'chill' });
    expect(brains.at(-1)!.tuning).toEqual(tuningFor({ ...P.chill, blink: 0.5 }));
    bot.update({ blink: null });
    expect(brains.at(-1)!.tuning).toEqual(tuningFor(P.chill));
  });

  it('rejects a bad personality by own key, and bad dials, before changing anything', () => {
    for (const bad of ['constructor', '__proto__', 'toString', 'grumpy']) {
      expect(() => createBot(host(), { personality: bad as never })).toThrow(
        `noxy-bots: personality must be one of default, chill, curious, bouncy, shy, got "${bad}"`,
      );
    }
    const bot = createBot(host());
    expect(() => bot.update({ blink: 2.5 })).toThrow('noxy-bots: blink must be a number from 0 to 2, got 2.5');
    expect(() => bot.update({ speed: 2, energy: -1 })).toThrow('noxy-bots: energy must be a number from 0 to 2, got -1');
    expect(() => bot.update({ glance: NaN })).toThrow(/glance/);
    expect(brains.at(-1)!.tuning).toEqual(tuningFor(P.default));
  });
});

describe('snapshot (M3 spec §4.3)', () => {
  const host = () => document.body.appendChild(document.createElement('div'));
  const parse = (s: string) => new DOMParser().parseFromString(s, 'image/svg+xml').documentElement;
  const drawn = (root: Element) =>
    [...root.querySelectorAll('*')].map((e) => ['transform', 'd', 'fill', 'opacity', 'style'].map((a) => e.getAttribute(a)).join('|'));

  it('is a standalone svg of the frame, without aria or style', () => {
    const bot = createBot(host(), { label: 'Nox' });
    const text = bot.snapshot();
    expect(text).toMatch(/^<svg[^>]* xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    const svg = parse(text);
    expect(svg.getAttribute('viewBox')).toBe(nox.frame.join(' '));
    expect(svg.getAttribute('width')).toBe(String(nox.frame[2]));
    expect(svg.getAttribute('height')).toBe(String(nox.frame[3]));
    for (const a of ['style', 'role', 'aria-label', 'aria-hidden', 'focusable']) expect(svg.hasAttribute(a)).toBe(false);
  });

  it('matches the live frame, resolves every reference, and leaves the live svg alone', () => {
    const h = host();
    const bot = createBot(h, { look: { theme: { base: { shell: '#aabbcc', screen: '#112233', eye: '#00ff00', accent: '#ff8800', mouth: '#ffffff' } } } });
    const live = h.querySelector('svg')!;
    const before = live.outerHTML;
    const text = bot.snapshot();
    const snap = parse(text);
    expect(drawn(snap)).toEqual(drawn(live));
    const ids = new Set([...snap.querySelectorAll('[id]')].map((e) => e.id));
    const refs = [...text.matchAll(/url\(#([^)]+)\)|href="#([^"]+)"/g)].map((m) => m[1] ?? m[2]);
    expect(refs.length).toBeGreaterThan(0);
    for (const r of refs) expect(ids.has(r)).toBe(true);
    expect(live.outerHTML).toBe(before);
  });

  it('works while paused and after a look remount; throws after destroy', () => {
    const h = host();
    const bot = createBot(h);
    bot.pause();
    bot.update({ look: { ears: 'antenna' } });
    expect(parse(bot.snapshot()).querySelectorAll('*').length).toBe(h.querySelector('svg')!.querySelectorAll('*').length);
    bot.destroy();
    expect(() => bot.snapshot()).toThrow('noxy-bots: this bot was destroyed');
  });
});
