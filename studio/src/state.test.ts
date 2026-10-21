// @vitest-environment happy-dom
// Studio state (M3 spec §5.2).
import { createBot } from 'noxy-bots';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Nox } from '../../src/brain/nox.ts';
import { botProps, DEFAULTS, lookOf, randomize, reduce, seedFrom, showState, themeBase, type StudioState } from './state.ts';

const brains = vi.hoisted(() => [] as Nox[]);
vi.mock('../../src/brain/nox.ts', async (importOriginal) => {
  const m = await importOriginal<typeof import('../../src/brain/nox.ts')>();
  return { ...m, createNox: (o: Parameters<typeof m.createNox>[0]) => (brains.push(m.createNox(o)), brains.at(-1)!) };
});
beforeAll(() => {
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => {
  document.body.textContent = '';
});

describe('reduce', () => {
  it('picking a theme clears custom colours', () => {
    const s = reduce({ ...DEFAULTS, colors: { ...themeBase('classic'), eye: '#00ff00' } }, { type: 'theme', id: 'mint' });
    expect(s.theme).toBe('mint');
    expect(s.colors).toBeNull();
  });

  it('a colour starts from the theme base, lowercased, and goes back to null when it equals the base', () => {
    let s = reduce(DEFAULTS, { type: 'color', slot: 'eye', value: '#00FF00' });
    expect(s.colors).toEqual({ ...themeBase('classic'), eye: '#00ff00' });
    s = reduce(s, { type: 'color', slot: 'eye', value: themeBase('classic').eye.toUpperCase() });
    expect(s.colors).toBeNull();
  });

  it('quantises numbers to 2 decimals at entry', () => {
    let s = reduce(DEFAULTS, { type: 'size', key: 'eye', value: 1.23456 });
    s = reduce(s, { type: 'dial', name: 'blink', value: 0.305 });
    s = reduce(s, { type: 'speed', value: 1.999 });
    expect([s.sizes.eye, s.dials.blink, s.speed]).toEqual([1.23, 0.31, 2]);
  });

  it('keeps explicit dials when the personality changes; Reset clears them', () => {
    let s = reduce(DEFAULTS, { type: 'dial', name: 'blink', value: 1.2 });
    s = reduce(s, { type: 'personality', name: 'curious' });
    expect(s.dials).toEqual({ blink: 1.2 });
    expect(reduce(s, { type: 'resetDials' }).dials).toEqual({});
  });

  it('parts, state, seed and replace', () => {
    let s = reduce(DEFAULTS, { type: 'part', part: 'ears', id: 'antenna' });
    s = reduce(s, { type: 'state', name: 'thinking' });
    s = reduce(s, { type: 'seed', value: 0 });
    expect([s.parts.ears, s.state, s.seed]).toEqual(['antenna', 'thinking', 0]);
    expect(reduce(s, { type: 'replace', state: DEFAULTS })).toBe(DEFAULTS);
  });
});

describe('randomize', () => {
  it('picks a look and personality, clears colours and dials, keeps state, speed and seed', () => {
    const start: StudioState = { ...DEFAULTS, colors: themeBase('mint'), dials: { blink: 2 }, state: 'happy', speed: 2, seed: 9 };
    const r = randomize(start, () => 0.99);
    expect(r.colors).toBeNull();
    expect(r.dials).toEqual({});
    expect([r.state, r.speed, r.seed]).toEqual(['happy', 2, 9]);
    expect(r.theme).toBe('onyx');
    expect(r.personality).toBe('shy');
    expect(r.sizes.eye).toBeCloseTo(1.15);
    expect(randomize(start, () => 0).sizes.ear).toBe(0.85);
  });
});

describe('derived', () => {
  it('lookOf and botProps carry the look, personality, dials, speed and seed', () => {
    const s: StudioState = { ...DEFAULTS, colors: { ...themeBase('classic'), eye: '#00ff00' }, personality: 'shy', dials: { snap: 2 }, speed: 1.5, seed: 4 };
    expect(lookOf(s)).toEqual({ ...DEFAULTS.parts, theme: { base: s.colors }, sizes: DEFAULTS.sizes });
    expect(botProps(s)).toEqual({ look: lookOf(s), personality: 'shy', snap: 2, speed: 1.5, seed: 4 });
    expect('seed' in botProps(DEFAULTS)).toBe(false);
  });

  it('seedFrom: empty is none, junk is ignored', () => {
    expect(seedFrom('')).toBeNull();
    expect(seedFrom('  ')).toBeNull();
    expect(seedFrom('42')).toBe(42);
    expect(seedFrom('0')).toBe(0);
    for (const bad of ['12e', '-1', '1.5', '4294967296', 'abc']) expect(seedFrom(bad)).toBeUndefined();
  });
});

describe('showState', () => {
  const layers = (n: Nox) => [n.resolver.base, n.resolver.effectiveActivity, n.resolver.emotion];

  it('activity then emotion gives the same layers as a fresh createBot({ state: emotion })', () => {
    const bot = createBot(document.body.appendChild(document.createElement('div')), { seed: 1 });
    const live = brains.at(-1)!;
    showState(bot, 'thinking');
    showState(bot, 'happy');
    createBot(document.body.appendChild(document.createElement('div')), { seed: 1, state: 'happy' });
    expect(layers(live)).toEqual(layers(brains.at(-1)!));
  });

  it('a base name is applied directly', () => {
    const bot = createBot(document.body.appendChild(document.createElement('div')));
    showState(bot, 'sleep');
    expect(brains.at(-1)!.resolver.base).toBe('SLEEP');
  });
});
