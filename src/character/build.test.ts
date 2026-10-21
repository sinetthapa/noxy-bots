// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import oldRig from './__fixtures__/nox-rig.svg?raw';
import { buildRig } from './build.ts';
import { parseSvg, type El } from './import.ts';
import { DEFAULT_LOOK, nox } from './nox/index.ts';
import type { Character, Group } from './types.ts';

const RENAME: Record<string, string> = { 'accent-l': 'bolt-l', 'accent-r': 'bolt-r', 'accent-l-glow': 'bolt-l-halo', 'accent-r-glow': 'bolt-r-halo' };
const SYMBOL_ORANGES = /^#(F6751A|FB711A|FC731B)$/i;

/** Today's rig as M1 should emit it: renamed ids, one symbol orange, no grad-ear-r. */
function expected(el: El): El {
  const attrs = { ...el.attrs };
  if (attrs.id) attrs.id = RENAME[attrs.id] ?? attrs.id;
  if (attrs.fill && SYMBOL_ORANGES.test(attrs.fill)) attrs.fill = '#FC721A';
  return { tag: el.tag, attrs, children: el.children.filter((c) => c.attrs.id !== 'grad-ear-r').map(expected) };
}

/** Same tags and attributes all the way down. The right side's contents are skipped: they are the mirrored left art, which the golden covers. */
function same(want: El, got: El, path: string): void {
  const here = `${path} > ${want.tag}${want.attrs.id ? `#${want.attrs.id}` : ''}`;
  expect(got.tag, here).toBe(want.tag);
  expect(got.attrs, here).toEqual(want.attrs);
  if (want.attrs.id === 'ear-r' || want.attrs.id === 'bolt-r') return;
  expect(got.children.length, here).toBe(want.children.length);
  want.children.forEach((c, i) => same(c, got.children[i], here));
}

describe('buildRig', () => {
  it("Classic in blur mode reproduces today's rig", () => {
    same(expected(parseSvg(oldRig)), parseSvg(buildRig(nox, DEFAULT_LOOK, { glow: 'blur' })), '');
  });

  it('has no transforms (the renderer owns them)', () => {
    for (const glow of ['halo', 'blur'] as const) {
      const rig = buildRig(nox, DEFAULT_LOOK, { glow });
      expect(rig).not.toMatch(/\stransform=/);
      expect(rig).not.toContain('matrix(');
    }
  });

  it('keeps the glow ids in both modes; only blur mode has the filter', () => {
    for (const glow of ['halo', 'blur'] as const) {
      const rig = buildRig(nox, DEFAULT_LOOK, { glow });
      for (const id of ['bolt-l-halo', 'bolt-r-halo', 'badge-glow', 'sym-bulb-glow']) expect(rig).toContain(`id="${id}"`);
      expect(rig.includes('soft-glow')).toBe(glow === 'blur');
      expect(rig.includes('<use')).toBe(glow === 'blur');
    }
  });

  it('"none" variants still emit their empty groups', () => {
    const rig = buildRig(nox, { ...DEFAULT_LOOK, ears: 'none', bolts: 'none' });
    for (const g of ['ear-l', 'ear-r']) expect(rig).toContain(`<g id="${g}"></g>`);
    expect(rig).toContain('<g id="bolt-l" fill="#FA6C2E"><g id="bolt-l-halo" fill="#FF8A4C" filter="url(#soft-glow)" opacity="0"></g></g>');
  });

  it('paints from the theme', () => {
    const rig = buildRig(nox, { ...DEFAULT_LOOK, theme: { base: { shell: '#336699', screen: '#000000', eye: '#00FF00', accent: '#FF0000', mouth: '#FFFFFF' } } });
    expect(rig).toContain('stop-color="#336699"');
    expect(rig).toContain('stroke="#00FF00"');
    expect(rig).not.toContain('#2EC7E6');
  });

  it('escapes attribute values, so art cannot add attributes', () => {
    const bad = (n: number) => `${n}" data-injected="x`;
    const ch: Character = structuredClone(nox);
    (ch.shared.find((n) => n.id === 'badge') as Group).children.push({
      tag: 'g',
      id: bad(1),
      attrs: { opacity: bad(2) },
      children: [{ tag: 'circle', id: bad(3), attrs: { r: bad(4) }, fill: { gradient: bad(5) } }],
    });
    ch.parts.body.find((b) => b.id === 'nox')!.gradients.push({ id: bad(5), kind: 'linear', attrs: { x1: bad(6) }, token: 'shell' });
    ch.themes.find((t) => t.id === 'classic')!.colors.eye = bad(7);
    const t = document.createElement('template');
    t.innerHTML = buildRig(ch, DEFAULT_LOOK);
    expect(t.content.querySelectorAll('svg').length).toBe(1);
    expect(t.content.querySelectorAll('[data-injected]').length).toBe(0);
    const g = [...t.content.querySelectorAll('g')].find((e) => e.getAttribute('id') === bad(1));
    expect(g?.getAttribute('opacity')).toBe(bad(2)); // the value survives as written
  });

  it('a group id named like an Object property is still a group', () => {
    const ch: Character = structuredClone(nox);
    (ch.shared.find((n) => n.id === 'badge') as Group).children.push({ tag: 'g', id: 'constructor', attrs: {}, children: [] });
    expect(buildRig(ch, DEFAULT_LOOK)).toContain('<g id="constructor"></g>');
  });
});

describe('id prefix', () => {
  it('goes in front of every id and every #id reference', () => {
    const plain = buildRig(nox, DEFAULT_LOOK);
    const rig = buildRig(nox, DEFAULT_LOOK, { prefix: 'nb7-' });
    const refs = (s: string) => [...s.matchAll(/ id="([^"]*)"|url\(#([^)]*)\)|href="#([^"]*)"/g)].map((m) => m[1] ?? m[2] ?? m[3]);
    expect(refs(rig).length).toBe(refs(plain).length);
    expect(refs(plain).length).toBeGreaterThan(50);
    for (const r of refs(rig)) expect(r).toMatch(/^nb7-/);
    expect(rig.replaceAll('nb7-', '')).toBe(plain);
  });

  it('two bots share no ids', () => {
    const ids = (s: string) => [...s.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]);
    const a = new Set(ids(buildRig(nox, DEFAULT_LOOK, { prefix: 'nb1-' })));
    expect(ids(buildRig(nox, DEFAULT_LOOK, { prefix: 'nb2-' })).filter((id) => a.has(id))).toEqual([]);
  });
});
