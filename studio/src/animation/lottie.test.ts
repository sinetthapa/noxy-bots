// @vitest-environment happy-dom
// The Lottie baker (M4 spec §6, §10.2). The replay test plays the Lottie back with a small evaluator (keyframes
// interpolated, nulls and groups composed) and holds it against the rig the renderer drew, at every frame.
import { DEFAULT_LOOK, NAMES, nox, PERSONALITIES, type EventName, type Look, type StateName } from 'noxy-bots';
import { buildRig } from 'noxy-src/character/build.ts';
import { describe, expect, it, vi } from 'vitest';
import type { Gaze } from '../state.ts';
import { apply, applyLinear, mul, parsePath, parseTransform, toTrs, trsMatrix, type Bezier, type Mat, type XY } from './geometry.ts';
import { bake, capture, check, color, exportLottie, haloRig, keep, lidMask, prop, type Item, type Lottie, type Prop, type Transform } from './lottie.ts';
import { record } from './record.ts';

const ID: Mat = [1, 0, 0, 1, 0, 0];
const clip = (state: StateName, event: EventName | null = null, gaze: Gaze = null) => record({ dials: PERSONALITIES.default, speed: 1, seed: 1, state, event, gaze });

// ── A Lottie player in miniature: linear and hold keyframes, transforms, layers ──
type V = number | number[] | Bezier;
const mix = (a: V, b: V, w: number): V => {
  if (typeof a === 'number') return a + ((b as number) - a) * w;
  if (Array.isArray(a)) return a.map((x, k) => x + ((b as number[])[k] - x) * w);
  const B = b as Bezier;
  const pts = (p: XY[], q: XY[]) => p.map((x, k) => mix(x, q[k], w) as XY);
  return { c: a.c, v: pts(a.v, B.v), i: pts(a.i, B.i), o: pts(a.o, B.o) };
};
function valueAt(p: Prop, t: number): V {
  if (p.a === 0) return p.k as V;
  const K = p.k;
  let j = 0;
  while (j + 1 < K.length && K[j + 1].t <= t) j++;
  const s = (k: number) => (K[k].s.length === 1 ? K[k].s[0] : K[k].s) as V;
  if (j === K.length - 1 || K[j].h || t <= K[j].t) return s(j);
  return mix(s(j), s(j + 1), (t - K[j].t) / (K[j + 1].t - K[j].t));
}
const num = (p: Prop, t: number) => valueAt(p, t) as number;
const vec = (p: Prop, t: number) => valueAt(p, t) as number[];
const trsAt = (tr: Transform, t: number): Mat => {
  const s = vec(tr.s, t);
  return trsMatrix({ p: vec(tr.p, t) as XY, r: num(tr.r, t), s: [s[0] / 100, s[1] / 100], a: vec(tr.a, t) as XY });
};

interface Hit {
  m: Mat; // the element's own space → the frame
  o: number; // 0–1
  items: Item[];
}
/** Each named shape group at frame t (the innermost of an element's groups), and each layer's mask in frame space. */
function play(l: Lottie, t: number) {
  const byInd = new Map(l.layers.map((x) => [x.ind, x]));
  const world = (ind: number | undefined): Mat => {
    if (ind === undefined) return ID;
    const x = byInd.get(ind)!;
    return mul(world(x.parent), trsAt(x.ks, t));
  };
  const hits = new Map<string, Hit>();
  const masks = new Map<string, { m: Mat; b: Bezier }>();
  const walk = (g: Extract<Item, { ty: 'gr' }>, m: Mat, o: number) => {
    const tr = g.it.at(-1) as Extract<Item, { ty: 'tr' }>;
    const [M, O] = [mul(m, trsAt(tr, t)), (o * num(tr.o, t)) / 100];
    hits.set(g.nm, { m: M, o: O, items: g.it });
    for (const c of g.it) if (c.ty === 'gr') walk(c, M, O);
  };
  for (const x of l.layers) {
    if (x.ty === 3) hits.set(x.nm, { m: world(x.ind), o: 1, items: [] }); // a carrier: nulls carry its transform only
    if (x.ty !== 4) continue;
    const m = world(x.ind);
    for (const g of x.shapes!) if (g.ty === 'gr') walk(g, m, num(x.ks.o, t) / 100);
    for (const k of x.masksProperties ?? []) masks.set(x.nm, { m, b: valueAt(k.pt, t) as Bezier });
  }
  return { hits, masks };
}

// ── The rig as drawn: each element's matrix to the frame and its opacity, composed down the tree ──
function rigAt(svg: Element) {
  const [vx, vy] = svg.getAttribute('viewBox')!.split(/\s+/).map(Number);
  const out = new Map<Element, { m: Mat; o: number }>();
  const walk = (el: Element, m: Mat, o: number) => {
    const t = el.getAttribute('transform');
    const M = t ? toTrs(parseTransform(t)).map(trsMatrix).reduce(mul, m) : m;
    const O = o * Number(el.getAttribute('opacity') ?? 1);
    out.set(el, { m: M, o: O });
    for (const c of el.children) if (c.tagName !== 'defs') walk(c, M, O);
  };
  walk(svg, [1, 0, 0, 1, -vx, -vy], 1);
  return out;
}
const inheritedAttr = (el: Element, a: string) => {
  for (let e: Element | null = el; e; e = e.parentElement) if (e.hasAttribute(a)) return e.getAttribute(a)!;
  return null;
};
/** The corners of a shape's box, in its own space. */
function corners(el: Element): XY[] {
  const n = (a: string) => Number(el.getAttribute(a) ?? 0);
  if (el.tagName === 'path') {
    const v = parsePath(el.getAttribute('d')!).flatMap((b) => b.v);
    const [x0, x1, y0, y1] = [Math.min(...v.map((q) => q[0])), Math.max(...v.map((q) => q[0])), Math.min(...v.map((q) => q[1])), Math.max(...v.map((q) => q[1]))];
    return [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
  }
  if (el.tagName === 'rect') return [[n('x'), n('y')], [n('x') + n('width'), n('y')], [n('x'), n('y') + n('height')], [n('x') + n('width'), n('y') + n('height')]];
  const [rx, ry] = el.tagName === 'circle' ? [n('r'), n('r')] : [n('rx'), n('ry')];
  return [[n('cx') - rx, n('cy') - ry], [n('cx') + rx, n('cy') - ry], [n('cx') - rx, n('cy') + ry], [n('cx') + rx, n('cy') + ry]];
}
const far = (p: XY, q: XY) => Math.hypot(p[0] - q[0], p[1] - q[1]);
/** The most any coordinate of a path (mapped by m) is off: keyframes are kept per coordinate, so that's the unit. */
const pathOff = (a: Bezier, b: Bezier, m: Mat = ID) => {
  expect(a.v.length).toBe(b.v.length);
  const off = (p: XY, q: XY) => Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]));
  let d = 0;
  for (let k = 0; k < a.v.length; k++) d = Math.max(d, off(apply(m, a.v[k]), b.v[k]), off(applyLinear(m, a.i[k]), b.i[k]), off(applyLinear(m, a.o[k]), b.o[k]));
  return d;
};

/**
 * Bakes a clip and replays it: every frame (and frame n, which must be frame 0 again) against the rig the renderer drew.
 * Returns the worst error of each kind, so a failure says what drifted.
 */
async function replay(state: StateName, event: EventName | null = null, look: Look = DEFAULT_LOOK, gaze: Gaze = null) {
  const frames = await clip(state, event, gaze);
  const l = bake(frames, look, 'x');
  const { svg, draw } = haloRig(look);
  const worst = { matrix: 0, opacity: 0, color: 0, path: 0, gradientPath: 0, size: 0, mask: 0, hold: 0, jumps: 0 };
  const up = (k: keyof typeof worst, v: number) => (worst[k] = Math.max(worst[k], v));
  const els = new Map([...svg.querySelectorAll('[id]')].map((e) => [e.id, e]));
  const lives: ReturnType<typeof rigAt>[] = [];
  const art0 = new Map<string, XY[]>();
  for (let i = 0; i <= frames.length; i++) {
    draw(frames[i % frames.length]);
    const live = rigAt(svg);
    lives.push(live);
    const { hits, masks } = play(l, i);
    const own = (el: Element): Mat => toTrs(parseTransform(el.getAttribute('transform') ?? '')).map(trsMatrix).reduce(mul, ID);
    /** The art an element draws, in its own space: the corners of every shape in it. Transforms are compared there. */
    const art = (el: Element): XY[] => (el.tagName === 'g' ? [...el.children].flatMap((c) => art(c).map((q) => apply(own(c), q))) : corners(el));
    for (const [id, el] of els) {
      if (el.closest('defs')) continue;
      if (i === 0) art0.set(id, art(el));
      const want = live.get(el)!;
      const got = hits.get(id);
      if (!got) {
        // Dropped: it must never show.
        expect(want.o === 0 || (el.tagName === 'circle' && Number(el.getAttribute('r')) === 0), `#${id} dropped but visible at frame ${i}`).toBe(true);
        continue;
      }
      for (const p of art(el)) up('matrix', far(apply(got.m, p), apply(want.m, p)));
      up('opacity', Math.abs(got.o - want.o));
      // Paint and geometry of a leaf: its own items, or those in its gradient group (mapped back).
      if (el.tagName === 'g') continue;
      const grad = got.items.find((x): x is Extract<Item, { ty: 'gr' }> => x.ty === 'gr' && x.nm === 'gradient');
      const items = grad ? [...got.items, ...grad.it] : got.items;
      const gm = grad ? trsAt(grad.it.at(-1) as Transform, i) : ID;
      for (const it of items) {
        if (it.ty === 'sh') {
          const rigPath = parsePath(el.getAttribute('d')!);
          const index = (grad?.it.includes(it) ? grad.it : got.items).filter((x) => x.ty === 'sh').indexOf(it);
          if (grad?.it.includes(it)) up('gradientPath', pathOff(valueAt(it.ks, i) as Bezier, rigPath[index], gm));
          else up('path', pathOff(valueAt(it.ks, i) as Bezier, rigPath[index]));
        }
        if (it.ty === 'el' && !grad?.it.includes(it) && el.tagName === 'circle') up('size', Math.abs(vec(it.s, i)[0] - 2 * Number(el.getAttribute('r'))));
        if (it.ty === 'rc') {
          const [x, y, w, h, rx] = ['x', 'y', 'width', 'height', 'rx'].map((k) => Number(el.getAttribute(k) ?? 0));
          const [c, s] = [vec(it.p, i), vec(it.s, i)];
          [c[0] - (x + w / 2), c[1] - (y + h / 2), s[0] - w, s[1] - h, num(it.r, i) - rx].forEach((d) => up('size', Math.abs(d)));
        }
        if (it.ty === 'gf' && it.t === 1) {
          const g = els.get(/^url\(#([^)]+)\)$/.exec(inheritedAttr(el, 'fill')!)![1])!;
          const end = (a: string, b: string) => apply(gm, [Number(g.getAttribute(a)), Number(g.getAttribute(b))]);
          const got = [...vec(it.s, i), ...vec(it.e, i)];
          [...end('x1', 'y1'), ...end('x2', 'y2')].forEach((v, k) => up('path', Math.abs(v - got[k])));
        }
        if (it.ty === 'fl' || it.ty === 'st') {
          const paint = inheritedAttr(el, it.ty === 'fl' ? 'fill' : 'stroke') ?? 'black';
          if (paint === 'none') expect(num(it.o, i), `#${id} ${it.ty} shows 'none' at frame ${i}`).toBe(0);
          else {
            expect(num(it.o, i)).toBe(100);
            const c = vec(it.c, i);
            color(paint).forEach((v, k) => up('color', Math.abs(c[k] - v)));
          }
          if (it.ty === 'st') up('size', Math.abs(num(it.w, i) - Number(inheritedAttr(el, 'stroke-width') ?? 1)));
        }
      }
    }
    for (const side of ['l', 'r']) {
      const got = masks.get(`eye-${side}-shape`)!;
      const want = lidMask(parsePath(els.get(`clip-eye-${side}-path`)!.getAttribute('d')!)[0]);
      up('mask', pathOff(got.b, want));
      // The mask is in the eye's space: the layer's matrix is the eye's, at the mask's own points.
      const eye = live.get(els.get(`eye-${side}`)!)!.m;
      for (const p of want.v) up('matrix', far(apply(got.m, p), apply(eye, p)));
    }
  }
  // A jump (spec §6.5): an element's step over 10 px and over 10 × the steps either side. Half a frame later it hasn't moved.
  for (const [id, pts] of art0) {
    const at = (i: number, p: XY) => apply(lives[i].get(els.get(id)!)!.m, p);
    const step = Array.from({ length: frames.length }, (_, i) => Math.max(...pts.map((p) => far(at(i, p), at(i + 1, p)))));
    step.forEach((d, i) => {
      if (!(d > 10 && d > 10 * (step[i - 1] ?? 0) && d > 10 * (step[i + 1] ?? 0))) return;
      const got = play(l, i + 0.5).hits.get(id);
      if (!got) return; // dropped: it never shows
      worst.jumps++;
      for (const p of pts) up('hold', far(apply(got.m, p), at(i, p)));
    });
  }
  return worst;
}

const CUSTOM = { shell: '#123456', screen: '#0a0b0c', eye: '#ff3300', accent: '#00ff99', mouth: '#fafafa' };
const STATES = [...NAMES.base, ...NAMES.activity, ...NAMES.emotion];

describe('keyframes', () => {
  it('keeps the ends and the turns, and drops what a straight line gives back', () => {
    expect(keep([[0], [1], [2], [3], [2], [1]], 0.01)).toEqual([0, 3, 5]);
    expect(keep([[0], [1.004], [2]], 0.005)).toEqual([0, 2]);
    expect(keep([[0], [1.006], [2]], 0.005)).toEqual([0, 1, 2]);
    expect(keep([[0, 0], [1, 0], [2, 1]], 0.01)).toEqual([0, 1, 2]); // every channel counts
  });

  it('writes a still value once, linear keyframes with the last plain, and holds at each change', () => {
    const out = (f: number[]) => f[0];
    expect(prop([[3], [3], [3]], 0.1, out, (f) => f)).toEqual({ a: 0, k: 3 });
    expect(prop([[0], [5], [10]], 0.1, out, (f) => f)).toEqual({
      a: 1,
      k: [{ t: 0, s: [0], i: { x: [1], y: [1] }, o: { x: [0], y: [0] } }, { t: 2, s: [10] }],
    });
    expect(prop([[0], [0], [100], [100], [0]], 0, out, (f) => f, true)).toEqual({
      a: 1,
      k: [{ t: 0, s: [0], h: 1 }, { t: 2, s: [100], h: 1 }, { t: 4, s: [0] }],
    });
  });

  it('holds at a jump, and never draws a line across it', () => {
    const out = (f: number[]) => f[0];
    const lin = { i: { x: [1], y: [1] }, o: { x: [0], y: [0] } };
    const F = [0, 1, 2, 3, 50, 51, 52].map((v) => [v]);
    expect(keep(F, 0.01)).toEqual([0, 3, 4, 6]);
    expect(prop(F, 0.01, out, (f) => f)).toEqual({
      a: 1,
      k: [{ t: 0, s: [0], ...lin }, { t: 3, s: [3], h: 1 }, { t: 4, s: [50], ...lin }, { t: 6, s: [52] }],
    });
    // A fast ramp isn't a jump (the next step is as big), nor is a step under 20 × tol.
    expect(prop([0, 0.1, 5, 10, 10.1].map((v) => [v]), 0.01, out, (f) => f).k).not.toContainEqual(expect.objectContaining({ h: 1 }));
    expect(prop([0, 0, 0.1, 0.1].map((v) => [v]), 0.01, out, (f) => f).k).not.toContainEqual(expect.objectContaining({ h: 1 }));
  });

  it('reads the colours the rig and the studio write, and names any other', () => {
    expect(color('#ff8000')).toEqual([1, 128 / 255, 0, 1]);
    expect(color('#F80')).toEqual([1, 136 / 255, 0, 1]);
    expect(color('rgb(255, 0, 51)')).toEqual([1, 0, 0.2, 1]);
    expect(() => color('hsl(0 0% 0%)')).toThrow(/can't read the colour "hsl/);
    expect(() => color('url(#x)')).toThrow(/can't read the colour/);
  });
});

describe('what the baker reads', () => {
  it('throws on a filter, a <use> or an attribute it has no mapping for, naming it', () => {
    const doc = (s: string) => new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${s}</svg>`, 'image/svg+xml').documentElement;
    expect(() => check(doc('<g filter="url(#f)"/>'))).toThrow("the Lottie baker can't export filter on <g>");
    expect(() => check(doc('<use href="#a"/>'))).toThrow("the Lottie baker can't export <use>");
    expect(() => check(doc('<filter id="f"/>'))).toThrow("the Lottie baker can't export <filter>");
    const blur = new DOMParser().parseFromString(buildRig(nox, DEFAULT_LOOK, { glow: 'blur' }), 'image/svg+xml').documentElement;
    expect(() => check(blur)).toThrow(/filter/); // the live bot's glow
  });

  /** A one-path rig with a gradient stop, and capture over 3 frames of `draw(i, path, stop)`. */
  const run = (draw: (i: number, p: Element, s: Element) => unknown) => {
    const svg = new DOMParser().parseFromString(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><path id="p" d="M0 0L1 1" opacity="1" fill-rule="evenodd"/></svg>',
      'image/svg+xml',
    ).documentElement;
    const [p, s] = ['path', 'stop'].map((t) => svg.querySelector(t)!);
    return capture(svg, (i) => draw(i, p, s), 3).get(p);
  };

  it('throws when the renderer writes an attribute the baker would drop, or writes one only after frame 0', () => {
    expect(() => run((i, p) => i && p.setAttribute('clip-rule', 'evenodd'))).toThrow("the Lottie baker can't animate clip-rule on <path>");
    expect(() => run((i, p) => i && p.setAttribute('fill', 'red'))).toThrow('fill on #p is first written after frame 0');
    expect(() => run((_, p) => p.setAttribute('mask', 'url(#m)'))).toThrow("the Lottie baker can't export mask on <path>"); // frame 0 only
    expect(run((i, p) => p.setAttribute('opacity', String(i / 10)))!.get('opacity')).toEqual(['0', '0.1', '0.2', '0']); // and frame 0 again
  });

  it('throws when the renderer animates an attribute the baker reads once, naming it', () => {
    expect(() => run((i, _, s) => i && s.setAttribute('stop-color', '#000'))).toThrow("the Lottie baker can't animate stop-color on <stop>");
    expect(() => run((i, p) => i && p.setAttribute('fill-rule', 'nonzero'))).toThrow("the Lottie baker can't animate fill-rule on <path>");
  });

  it('throws when an animated path gains a subpath after frame 0', async () => {
    const frames = await clip('speaking');
    const set = Element.prototype.setAttribute;
    const first = new Map<Element, string>();
    // The mouth's outline, from its second distinct value on, with another subpath.
    const spy = vi.spyOn(Element.prototype, 'setAttribute').mockImplementation(function (this: Element, name: string, value: string) {
      if (name === 'd' && this.id === 'mouth-shape') {
        if (!first.has(this)) first.set(this, value);
        if (value !== first.get(this)) value += 'M0 0L1 1';
      }
      set.call(this, name, value);
    });
    try {
      expect(() => bake(frames, DEFAULT_LOOK, 'x')).toThrow('an animated path changes its number of subpaths');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('bake', () => {
  it('is a transparent 60 fps Lottie the size of the rig, with a null for each shared transform and a masked layer per eye', async () => {
    const frames = await clip('idle');
    const l = bake(frames, DEFAULT_LOOK, 'noxy-idle');
    expect([l.v, l.fr, l.ip, l.op, l.w, l.h, l.nm, l.assets]).toEqual(['5.12.0', 60, 0, frames.length, 985, 830, 'noxy-idle', []]);
    const nulls = l.layers.filter((x) => x.ty === 3).map((x) => x.nm);
    expect(nulls).toEqual(['frame', 'nox', 'body', 'body', 'face', 'eye-l', 'eye-r']);
    expect(l.layers.filter((x) => x.ty === 3).every((x) => x.ks.o.a === 0 && x.ks.o.k === 0)).toBe(true);
    const content = l.layers.filter((x) => x.ty === 4);
    // Lottie draws the first layer on top: the rig's paint order, reversed.
    // Idle never shows the glyphs, the loader or the mouth, so their layers aren't there.
    expect(content.map((x) => x.nm).reverse()).toEqual(['shadow', 'bolt-l bolt-r ear-l ear-r head-shell', 'face-screen', 'eye-l-shape', 'eye-r-shape', 'symbols badge']);
    const masked = content.filter((x) => x.hasMask);
    expect(masked.map((x) => x.nm)).toEqual(['eye-r-shape', 'eye-l-shape']);
    for (const x of masked) {
      expect(x.masksProperties).toHaveLength(1);
      expect(x.masksProperties![0]).toMatchObject({ mode: 'a', inv: false, nm: 'lids' });
      expect(x.shapes!.map((s) => (s as { nm: string }).nm)).toEqual([x.nm, 'cover']); // the lottie-web stroke fix
    }
    // Parents: each layer hangs off the deepest null its content shares.
    const name = new Map(l.layers.map((x) => [x.ind, x.nm]));
    const parentOf = (nm: string) => name.get(content.find((x) => x.nm === nm)!.parent!);
    expect(['shadow', 'symbols badge', 'bolt-l bolt-r ear-l ear-r head-shell', 'face-screen', 'eye-l-shape'].map(parentOf)).toEqual(['frame', 'nox', 'body', 'face', 'eye-l']);
  });

  // Clips that use every part of the rig: lids, glyphs, the mouth's fills, the Zzz, the loader, the bulb, the badge, other
  // parts, custom colours, the size sliders at their ends, and a gaze set on the board.
  const CLIPS: [StateName, EventName | null, Partial<Look>?, Gaze?][] = [
    ['idle', null],
    ['speaking', null],
    ['sad', null],
    ['dizzy', null],
    ['love', null],
    ['sleep', null],
    ['processing', null],
    ['thinking', null, { body: 'box', ears: 'antenna', eyes: 'round', theme: 'mint' }],
    ['idle', 'idea'],
    ['speaking', null, { theme: { base: CUSTOM } }],
    ['idle', null, { sizes: { eye: 1.3, eyeSpacing: 0.7, ear: 1.3, bolt: 0.7 } }],
    ['speaking', null, undefined, { x: 0.8, y: -0.6 }],
  ];
  for (const [state, event, look, gaze] of CLIPS)
    it(`plays back like the rig: ${event ?? state}${look ? ` ${JSON.stringify(look)}` : ''}${gaze ? ` gaze ${JSON.stringify(gaze)}` : ''}`, async () => {
      const worst = await replay(state, event, { ...DEFAULT_LOOK, ...look }, gaze);
      expect(worst.matrix).toBeLessThan(0.5);
      expect(worst.opacity).toBeLessThan(0.011);
      expect(worst.color).toBeLessThan(1 / 255 + 0.001);
      expect(worst.path).toBeLessThan(0.056); // TOL.px, plus rounding to 2 decimals
      expect(worst.gradientPath).toBeLessThan(0.5);
      expect(worst.size).toBeLessThan(0.056);
      expect(worst.mask).toBeLessThan(0.056);
      expect(worst.hold).toBeLessThan(0.5);
      if (state === 'sleep') expect(worst.jumps).toBeGreaterThan(0); // a Zzz wraps to the start of its path
    }, 60_000);
});

describe('the eyelid mask', () => {
  const cubic = (a: number, b: number, c: number, d: number, t: number) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d;
  it('passes through every upper lid sample, and every lower one the renderer left unclamped, in every state', async () => {
    let worst = 0;
    for (const state of STATES) {
      const { svg, draw } = haloRig(DEFAULT_LOOK);
      const clips = ['l', 'r'].map((s) => svg.querySelector(`[id="clip-eye-${s}-path"]`)!);
      for (const f of await clip(state)) {
        draw(f);
        for (const c of clips) {
          const poly = parsePath(c.getAttribute('d')!)[0];
          const m = lidMask(poly);
          const n = poly.v.length / 2;
          const [up, lo] = [poly.v.slice(0, n), poly.v.slice(n).reverse()];
          const free = lo.filter((p, k) => p[1] !== up[k][1]).length;
          for (let k = 0; k < n; k++) {
            const t = k / (n - 1);
            worst = Math.max(worst, Math.abs(cubic(m.v[0][1], m.v[0][1] + m.o[0][1], m.v[1][1] + m.i[1][1], m.v[1][1], t) - up[k][1]));
            if (free >= 3 && lo[k][1] !== up[k][1])
              worst = Math.max(worst, Math.abs(cubic(m.v[2][1], m.v[2][1] + m.o[2][1], m.v[3][1] + m.i[3][1], m.v[3][1], 1 - t) - lo[k][1]));
          }
          if (free < 3) expect([m.v[3], m.v[2]]).toEqual([m.v[0], m.v[1]]); // shut: the lower edge is the upper
        }
      }
    }
    expect(worst).toBeLessThan(0.02); // the polygon's own rounding to 2 decimals
  }, 120_000);

  it("throws on a clip that isn't a lid polygon", () => {
    expect(() => lidMask(parsePath('M0 0L10 0L10 10L0 10Z')[0])).toThrow('the eye clip is not a lid polygon');
  });
});

describe('every clip and look', () => {
  it('bakes every state and event under 400 KB, and the idle loop under the 300 KB target', async () => {
    const sizes: Record<string, number> = {};
    for (const state of STATES) sizes[state] = JSON.stringify(bake(await clip(state), DEFAULT_LOOK, 'x')).length;
    for (const event of NAMES.event) sizes[event] = JSON.stringify(bake(await clip('idle', event), DEFAULT_LOOK, 'x')).length;
    console.log(Object.entries(sizes).map(([k, v]) => `${k} ${Math.round(v / 1024)} KB`).join(', '));
    for (const v of Object.values(sizes)) expect(v).toBeLessThan(400 * 1024);
    expect(sizes.idle).toBeLessThan(300 * 1024);
  }, 300_000);

  it('bakes every part combination in every theme, and custom colours', async () => {
    const frames = await clip('idle');
    const { body, ears, eyes, bolts } = nox.parts;
    let n = 0;
    for (const theme of [...nox.themes.map((t) => t.id), { base: CUSTOM }])
      for (const b of body) for (const e of ears) for (const y of eyes) for (const o of bolts) {
        expect(() => bake(frames, { ...DEFAULT_LOOK, body: b.id, ears: e.id, eyes: y.id, bolts: o.id, theme }, 'x')).not.toThrow();
        n++;
      }
    expect(n).toBe(144); // 24 combinations × 6
  }, 300_000);

  it('bakes a slow clip: speed 0.1 is ten times the frames, and still under 400 KB', async () => {
    const frames = await record({ dials: PERSONALITIES.default, speed: 0.1, seed: 1, state: 'processing', event: null, gaze: null });
    expect(frames.length).toBe(4800);
    expect(JSON.stringify(bake(frames, DEFAULT_LOOK, 'x')).length).toBeLessThan(400 * 1024);
  }, 60_000);

  it('gives the same bytes for the same settings', async () => {
    const once = async () => JSON.stringify(bake(await clip('dizzy'), DEFAULT_LOOK, 'noxy-dizzy'));
    expect(await once()).toBe(await once());
  }, 60_000);
});

describe('exportLottie', () => {
  const req = { look: DEFAULT_LOOK, dials: PERSONALITIES.default, speed: 1, seed: 1, state: 'idle' as const, event: 'success' as const, gaze: null };

  it('records and bakes the clip into a JSON file named for it, reporting 50 % then 100 %', async () => {
    const seen: number[] = [];
    const blob = await exportLottie(req, new AbortController().signal, (d) => seen.push(d));
    expect(blob.type).toBe('application/json');
    expect(JSON.parse(await blob.text())).toMatchObject({ v: '5.12.0', nm: 'noxy-success', fr: 60 });
    expect(seen).toEqual([0.5, 1]);
  });

  it('a cancel after recording stops it before the bake', async () => {
    const ac = new AbortController();
    const seen: number[] = [];
    await expect(exportLottie(req, ac.signal, (d) => (seen.push(d), ac.abort()))).rejects.toThrow();
    expect(seen).toEqual([0.5]);
  });

  it('a cancel clicked during the bake still stops it', async () => {
    const ac = new AbortController();
    const seen: number[] = [];
    // A click during the bake is a task queued behind it. This one is queued just before the bake starts, and runs after it.
    await expect(exportLottie(req, ac.signal, (d) => (seen.push(d), setTimeout(() => setTimeout(() => ac.abort()))))).rejects.toThrow();
    expect(seen).toEqual([0.5]);
  });
});
