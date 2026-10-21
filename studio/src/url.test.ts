// Settings in the URL (M3 spec §5.3).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULTS, themeBase, type StudioState } from './state.ts';
import { link, parse, serialize, writeUrl } from './url.ts';

const sample: StudioState = {
  theme: 'mint',
  parts: { ...DEFAULTS.parts, body: 'box', ears: 'antenna' },
  sizes: { ...DEFAULTS.sizes, eye: 1.1, bolt: 0.8 },
  colors: { ...themeBase('mint'), eye: '#00ff00' },
  personality: 'shy',
  dials: { blink: 0.5, snap: 2 },
  state: 'thinking',
  speed: 1.5,
  seed: 42,
};

afterEach(() => vi.unstubAllGlobals());

describe('parse', () => {
  it('reads every parameter', () => {
    const { state, ignored } = parse('?theme=mint&body=box&ears=antenna&eye-size=1.1&bolt-size=0.8&color-eye=%2300FF00&personality=shy&blink=0.5&snap=2&state=thinking&speed=1.5&seed=42');
    expect(ignored).toEqual([]);
    expect(state).toEqual(sample);
  });

  it('an empty query is the defaults', () => {
    expect(parse('')).toEqual({ state: DEFAULTS, ignored: [] });
  });

  it('drops hostile and bad values and names each one', () => {
    const bad = new URLSearchParams({
      theme: '"><img src=x onerror=alert(1)>',
      body: 'javascript:alert(1)',
      ears: 'x'.repeat(65),
      'eye-size': '1e999',
      'ear-size': 'NaN',
      'bolt-size': '',
      'color-eye': 'red',
      personality: 'constructor',
      blink: '2.5',
      glance: '__proto__',
      wiggle: 'Infinity',
      state: 'boot',
      speed: '0',
      seed: '-1',
    });
    const { state, ignored } = parse(`?${bad}`);
    expect(state).toEqual(DEFAULTS);
    expect(ignored).toEqual(['theme', 'body', 'ears', 'eye-size', 'ear-size', 'bolt-size', 'color-eye', 'personality', 'blink', 'glance', 'wiggle', 'state', 'speed', 'seed']);
  });

  it('ignores unknown keys silently and takes the first of a repeat', () => {
    expect(parse('?__proto__=1&constructor=x&foo=bar&theme=mint&theme=onyx')).toEqual({ state: { ...DEFAULTS, theme: 'mint' }, ignored: [] });
    expect(parse('?personality=__proto__').ignored).toEqual(['personality']);
  });

  it('a stale theme next to good colours: the theme is named, the colours land on the default theme', () => {
    const { state, ignored } = parse('?theme=retired&color-eye=%2300ff00');
    expect(ignored).toEqual(['theme']);
    expect(state.theme).toBe(DEFAULTS.theme);
    expect(state.colors).toEqual({ ...themeBase(DEFAULTS.theme), eye: '#00ff00' });
  });

  it('colours equal to the theme normalise to none', () => {
    expect(parse(`?theme=mint&color-eye=${encodeURIComponent(themeBase('mint').eye)}`).state.colors).toBeNull();
  });
});

describe('serialize', () => {
  it('writes only non-default values, in table order', () => {
    expect(serialize({ ...DEFAULTS, speed: 1.5, theme: 'mint' })).toBe('theme=mint&speed=1.5');
    expect(serialize(DEFAULTS)).toBe('');
  });

  it('writes explicit dials even at the preset value, and seed 0', () => {
    expect(serialize({ ...DEFAULTS, dials: { blink: 1 }, seed: 0 })).toBe('blink=1&seed=0');
  });

  it('writes only the colour slots that differ from the theme', () => {
    expect(serialize({ ...DEFAULTS, colors: { ...themeBase('classic'), eye: '#00ff00' } })).toBe('color-eye=%2300ff00');
  });

  it('round-trips', () => {
    expect(parse(`?${serialize(sample)}`)).toEqual({ state: sample, ignored: [] });
    expect(parse(`?${serialize(DEFAULTS)}`).state).toEqual(DEFAULTS);
  });
});

describe('the address bar', () => {
  it('link() builds from the query, with no ? when empty', () => {
    vi.stubGlobal('location', { origin: 'https://example.test', pathname: '/studio/' });
    expect(link('theme=mint')).toBe('https://example.test/studio/?theme=mint');
    expect(link('')).toBe('https://example.test/studio/');
  });

  it('writeUrl() drops a write Safari refuses', () => {
    vi.stubGlobal('location', { pathname: '/' });
    vi.stubGlobal('history', {
      replaceState: () => {
        throw new Error('SecurityError: too many calls');
      },
    });
    expect(() => writeUrl('theme=mint')).not.toThrow();
  });

  it('writeUrl() puts the query in the address bar', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('location', { pathname: '/s/' });
    vi.stubGlobal('history', { replaceState });
    writeUrl('theme=mint');
    writeUrl('');
    expect(replaceState.mock.calls.map((c) => c[2])).toEqual(['?theme=mint', '/s/']);
  });
});
