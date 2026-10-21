// SVG geometry for the Lottie baker (M4 spec §6.3): path data → Lottie Béziers (quadratics and arcs become cubics), and
// transform lists → Lottie transforms (position, rotation, scale, anchor).

export type XY = [number, number];
/** A Lottie path: vertices, with in and out tangents relative to their vertex; `c` = closed. */
export interface Bezier {
  c: boolean;
  v: XY[];
  i: XY[];
  o: XY[];
}

const NUM = /[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
const ARGS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const CURVES = new Set(['C', 'S', 'Q', 'T', 'A']);

/** Path data (M L H V C S Q T A Z, absolute and relative) → one Bezier per subpath. */
export function parsePath(d: string): Bezier[] {
  const tokens = d.match(NUM) ?? [];
  const out: Bezier[] = [];
  let cur: { v: XY[]; i: XY[]; o: XY[] } | null = null; // absolute control points while building
  let p: XY = [0, 0];
  let start: XY = [0, 0];
  let ctrl: XY | null = null; // the last C/S or Q/T control, for S/T reflection
  let last = '';
  const open = () => {
    if (!cur) cur = { v: [[...p]], i: [[...p]], o: [[...p]] };
    return cur;
  };
  const finish = (closed: boolean) => {
    if (cur) out.push(relative(cur, closed));
    cur = null;
  };
  const curve = (c1: XY, c2: XY, to: XY) => {
    const s = open();
    s.o[s.o.length - 1] = c1;
    s.v.push(to);
    s.i.push(c2);
    s.o.push([...to]);
    p = to;
  };
  const line = (to: XY) => curve([...p], [...to], to);
  let k = 0;
  let cmd = '';
  while (k < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[k])) cmd = tokens[k++];
    else if (!cmd) throw new Error(`path data must start with a command: "${d}"`);
    const C = cmd.toUpperCase();
    if (!(C in ARGS)) throw new Error(`unsupported path command "${cmd}"`);
    const rel = cmd !== C;
    const n = ARGS[C];
    const a = tokens.slice(k, k + n).map(Number);
    if (a.length < n || a.some(Number.isNaN)) throw new Error(`bad path data near "${tokens.slice(k - 1, k + n).join(' ')}"`);
    k += n;
    const at = (x: number, y: number): XY => (rel ? [p[0] + x, p[1] + y] : [x, y]);
    let next: XY | null = null;
    if (C === 'M') {
      finish(false);
      p = at(a[0], a[1]);
      start = [...p];
      open();
      cmd = rel ? 'l' : 'L'; // extra pairs after M are lines
    } else if (C === 'L') line(at(a[0], a[1]));
    else if (C === 'H') line([rel ? p[0] + a[0] : a[0], p[1]]);
    else if (C === 'V') line([p[0], rel ? p[1] + a[0] : a[0]]);
    else if (C === 'C') {
      const c2 = at(a[2], a[3]);
      curve(at(a[0], a[1]), c2, at(a[4], a[5]));
      next = c2;
    } else if (C === 'S') {
      const c1: XY = ctrl && 'CS'.includes(last) ? [2 * p[0] - ctrl[0], 2 * p[1] - ctrl[1]] : [...p];
      const c2 = at(a[0], a[1]);
      curve(c1, c2, at(a[2], a[3]));
      next = c2;
    } else if (C === 'Q' || C === 'T') {
      const q: XY = C === 'Q' ? at(a[0], a[1]) : ctrl && 'QT'.includes(last) ? [2 * p[0] - ctrl[0], 2 * p[1] - ctrl[1]] : [...p];
      const to = C === 'Q' ? at(a[2], a[3]) : at(a[0], a[1]);
      curve(lerp(p, q, 2 / 3), lerp(to, q, 2 / 3), to);
      next = q;
    } else if (C === 'A') {
      if ((a[3] !== 0 && a[3] !== 1) || (a[4] !== 0 && a[4] !== 1)) throw new Error(`arc flags must be 0 or 1: "${d}"`);
      for (const [c1, c2, to] of arcToCubics(p, a[0], a[1], a[2], a[3] === 1, a[4] === 1, at(a[5], a[6]))) curve(c1, c2, to);
    } else {
      // Z: a closing curve that ends on the start merges into it (its in-tangent moves to the first vertex). A closing
      // line is kept even when it has no length, so a polygon keeps its vertex count on every frame.
      const s = open();
      const end = s.v.length - 1;
      if (end > 0 && CURVES.has(last) && s.v[end][0] === start[0] && s.v[end][1] === start[1]) {
        s.i[0] = s.i[end];
        s.v.pop();
        s.i.pop();
        s.o.pop();
      }
      finish(true);
      p = [...start];
    }
    ctrl = next;
    last = C;
  }
  finish(false);
  return out;
}

const lerp = (a: XY, b: XY, t: number): XY => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function relative(s: { v: XY[]; i: XY[]; o: XY[] }, closed: boolean): Bezier {
  const rel = (q: XY[]) => q.map((c, k): XY => [c[0] - s.v[k][0], c[1] - s.v[k][1]]);
  return { c: closed, v: s.v, i: rel(s.i), o: rel(s.o) };
}

/** An SVG arc as cubics of at most 90° each (SVG 1.1 F.6.5–F.6.6), as [control 1, control 2, end]. */
export function arcToCubics(p0: XY, rx: number, ry: number, deg: number, large: boolean, sweep: boolean, p1: XY): [XY, XY, XY][] {
  if (p0[0] === p1[0] && p0[1] === p1[1]) return [];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (!rx || !ry) return [[[...p0], [...p1], p1]];
  const phi = (deg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2;
  const dy = (p0[1] - p1[1]) / 2;
  const x = cos * dx + sin * dy;
  const y = -sin * dx + cos * dy;
  const L = (x * x) / (rx * rx) + (y * y) / (ry * ry);
  if (L > 1) {
    rx *= Math.sqrt(L);
    ry *= Math.sqrt(L);
  }
  const num = rx * rx * ry * ry - rx * rx * y * y - ry * ry * x * x;
  const den = rx * rx * y * y + ry * ry * x * x;
  const f = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cx_ = (f * rx * y) / ry;
  const cy_ = (-f * ry * x) / rx;
  const cx = cos * cx_ - sin * cy_ + (p0[0] + p1[0]) / 2;
  const cy = sin * cx_ + cos * cy_ + (p0[1] + p1[1]) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = angle(1, 0, (x - cx_) / rx, (y - cy_) / ry);
  let dt = angle((x - cx_) / rx, (y - cy_) / ry, (-x - cx_) / rx, (-y - cy_) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9);
  const h = dt / n;
  const kappa = (4 / 3) * Math.tan(h / 4);
  const pt = (t: number): XY => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const dpt = (t: number): XY => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  const out: [XY, XY, XY][] = [];
  for (let k = 0; k < n; k++) {
    const a = t1 + k * h;
    const b = a + h;
    const [A, dA, B, dB] = [pt(a), dpt(a), pt(b), dpt(b)];
    out.push([[A[0] + kappa * dA[0], A[1] + kappa * dA[1]], [B[0] - kappa * dB[0], B[1] - kappa * dB[1]], k === n - 1 ? p1 : B]);
  }
  return out;
}

/** One Lottie transform: translate(p) · rotate(r°) · scale(s) · translate(−a). */
export interface Trs {
  p: XY;
  r: number;
  s: XY;
  a: XY;
}
type Op = { t: 'translate'; v: XY } | { t: 'rotate'; v: number } | { t: 'scale'; v: XY };

/** translate, rotate (with or without a centre) and scale; anything else throws. */
export function parseTransform(list: string): Op[] {
  const ops: Op[] = [];
  const rest = list.replace(/\s*([a-zA-Z]+)\s*\(([^)]*)\)\s*,?/g, (_, name: string, args: string) => {
    const n = args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (n.some(Number.isNaN)) throw new Error(`bad transform "${list}"`);
    if (name === 'translate' && (n.length === 1 || n.length === 2)) ops.push({ t: 'translate', v: [n[0], n[1] ?? 0] });
    else if (name === 'scale' && (n.length === 1 || n.length === 2)) ops.push({ t: 'scale', v: [n[0], n[1] ?? n[0]] });
    else if (name === 'rotate' && n.length === 1) ops.push({ t: 'rotate', v: n[0] });
    else if (name === 'rotate' && n.length === 3)
      ops.push({ t: 'translate', v: [n[1], n[2]] }, { t: 'rotate', v: n[0] }, { t: 'translate', v: [-n[1], -n[2]] });
    else throw new Error(`unsupported transform "${name}(${args})"`);
    return '';
  });
  if (rest.trim()) throw new Error(`bad transform "${list}"`);
  return ops;
}

/**
 * A transform list as few Lottie transforms as fit, outermost first. Each takes a run of the form
 * translate · rotate · scale · translate; a rotate or scale out of that order, or a translate between a rotate and a
 * scale, starts the next. The split depends only on the kinds of operation, so every frame of a track splits alike.
 */
export function toTrs(ops: Op[]): Trs[] {
  const out: Trs[] = [];
  const blank = (): Trs => ({ p: [0, 0], r: 0, s: [1, 1], a: [0, 0] });
  let cur = blank();
  let stage = 0; // 0: position; 1: rotated; 2: scaled
  let moved: XY = [0, 0]; // translations since the last rotate or scale
  let moves = 0;
  for (const op of ops) {
    if (op.t === 'translate') {
      moved = [moved[0] + op.v[0], moved[1] + op.v[1]];
      moves++;
      continue;
    }
    const order = op.t === 'rotate' ? 1 : 2;
    if (stage === 0) cur.p = moved;
    else if (order <= stage || moves) {
      out.push(cur);
      cur = blank();
      cur.p = moved;
    }
    if (op.t === 'rotate') cur.r = op.v;
    else cur.s = op.v;
    stage = order;
    moved = [0, 0];
    moves = 0;
  }
  if (stage === 0) cur.p = moved;
  else cur.a = [-moved[0], -moved[1]];
  out.push(cur);
  return out;
}

/** An affine matrix [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f (SVG's order). */
export type Mat = [number, number, number, number, number, number];
export const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
export const apply = (m: Mat, [x, y]: XY): XY => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
/** A tangent (a direction) moves with the matrix but not its translation. */
export const applyLinear = (m: Mat, [x, y]: XY): XY => [m[0] * x + m[2] * y, m[1] * x + m[3] * y];
export function invert(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2];
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}
/** The matrix of one Lottie transform. */
export function trsMatrix({ p, r, s, a }: Trs): Mat {
  const t = (r * Math.PI) / 180;
  const R: Mat = [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0];
  return mul(mul(mul([1, 0, 0, 1, p[0], p[1]], R), [s[0], 0, 0, s[1], 0, 0]), [1, 0, 0, 1, -a[0], -a[1]]);
}
/** A path moved by a matrix: vertices fully, tangents by its linear part. */
export const mapBezier = (b: Bezier, m: Mat): Bezier => ({
  c: b.c,
  v: b.v.map((q) => apply(m, q)),
  i: b.i.map((q) => applyLinear(m, q)),
  o: b.o.map((q) => applyLinear(m, q)),
});
