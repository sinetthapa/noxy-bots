// The Lottie baker (M4 spec §6): the recorded poses drawn on the halo rig, every attribute the renderer writes noted
// per frame, and the rig mapped to Lottie layers, shape groups and keyframes. Transparent, 60 fps, one loop or clip.
import type { Pose } from 'noxy-src/brain/pose.ts';
import { DEFAULT_TUNING } from 'noxy-src/brain/tuning.ts';
import { buildRig } from 'noxy-src/character/build.ts';
import { resolveLook } from 'noxy-src/character/look.ts';
import { nox } from 'noxy-src/character/nox/index.ts';
import type { Look } from 'noxy-src/character/types.ts';
import { createSvgRenderer } from 'noxy-src/render/svg.ts';
import { apply, invert, mapBezier, parsePath, parseTransform, toTrs, trsMatrix, type Bezier, type Trs, type XY } from './geometry.ts';
import { pause, record, type ClipSpec } from './record.ts';

// ── The Lottie format: only what the baker writes (spec §8) ──
interface Ease {
  x: number[];
  y: number[];
}
export interface Keyframe {
  t: number;
  s: unknown[];
  h?: 1;
  i?: Ease;
  o?: Ease;
}
export type Prop = { a: 0; k: unknown } | { a: 1; k: Keyframe[] };
export interface Transform {
  a: Prop;
  p: Prop;
  s: Prop;
  r: Prop;
  o: Prop;
}
export type Item =
  | { ty: 'gr'; nm: string; it: Item[] }
  | { ty: 'sh'; ks: Prop }
  | { ty: 'rc'; p: Prop; s: Prop; r: Prop }
  | { ty: 'el'; p: Prop; s: Prop }
  | { ty: 'fl'; c: Prop; o: Prop; r: 1 | 2 }
  | { ty: 'gf'; t: 1 | 2; s: Prop; e: Prop; g: { p: number; k: Prop }; o: Prop; r: 1 | 2; h: Prop; a: Prop }
  | { ty: 'st'; c: Prop; o: Prop; w: Prop; lc: 1 | 2 | 3; lj: 1 | 2 | 3; ml: number; d?: { n: 'd' | 'g' | 'o'; nm: string; v: Prop }[] }
  | ({ ty: 'tr' } & Transform);
export interface Mask {
  inv: false;
  mode: 'a';
  pt: Prop;
  o: Prop;
  x: Prop;
  nm: string;
}
export interface Layer {
  ddd: 0;
  ind: number;
  ty: 3 | 4; // null, shape
  nm: string;
  parent?: number;
  sr: 1;
  ks: Transform;
  ao: 0;
  ip: 0;
  op: number;
  st: 0;
  bm: 0;
  shapes?: Item[];
  hasMask?: true;
  masksProperties?: Mask[];
}
export interface Lottie {
  v: '5.12.0';
  fr: 60;
  ip: 0;
  op: number;
  w: number;
  h: number;
  nm: string;
  ddd: 0;
  assets: [];
  layers: Layer[];
}

// ── Keyframes (spec §6.5) ──
/** The most a dropped keyframe may be off, in the units the Lottie stores (scale and opacity are percentages). */
export const TOL = { px: 0.05, deg: 0.01, scale: 0.03, opacity: 0.5, color: 1 / 255 } as const;
const LINEAR = { i: { x: [1], y: [1] }, o: { x: [0], y: [0] } };
const r2 = (v: number) => Math.round(v * 100) / 100 + 0; // + 0 turns -0 into 0
const r3 = (v: number) => Math.round(v * 1000) / 1000 + 0;
const same = (a: number[], b: number[]) => a.every((v, k) => v === b[k]);

/** The steps k → k+1 that jump (spec §6.5): over 10 × the step before and after, and over 20 × tol. The size is the biggest change of any channel. */
function jumps(F: number[][], tol: number): Set<number> {
  const size = F.slice(1).map((f, k) => Math.max(...f.map((v, c) => Math.abs(v - F[k][c]))));
  return new Set(size.flatMap((d, k) => (d > 20 * tol && d > 10 * (size[k - 1] ?? 0) && d > 10 * (size[k + 1] ?? 0) ? [k] : [])));
}

/** The frames to keep: a frame goes when a straight line between the kept frames around it gives it within tol. Never across a jump. */
export function keep(F: number[][], tol: number, jump = jumps(F, tol)): number[] {
  const fits = (a: number, b: number) => {
    for (let k = a; k < b; k++) if (jump.has(k)) return false;
    for (let k = a + 1; k < b; k++) {
      const w = (k - a) / (b - a);
      for (let c = 0; c < F[a].length; c++) if (Math.abs(F[a][c] + (F[b][c] - F[a][c]) * w - F[k][c]) > tol) return false;
    }
    return true;
  };
  const kept = [0];
  for (let a = 0; a < F.length - 1; ) {
    let b = a + 1;
    while (b + 1 < F.length && fits(a, b + 1)) b++;
    kept.push(b);
    a = b;
  }
  return kept;
}

/**
 * A property from rounded numbers per frame (one row = one value for all). `out` turns a row into the static value,
 * `key` into a keyframe's `s`. `hold` = steps at each change (values that switch), else straight lines, held at each jump.
 */
export function prop(F: number[][], tol: number, out: (v: number[]) => unknown, key: (v: number[]) => unknown[], hold = false): Prop {
  if (F.every((f) => same(f, F[0]))) return { a: 0, k: out(F[0]) };
  const jump = jumps(F, tol);
  const kept = hold ? F.flatMap((f, k) => (k === 0 || k === F.length - 1 || !same(f, F[k - 1]) ? [k] : [])) : keep(F, tol, jump);
  return {
    a: 1,
    k: kept.map((k, j): Keyframe => (j === kept.length - 1 ? { t: k, s: key(F[k]) } : hold || jump.has(k) ? { t: k, s: key(F[k]), h: 1 } : { t: k, s: key(F[k]), ...LINEAR })),
  };
}
const scalar = (v: number[], tol: number, hold = false) => prop(v.map((x) => [r2(x)]), tol, (f) => f[0], (f) => f, hold);
const vector = (v: number[][], tol: number, round = r2) => prop(v.map((x) => x.map(round)), tol, (f) => f, (f) => f);
const still = (k: unknown): Prop => ({ a: 0, k });
const roundBezier = (b: Bezier): Bezier => ({ c: b.c, v: b.v.map((q) => q.map(r2) as XY), i: b.i.map((q) => q.map(r2) as XY), o: b.o.map((q) => q.map(r2) as XY) });
function bezierProp(B: Bezier[]): Prop {
  const n = B[0].v.length;
  if (B.some((b) => b.v.length !== n || b.c !== B[0].c)) throw new Error('an animated path changes its number of points');
  const flat = (b: Bezier) => [b.v, b.i, b.o].flatMap((q) => q.flatMap(([x, y]) => [r2(x), r2(y)]));
  const pairs = (f: number[], from: number) => Array.from({ length: n }, (_, k): XY => [f[from + 2 * k], f[from + 2 * k + 1]]);
  const shape = (f: number[]): Bezier => ({ c: B[0].c, v: pairs(f, 0), i: pairs(f, 2 * n), o: pairs(f, 4 * n) });
  return prop(B.map(flat), TOL.px, shape, (f) => [shape(f)]);
}

/** #rgb, #rrggbb or rgb(r, g, b) → [r, g, b, 1] in 0–1. */
export function color(c: string): number[] {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((x) => x + x).join('') : hex[1];
    return [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16) / 255).concat(1);
  }
  const rgb = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(c);
  if (rgb) return rgb.slice(1, 4).map((x) => Number(x) / 255).concat(1);
  throw new Error(`the Lottie baker can't read the colour "${c}"`);
}

// ── What the baker reads (spec §6.2): any other element or attribute throws, naming it ──
const STYLE = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'fill-rule'];
const SHAPE = ['id', 'transform', 'opacity', 'clip-path', 'clip-rule', ...STYLE];
const READS: Record<string, string[]> = {
  svg: ['xmlns', 'viewBox', ...STYLE],
  defs: [],
  g: ['id', 'transform', 'opacity', ...STYLE],
  path: [...SHAPE, 'd'],
  rect: [...SHAPE, 'x', 'y', 'width', 'height', 'rx', 'ry'],
  circle: [...SHAPE, 'cx', 'cy', 'r'],
  ellipse: [...SHAPE, 'cx', 'cy', 'rx', 'ry'],
  linearGradient: ['id', 'x1', 'y1', 'x2', 'y2', 'gradientUnits'],
  radialGradient: ['id', 'cx', 'cy', 'r', 'gradientUnits', 'gradientTransform'],
  stop: ['offset', 'stop-color', 'stop-opacity'],
  clipPath: ['id', 'clipPathUnits'],
};
/** What `build` maps per frame: the renderer may change these after frame 0. It reads every other attribute once, so a change would freeze. */
const ANIMATED = ['transform', 'opacity', 'fill', 'stroke', 'stroke-width', 'd', 'r', 'x1', 'y1', 'x2', 'y2'];

/** Throws on any element or attribute the baker can't map. */
export function check(el: Element): void {
  const ok = READS[el.tagName];
  if (!ok) throw new Error(`the Lottie baker can't export <${el.tagName}>`);
  for (const a of el.getAttributeNames()) if (!ok.includes(a)) throw new Error(`the Lottie baker can't export ${a} on <${el.tagName}>`);
  for (const c of el.children) check(c);
}

type Tracks = Map<Element, Map<string, string[]>>;

/**
 * Draws every frame and notes each attribute the renderer changes after frame 0 (spec §6.2): one value per frame, then
 * frame 0's again, so the last keyframe meets the loop's start. The renderer writes everything on its first draw.
 * A change to any attribute outside ANIMATED throws: the baker reads it once.
 */
export function capture(svg: Element, draw: (i: number) => void, n: number): Tracks {
  draw(0);
  check(svg); // after the first draw, so what the renderer adds is checked too
  const tracks: Tracks = new Map();
  const changed: [Element, string][] = [];
  const start = new Map<Element, Map<string, string>>();
  for (const el of [svg, ...svg.querySelectorAll('*')]) {
    start.set(el, new Map(el.getAttributeNames().map((a) => [a, el.getAttribute(a)!])));
    const set = el.setAttribute.bind(el);
    el.setAttribute = (a: string, v: string) => {
      if (!tracks.get(el)?.has(a)) changed.push([el, a]);
      set(a, v);
    };
  }
  for (let i = 1; i <= n; i++) {
    if (i < n) draw(i);
    for (const [el, a] of changed.splice(0)) {
      if (!ANIMATED.includes(a)) throw new Error(`the Lottie baker can't animate ${a} on <${el.tagName}>`);
      const was = start.get(el)!.get(a);
      if (was === undefined) throw new Error(`${a} on #${el.id} is first written after frame 0`);
      if (!tracks.has(el)) tracks.set(el, new Map());
      if (!tracks.get(el)!.has(a)) tracks.get(el)!.set(a, Array<string>(i).fill(was));
    }
    for (const [el, m] of tracks) for (const [a, v] of m) v.push(i < n ? el.getAttribute(a)! : v[0]);
  }
  return tracks;
}

/** The halo rig (Q6), detached, and a renderer that draws a pose on it: what the baker reads and the check page shows. */
export function haloRig(look: Look): { svg: SVGSVGElement; draw: (pose: Pose) => void } {
  const svg = new DOMParser().parseFromString(buildRig(nox, look, { glow: 'halo' }), 'image/svg+xml').documentElement as unknown as SVGSVGElement;
  const renderer = createSvgRenderer(svg, resolveLook(nox, look), DEFAULT_TUNING);
  return { svg, draw: (pose) => renderer.draw(pose) };
}

/** Bakes poses (spec §4) into a Lottie of the look (spec §6); `name` is its `nm`. */
export function bake(frames: Pose[], look: Look, name: string): Lottie {
  const { svg, draw } = haloRig(look);
  return build(svg, capture(svg, (i) => draw(frames[i]), frames.length), frames.length, name);
}

function build(svg: Element, tracks: Tracks, n: number, name: string): Lottie {
  const F = n + 1; // values per track: each frame, then frame 0 again
  type Val = string | string[];
  const val = (el: Element, a: string): Val | null => tracks.get(el)?.get(a) ?? el.getAttribute(a);
  /** One result per frame when any input is animated, else one for all. */
  const per = <T>(vals: (Val | null)[], fn: (...v: (string | null)[]) => T): T[] =>
    Array.from({ length: vals.some(Array.isArray) ? F : 1 }, (_, i) => fn(...vals.map((v) => (Array.isArray(v) ? v[i] : v))));
  const num = (el: Element, a: string, d = 0): number => {
    if (tracks.get(el)?.has(a)) throw new Error(`the Lottie baker can't animate ${a} on <${el.tagName}>`);
    const v = el.getAttribute(a);
    const x = v === null ? d : Number(v);
    if (!Number.isFinite(x)) throw new Error(`${a}="${v}" on <${el.tagName}> isn't a number`);
    return x;
  };
  /** An inherited presentation attribute: the element's own, else its nearest ancestor's. */
  const inherited = (el: Element, a: string): Val | null => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      const v = val(e, a);
      if (v !== null) return v;
    }
    return null;
  };
  const byUrl = (url: string): Element => {
    const id = /^url\(#([^)]+)\)$/.exec(url)?.[1];
    const el = id ? [...svg.querySelectorAll('[id]')].find((e) => e.id === id) : undefined;
    if (!el) throw new Error(`nothing in the rig has the id in ${url}`);
    return el;
  };
  const zero = (v: Val | null) => v !== null && [v].flat().every((x) => Number(x) === 0);
  /** Never visible: an opacity of 0 throughout, or a circle with no radius. It goes, with everything in it. */
  const hidden = (el: Element) => zero(val(el, 'opacity')) || (el.tagName === 'circle' && zero(val(el, 'r')));

  // ── Transforms (spec §6.3): an element's list as Lottie transforms, each one value per frame or one for all ──
  const IDENT: Trs = { p: [0, 0], r: 0, s: [1, 1], a: [0, 0] };
  const trsOf = (el: Element): Trs[][] => {
    const t = val(el, 'transform');
    if (t === null) return [];
    const runs = per([t], (s) => toTrs(parseTransform(s!)));
    if (runs.some((x) => x.length !== runs[0].length)) throw new Error(`the transform of #${el.id} changes form`);
    return runs[0].map((_, j) => runs.map((x) => x[j]));
  };
  const opacityOf = (el: Element) => {
    const o = val(el, 'opacity');
    return o === null ? still(100) : scalar(per([o], (s) => Number(s) * 100), TOL.opacity);
  };
  /** Rotations unwrap, so a spinning glyph keeps turning the same way. */
  const transform = (T: Trs[], o: Prop = still(100)): Transform => {
    const r = T.map((t) => t.r);
    for (let k = 1; k < r.length; k++) r[k] = r[k - 1] + (((((r[k] - r[k - 1]) % 360) + 540) % 360) - 180);
    return {
      a: vector(T.map((t) => t.a), TOL.px),
      p: vector(T.map((t) => t.p), TOL.px),
      s: vector(T.map((t) => [t.s[0] * 100, t.s[1] * 100]), TOL.scale),
      r: scalar(r, TOL.deg),
      o,
    };
  };
  /** Content in one group per Lottie transform, outermost first, with the element's opacity on the outermost. */
  const wrap = (nm: string, content: Item[], T: Trs[][], o: Prop): Item => {
    const runs = T.length ? T : [[IDENT]];
    let g: Item = { ty: 'gr', nm, it: [...content, { ty: 'tr', ...transform(runs[runs.length - 1], runs.length === 1 ? o : still(100)) }] };
    for (let j = runs.length - 2; j >= 0; j--) g = { ty: 'gr', nm, it: [g, { ty: 'tr', ...transform(runs[j], j === 0 ? o : still(100)) }] };
    return g;
  };

  // ── Paint (spec §6.3) ──
  /** A flat colour: frames of 'none' keep the last colour and step the opacity to 0. Null when it's never painted. */
  const paint = (v: Val) => {
    const c = per([v], (s) => s!);
    if (c.every((s) => s === 'none')) return null;
    let last = c.find((s) => s !== 'none')!;
    return {
      c: vector(c.map((s) => color(s === 'none' ? last : (last = s))), TOL.color, r3),
      o: scalar(c.map((s) => (s === 'none' ? 0 : 100)), 0, true),
    };
  };
  const stops = (g: Element) => {
    const all = [...g.children].map((s) => ({ at: num(s, 'offset'), c: color(s.getAttribute('stop-color') ?? '#000000'), a: num(s, 'stop-opacity', 1) }));
    const k = all.flatMap((s) => [s.at, ...s.c.slice(0, 3).map(r3)]);
    if (all.some((s) => s.a !== 1)) k.push(...all.flatMap((s) => [s.at, s.a]));
    return { p: all.length, k: still(k) };
  };
  const CAP = { butt: 1, round: 2, square: 3 } as const;
  const JOIN = { miter: 1, round: 2, bevel: 3 } as const;
  const stroke = (el: Element): Item | null => {
    const s = inherited(el, 'stroke');
    const p = s === null ? null : paint(s);
    if (!p) return null;
    const dash = inherited(el, 'stroke-dasharray');
    if (Array.isArray(dash)) throw new Error(`the Lottie baker can't animate stroke-dasharray on #${el.id}`);
    const st: Item = {
      ty: 'st',
      c: p.c,
      o: p.o,
      w: scalar(per([inherited(el, 'stroke-width') ?? '1'], Number), TOL.px),
      lc: CAP[(inherited(el, 'stroke-linecap') ?? 'butt') as keyof typeof CAP],
      lj: JOIN[(inherited(el, 'stroke-linejoin') ?? 'miter') as keyof typeof JOIN],
      ml: 4,
    };
    if (dash !== null && dash !== 'none') {
      const [d, gap = d] = dash.split(/[\s,]+/).map(Number);
      st.d = [{ n: 'd', nm: 'dash', v: still(d) }, { n: 'g', nm: 'gap', v: still(gap) }, { n: 'o', nm: 'offset', v: still(0) }];
    }
    return st;
  };

  /** One SVG shape → its Lottie items: geometry, then stroke, then fill (Lottie paints the later item underneath). */
  const leaf = (el: Element): Item[] => {
    let geometry: Item[];
    let box: { c: XY; r: XY } | null = null; // a circle or ellipse, for a bounding-box gradient
    if (el.tagName === 'path') {
      const paths = per([val(el, 'd')], (d) => parsePath(d!));
      if (paths.some((p) => p.length !== paths[0].length)) throw new Error('an animated path changes its number of subpaths');
      geometry = paths[0].map((_, j) => ({ ty: 'sh', ks: bezierProp(paths.map((p) => p[j])) }));
    } else if (el.tagName === 'rect') {
      const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((a) => num(el, a));
      const rx = num(el, 'rx', num(el, 'ry'));
      if (num(el, 'ry', rx) !== rx) throw new Error(`#${el.id}: a rect with different rx and ry`);
      if (rx > Math.min(w, h) / 2) throw new Error(`#${el.id}: a corner radius over half the rect`);
      geometry = [{ ty: 'rc', p: still([r2(x + w / 2), r2(y + h / 2)]), s: still([r2(w), r2(h)]), r: still(r2(rx)) }];
    } else {
      const c: XY = [num(el, 'cx'), num(el, 'cy')];
      const radii = el.tagName === 'circle' ? per([val(el, 'r')], (r): XY => [Number(r), Number(r)]) : [[num(el, 'rx'), num(el, 'ry')] as XY];
      geometry = [{ ty: 'el', p: still(c.map(r2)), s: vector(radii.map(([a, b]) => [2 * a, 2 * b]), TOL.px) }];
      box = { c, r: radii[0] };
    }
    const rule: 1 | 2 = inherited(el, 'fill-rule') === 'evenodd' ? 2 : 1;
    const st = stroke(el);
    const items = st ? [...geometry, st] : geometry;
    const fills = per([inherited(el, 'fill') ?? 'black'], (s) => s!);
    if (fills.some((s) => s.startsWith('url('))) {
      if (fills.some((s) => s !== fills[0])) throw new Error(`the Lottie baker can't animate a gradient fill on #${el.id}`);
      return gradient(el, byUrl(fills[0]), items, rule, box);
    }
    const p = paint(fills.length === 1 ? fills[0] : fills);
    return p ? [...items, { ty: 'fl', c: p.c, o: p.o, r: rule }] : items;
  };

  /** A gradient fill (spec §6.3). An elliptical one sits in a group that stretches a round one; the shape is mapped back. */
  const gradient = (el: Element, g: Element, items: Item[], rule: 1 | 2, box: { c: XY; r: XY } | null): Item[] => {
    const fill = (t: 1 | 2, s: Prop, e: Prop): Item => ({ ty: 'gf', t, s, e, g: stops(g), o: still(100), r: rule, h: still(0), a: still(0) });
    const units = g.getAttribute('gradientUnits') ?? 'objectBoundingBox';
    if (g.tagName === 'linearGradient') {
      if (units !== 'userSpaceOnUse') throw new Error(`#${g.id}: the Lottie baker only maps user-space linear gradients`);
      const ends = per(['x1', 'y1', 'x2', 'y2'].map((a) => val(g, a)), (...v) => v.map(Number));
      return [...items, fill(1, vector(ends.map((p) => p.slice(0, 2)), TOL.px), vector(ends.map((p) => p.slice(2)), TOL.px))];
    }
    if (units === 'userSpaceOnUse') {
      // Figma's radial form: a unit circle at 0,0 placed by gradientTransform = translate · rotate · scale(sx sy).
      if (num(g, 'cx') !== 0 || num(g, 'cy') !== 0 || num(g, 'r', 1) !== 1) throw new Error(`#${g.id}: a user-space radial gradient must be a unit circle at 0,0`);
      const T = toTrs(parseTransform(g.getAttribute('gradientTransform') ?? ''));
      if (T.length !== 1 || T[0].a[0] !== 0 || T[0].a[1] !== 0) throw new Error(`#${g.id}: the Lottie baker can't map this gradientTransform`);
      const [sx, sy] = T[0].s;
      return [stretched(el, items, { ...T[0], s: [1, sy / sx] }, fill(2, still([0, 0]), still([r2(sx), 0])))];
    }
    if (!box || ['cx', 'cy', 'r', 'gradientTransform'].some((a) => g.hasAttribute(a))) throw new Error(`#${g.id}: a bounding-box gradient must be the default circle, on a circle or ellipse`);
    const { c, r } = box;
    const f = fill(2, still(c.map(r2)), still([r2(c[0] + r[0]), r2(c[1])]));
    return r[0] === r[1] ? [...items, f] : [stretched(el, items, { p: c, r: 0, s: [1, r[1] / r[0]], a: c }, f)];
  };
  /** The shape in a group with transform M, mapped by M⁻¹ so it draws where it did. Only still paths and ellipses. */
  const stretched = (el: Element, items: Item[], M: Trs, gf: Item): Item => {
    const inv = invert(trsMatrix(M));
    const mapped = items.map((it): Item => {
      if (it.ty === 'sh' && it.ks.a === 0) return { ty: 'sh', ks: still(roundBezier(mapBezier(it.ks.k as Bezier, inv))) };
      if (it.ty === 'el' && it.s.a === 0 && M.r === 0) {
        const [w, h] = it.s.k as number[];
        return { ty: 'el', p: still(apply(inv, it.p.k as XY).map(r2)), s: still([r2(w / M.s[0]), r2(h / M.s[1])]) };
      }
      throw new Error(`#${el.id}: the Lottie baker can't fill this shape with an elliptical gradient`);
    });
    return { ty: 'gr', nm: 'gradient', it: [...mapped, gf, { ty: 'tr', ...transform([M]) }] };
  };

  /** An element and everything in it as a Lottie group (two or more for some transforms), or null when hidden. */
  const group = (el: Element): Item | null => {
    if (hidden(el)) return null;
    const content = el.tagName === 'g' ? [...el.children].map(group).filter((g) => g !== null).reverse() : leaf(el);
    return wrap(el.id || el.tagName, content, trsOf(el), opacityOf(el));
  };

  // ── Masks (spec §6.4): the clip's lid polygon per frame as one 4-vertex mask ──
  const lidsOf = (el: Element): Bezier[] => {
    const clip = byUrl(el.getAttribute('clip-path')!);
    const path = clip.children[0];
    if (clip.getAttribute('clipPathUnits') !== 'userSpaceOnUse' || clip.children.length !== 1 || path.tagName !== 'path')
      throw new Error(`#${clip.id}: a clip must be one user-space path`);
    return per([val(path, 'd')], (d) => {
      const p = parsePath(d!);
      if (p.length !== 1 || !p[0].c) throw new Error(`#${clip.id}: a clip must be one closed path`);
      return lidMask(p[0]);
    });
  };
  /** lottie-web can cut a stroke in a masked layer; a transparent rectangle over the whole mask is the fix (spec §6.4). */
  const cover = (lids: Bezier[]): Item => {
    const pts = lids.flatMap((b) => b.v.flatMap(([x, y], k): XY[] => [[x, y], [x + b.i[k][0], y + b.i[k][1]], [x + b.o[k][0], y + b.o[k][1]]]));
    const [x0, x1, y0, y1] = [0, 0, 1, 1].map((c, k) => (k % 2 ? Math.max : Math.min)(...pts.map((q) => q[c])));
    const rect: Item = { ty: 'rc', p: still([r2((x0 + x1) / 2), r2((y0 + y1) / 2)]), s: still([r2(x1 - x0 + 2), r2(y1 - y0 + 2)]), r: still(0) };
    return wrap('cover', [rect, { ty: 'fl', c: still([0, 0, 0, 1]), o: still(0), r: 1 }], [], still(100));
  };

  // ── Layers (spec §6.4): a layer per clipped shape, a null per transform of each of its ancestors, runs between ──
  const [vx, vy, w, h] = svg.getAttribute('viewBox')!.split(/[\s,]+/).map(Number);
  const base = { ddd: 0, sr: 1, ao: 0, ip: 0, op: n, st: 0, bm: 0 } as const;
  const content: Layer[] = [];
  const nulls: Layer[] = [];
  let ind = 0;
  const addNull = (nm: string, ks: Transform, parent?: number) => {
    nulls.push({ ...base, ind: ++ind, ty: 3, nm, ...(parent ? { parent } : {}), ks });
    return ind;
  };
  const addLayer = (nm: string, parent: number, shapes: Item[], more: Partial<Layer> = {}) =>
    content.push({ ...base, ind: ++ind, ty: 4, nm, parent, ks: transform([IDENT]), shapes, ...more });
  const carriers = new Set<Element>();
  for (const m of svg.querySelectorAll('[clip-path]')) for (let e = m.parentElement; e && e !== svg; e = e.parentElement) carriers.add(e);

  const walk = (node: Element, parent: number) => {
    let run: Element[] = [];
    const flush = () => {
      const shapes = run.map(group).filter((g) => g !== null).reverse();
      if (shapes.length) addLayer(run.map((e) => e.id || e.tagName).join(' '), parent, shapes);
      run = [];
    };
    for (const el of node.children) {
      if (el.tagName === 'defs') continue;
      if (carriers.has(el)) {
        flush();
        if (val(el, 'opacity') !== null) throw new Error(`#${el.id}: the Lottie baker can't fade a group holding a clipped shape`);
        let p = parent;
        for (const T of trsOf(el)) p = addNull(el.id, transform(T, still(0)), p);
        walk(el, p);
      } else if (el.hasAttribute('clip-path')) {
        flush();
        if (val(el, 'transform') !== null) throw new Error(`#${el.id}: a clipped shape can't have its own transform`);
        const g = group(el);
        if (!g) continue;
        const lids = lidsOf(el);
        const mask: Mask = { inv: false, mode: 'a', pt: bezierProp(lids), o: still(100), x: still(0), nm: 'lids' };
        addLayer(el.id, parent, [g, cover(lids)], { hasMask: true, masksProperties: [mask] });
      } else run.push(el);
    }
    flush();
  };
  walk(svg, addNull('frame', transform([{ ...IDENT, p: [-vx, -vy] }], still(0))));
  return { v: '5.12.0', fr: 60, ip: 0, op: n, w, h, nm: name, ddd: 0, assets: [], layers: [...content.reverse(), ...nulls] };
}

/**
 * The renderer's lid polygon (spec §6.4) → one closed 4-vertex mask: the upper lid's quadratic left to right, then the
 * lower lid's back. The polygon samples both at even x, upper points first, then lower points reversed; the lower lid is
 * clamped to the upper where they cross, so it's fitted through the samples left alone. Fewer than 3 = closed.
 */
export function lidMask(b: Bezier): Bezier {
  const n = b.v.length / 2;
  if (!Number.isInteger(n) || n < 3 || n % 2 === 0) throw new Error('the eye clip is not a lid polygon');
  const up = b.v.slice(0, n);
  const lo = b.v.slice(n).reverse();
  const mid = (n - 1) / 2;
  const [u0, cu, u1] = quadratic([0, mid, n - 1].map((k) => [k / (n - 1), up[k][1]]));
  let [l0, cl, l1] = [u0, cu, u1];
  const free = lo.flatMap((p, k) => (p[1] !== up[k][1] ? [k] : []));
  if (free.length >= 3) {
    const [a, c] = [free[0], free[free.length - 1]];
    const m = free.reduce((best, k) => (Math.abs(k - (a + c) / 2) < Math.abs(best - (a + c) / 2) ? k : best));
    [l0, cl, l1] = quadratic([a, m, c].map((k) => [k / (n - 1), lo[k][1]]));
  }
  const [x0, x1] = [up[0][0], up[n - 1][0]];
  const xc = (x0 + x1) / 2;
  const toward = (x: number, y: number, cy: number): XY => [(2 / 3) * (xc - x), (2 / 3) * (cy - y)]; // quadratic → cubic
  return {
    c: true,
    v: [[x0, u0], [x1, u1], [x1, l1], [x0, l0]],
    i: [[0, 0], toward(x1, u1, cu), [0, 0], toward(x0, l0, cl)],
    o: [toward(x0, u0, cu), [0, 0], toward(x1, l1, cl), [0, 0]],
  };
}

/** The quadratic Bézier y(t) through three samples [t, y]: its start, control and end. */
function quadratic(s: number[][]): [number, number, number] {
  const y = (t: number) => s.reduce((sum, [tk, yk], k) => sum + yk * s.reduce((w, [tj], j) => (j === k ? w : (w * (t - tj)) / (tk - tj)), 1), 0);
  return [y(0), 2 * y(0.5) - (y(0) + y(1)) / 2, y(1)];
}

/** Records the clip and bakes it (spec §4, §6). Baking takes a fraction of a second, so only recording reports progress. */
export async function exportLottie(req: ClipSpec & { look: Look }, signal: AbortSignal, onProgress: (done: number) => void): Promise<Blob> {
  const frames = await record(req, signal);
  onProgress(0.5);
  await pause(signal);
  const lottie = bake(frames, req.look, `noxy-${req.event ?? req.state}`);
  await pause(signal); // a Cancel clicked during the bake was queued behind it; this lets it run before the file is saved
  onProgress(1);
  return new Blob([JSON.stringify(lottie)], { type: 'application/json' });
}
