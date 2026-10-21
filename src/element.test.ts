// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Nox } from './brain/nox.ts';
import './element.ts';
import { PERSONALITIES, tuningFor } from './brain/personality.ts';
import { nox } from './character/nox/index.ts';

const brains = vi.hoisted(() => [] as Nox[]);
vi.mock('./brain/nox.ts', async (importOriginal) => {
  const m = await importOriginal<typeof import('./brain/nox.ts')>();
  return { ...m, createNox: (o: Parameters<typeof m.createNox>[0]) => (brains.push(m.createNox(o)), brains.at(-1)!) };
});
beforeAll(() => {
  vi.stubGlobal('requestAnimationFrame', () => 0); // frames are createBot's business; nothing ticks here
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => {
  document.body.innerHTML = ''; // disconnects, so every bot is destroyed
  vi.restoreAllMocks();
});

const el = (attrs: Record<string, string> = {}) => {
  const e = document.createElement('noxy-bot');
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};
const add = (attrs?: Record<string, string>) => document.body.appendChild(el(attrs));

describe('<noxy-bot>', () => {
  it('builds a bot in its shadow root from its attributes', () => {
    const e = add({ state: 'sleep', theme: 'midnight', ears: 'none', 'eye-size': '1.1', motion: 'calm' });
    expect(e.shadowRoot!.querySelectorAll('svg').length).toBe(1);
    expect(e.bot!.look).toMatchObject({ theme: 'midnight', ears: 'none', sizes: { eye: 1.1, ear: 1 } });
    expect(brains.at(-1)!.resolver.base).toBe('SLEEP');
    expect(brains.at(-1)!.motion).toBe('calm');
  });

  it('styles its box: 120 px wide by default, the frame aspect ratio', () => {
    const root = add().shadowRoot!;
    const css = root.adoptedStyleSheets.length ? [...root.adoptedStyleSheets[0].cssRules].map((r) => r.cssText).join('') : root.querySelector('style')!.textContent;
    expect(css).toMatch(/width:\s*120px/);
    expect(css).toMatch(/aspect-ratio:\s*985 \/ 830/);
  });

  it('is decorative without a label, an image with one', () => {
    const e = add();
    expect(e.getAttribute('aria-hidden')).toBe('true');
    e.setAttribute('label', 'Nox');
    expect([e.getAttribute('role'), e.getAttribute('aria-label'), e.getAttribute('aria-hidden')]).toEqual(['img', 'Nox', null]);
  });

  it('applies attribute changes to the live bot', () => {
    const e = add();
    e.setAttribute('ears', 'antenna');
    e.setAttribute('state', 'happy');
    expect(e.bot!.look.ears).toBe('antenna');
    expect(brains.at(-1)!.resolver.emotion).toBe('HAPPY');
    e.removeAttribute('ears');
    expect(e.bot!.look.ears).toBe('nox');
    e.setAttribute('motion', 'still');
    expect(brains.at(-1)!.motion).toBe('still');
  });

  it('reads seed once, when it connects', () => {
    const e = add({ seed: '3' });
    const bot = e.bot;
    const svg = e.shadowRoot!.querySelector('svg');
    e.setAttribute('seed', '4');
    expect([e.bot, e.shadowRoot!.querySelector('svg')]).toEqual([bot, svg]);
  });

  it('removing state leaves the bot as it is', () => {
    const e = add({ state: 'thinking' });
    e.removeAttribute('state');
    expect(brains.at(-1)!.resolver.activity).toBe('THINKING');
  });

  it('warns once about a bad value and keeps the last good one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const e = add({ ears: 'antenna' });
    e.setAttribute('ears', 'wings');
    e.setAttribute('ears', 'wings');
    e.setAttribute('eye-size', 'big');
    expect(e.bot!.look).toMatchObject({ ears: 'antenna', sizes: { eye: 1 } });
    expect(warn.mock.calls.map(([m]) => m)).toEqual([
      'noxy-bots: unknown ears "wings"; valid: antenna, nox, none',
      'noxy-bots: eye-size="big" must be a number from 0.7 to 1.3',
    ]);
  });

  it('falls back to the default for a bad value on first connect', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const e = add({ fps: '0', theme: 'neon' });
    expect(e.bot!.look.theme).toBe('classic');
  });

  it('re-creates its bot when moved, and drops it when removed', () => {
    const e = add({ state: 'success' });
    const first = e.bot!;
    document.body.append(document.createElement('div'), e); // a move: disconnect, connect
    expect(e.bot).not.toBe(first);
    expect(() => first.state('idle')).toThrow('this bot was destroyed');
    expect(brains.at(-1)!.resolver.playing?.name).toBe('SUCCESS'); // an event in `state` replays on re-connect
    e.remove();
    expect(e.bot).toBe(null);
    expect(e.shadowRoot!.querySelector('svg')).toBe(null);
  });

  it('takes a look from JS; look attributes win over it; a bad one warns once and keeps the last good look', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const e = el({ theme: 'mint' });
    e.look = { theme: { base: { shell: '#336699', screen: '#101010', eye: '#00FF00', accent: '#FF0000', mouth: '#FFFFFF' } }, ears: 'none' };
    document.body.append(e);
    expect(e.bot!.look).toMatchObject({ theme: 'mint', ears: 'none' });
    e.removeAttribute('theme');
    expect(e.bot!.look.theme).toMatchObject({ base: { shell: '#336699' } });
    expect(() => (e.look = { ears: 'x' })).not.toThrow(); // a throwing setter would take a React 19 tree down
    e.look = { ears: 'x' };
    expect(e.look).toMatchObject({ ears: 'none' });
    expect(e.bot!.look.ears).toBe('none');
    expect(warn.mock.calls.map(([m]) => m)).toEqual([expect.stringMatching(/^noxy-bots: unknown ears "x"/)]);
  });

  it('a bad look property an attribute hid: removing the attribute warns once and keeps the last look', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const e = el({ theme: 'mint' });
    e.look = { theme: 'neon' };
    document.body.append(e);
    expect(e.bot!.look.theme).toBe('mint');
    expect(() => e.removeAttribute('theme')).not.toThrow();
    e.setAttribute('ears', 'none'); // the same bad look again
    expect(e.bot!.look).toMatchObject({ theme: 'mint', ears: 'nox' });
    expect(warn.mock.calls.map(([m]) => m)).toEqual([expect.stringMatching(/^noxy-bots: unknown theme "neon"/)]);
  });

  it('warns once, without throwing, when the page cannot host a bot', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const make = document.createElement.bind(document);
    // e.g. page markup like <img name="createElement"> shadowing document.createElement
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'template') throw new TypeError('document.createElement is not a function');
      return make(tag);
    }) as typeof document.createElement);
    const e = el();
    expect(() => document.body.append(e)).not.toThrow();
    expect(e.bot).toBe(null);
    expect(e.shadowRoot!.querySelector('svg')).toBe(null);
    expect(warn.mock.calls.map(([m]) => m)).toEqual(['document.createElement is not a function']);
  });
});

describe('personality, dials and colours (M3 spec §4.2, §4.4)', () => {
  const baseOf = (id: string) => nox.themes.find((t) => t.id === id)!.base;
  const custom = { shell: '#aabbcc', screen: '#112233', eye: '#445566', accent: '#ff8800', mouth: '#ffffff' };

  it('personality and dial attributes set the tuning; removing a dial goes back to the preset', () => {
    const e = add({ personality: 'curious', blink: '0.5' });
    expect(brains.at(-1)!.tuning).toEqual(tuningFor({ ...PERSONALITIES.curious, blink: 0.5 }));
    e.removeAttribute('blink');
    expect(brains.at(-1)!.tuning).toEqual(tuningFor(PERSONALITIES.curious));
  });

  it('a dial change does not remount', () => {
    const e = add();
    const svg = e.shadowRoot!.querySelector('svg');
    e.setAttribute('glance', '2');
    expect(e.shadowRoot!.querySelector('svg')).toBe(svg);
    expect(brains.at(-1)!.tuning).toEqual(tuningFor({ ...PERSONALITIES.default, glance: 2 }));
  });

  it('a bad personality or dial warns once and keeps the last good value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const e = add({ blink: '0.5' });
    e.setAttribute('blink', '3');
    e.setAttribute('blink', '3');
    e.setAttribute('personality', 'constructor');
    e.setAttribute('personality', '__proto__');
    expect(warn).toHaveBeenCalledTimes(3);
    expect(brains.at(-1)!.tuning).toEqual(tuningFor({ ...PERSONALITIES.default, blink: 0.5 }));
  });

  it('colour attributes override slots of the theme attribute', () => {
    const e = add({ theme: 'mint', 'color-eye': '#00ff00' });
    expect(e.bot!.look.theme).toEqual({ base: { ...baseOf('mint'), eye: '#00ff00' } });
  });

  it('colour attributes go over the look property, named or custom', () => {
    const e = el({ 'color-eye': '#00ff00' });
    e.look = { theme: 'bubblegum' };
    document.body.append(e);
    expect(e.bot!.look.theme).toEqual({ base: { ...baseOf('bubblegum'), eye: '#00ff00' } });
    e.look = { theme: { base: custom } };
    expect(e.bot!.look.theme).toEqual({ base: { ...custom, eye: '#00ff00' } });
  });

  it('transitions: theme removed, one then all colours removed, a bad colour keeps the last good one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const e = add({ theme: 'mint', 'color-eye': '#00ff00', 'color-mouth': '#ffffff' });
    const svg = () => e.shadowRoot!.querySelector('svg');
    const first = svg();
    e.removeAttribute('theme');
    expect(e.bot!.look.theme).toEqual({ base: { ...baseOf('classic'), eye: '#00ff00', mouth: '#ffffff' } });
    expect(svg()).not.toBe(first); // colours remount, like theme
    e.removeAttribute('color-eye');
    expect(e.bot!.look.theme).toEqual({ base: { ...baseOf('classic'), mouth: '#ffffff' } });
    e.setAttribute('color-mouth', 'red');
    expect(warn).toHaveBeenCalledWith('noxy-bots: color-mouth="red" must be a colour like #fa6c2e');
    expect(e.bot!.look.theme).toEqual({ base: { ...baseOf('classic'), mouth: '#ffffff' } });
    e.removeAttribute('color-mouth');
    expect(e.bot!.look.theme).toBe('classic');
  });
});
