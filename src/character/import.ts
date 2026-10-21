// SVG art → part data (spec §6). Pure, with type-only imports, so `node scripts/import-art.ts` can run it directly.
import type { Body, FlatToken, GradientDef, GradientToken, Node, Paint, Shape, Side, XY } from './types.ts';

/** A parsed SVG element: tag, raw attributes, child elements (text is ignored). */
export interface El {
  tag: string;
  attrs: Record<string, string>;
  children: El[];
}

/**
 * A small tag tokenizer for the art subset: elements, attributes, comments, an XML prolog. Not a general XML
 * parser (no entities, no CDATA). ponytail: swap for a real XML parser if bring-your-own-art arrives.
 */
export function parseSvg(text: string): El {
  const root: El = { tag: '', attrs: {}, children: [] };
  const stack = [root];
  for (const [, close, open, rest, selfClose] of text.matchAll(/<!--[\s\S]*?-->|<[?!][^>]*>|<\/([\w:-]+)\s*>|<([\w:-]+)([^>]*?)(\/?)>/g)) {
    if (close) {
      if (stack.pop()?.tag !== close) throw new Error(`unexpected </${close}>`);
    } else if (open) {
      const el: El = { tag: open, attrs: {}, children: [] };
      for (const [, k, v1, v2] of rest.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) el.attrs[k] = v1 ?? v2;
      stack[stack.length - 1].children.push(el);
      if (!selfClose) stack.push(el);
    }
  }
  if (stack.length !== 1 || root.children.length !== 1) throw new Error('expected one well-formed <svg> element');
  return root.children[0];
}

const FLAT: Record<string, FlatToken> = {
  '#95A9AF': 'trim',
  '#FA6C2E': 'accent',
  '#FF8A4C': 'glow',
  '#2EC7E6': 'eye',
  '#EFEFEF': 'mouth',
  '#F6751A': 'symbol',
  '#FC721A': 'symbol',
  '#FB711A': 'symbol',
  '#FC731B': 'symbol',
};
const PAIRS: [GradientToken, string, string][] = [
  ['shell', '#FFFFFF', '#92A7AD'],
  ['earShell', '#FFFFFF', '#D9E0E3'],
  ['screen', '#313E4F', '#12171D'],
];
const PALETTE = `${Object.keys(FLAT).join(', ')}; gradient stops ${PAIRS.map(([t, a, b]) => `${t} ${a}→${b}`).join(', ')}`;
/** Figma writes pure white and black by name; every other colour must be hex. */
const NAMED: Record<string, string> = { WHITE: '#FFFFFF', BLACK: '#000000' };
const hexOf = (v: string) => NAMED[v.toUpperCase()] ?? v.toUpperCase();
const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse']);
const SHAPE_ATTRS = new Set(['d', 'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'fill-rule', 'clip-rule', 'opacity', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray']);
const GRADIENT_ATTRS = new Set(['x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'fx', 'fy', 'gradientUnits', 'gradientTransform']);
const GROUP_ATTRS = new Set(['opacity']);
const MARKERS = ['axis', 'eye-l', 'ear-l', 'bolt-l', 'mouth', 'tilt', 'squash', 'symbols', 'badge', 'zzz-from', 'zzz-to'] as const;
const FRAME_PATH = /^[MLHVCQZ\d\s,.eE+-]*$/;
const NAME = /^[A-Za-z][\w-]*$/;
const UNSAFE = /["'<>&]/; // buildRig writes values into markup
const BODY_TOP = ['g#shell', 'g#screen', 'ellipse#shadow'];
const label = (el: El) => `<${el.tag}${el.attrs.id ? ` id="${el.attrs.id}"` : ''}>`;
const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

export type Imported = { kind: 'body'; part: Body } | { kind: 'ears' | 'bolts'; part: Side } | { kind: 'shared'; part: Node[] };

/**
 * Turns one art file (`body-<id>.svg`, `ears-<id>.svg`, `bolts-<id>.svg` or `shared.svg`) into part data. Throws,
 * naming the file. Body and side art is drawn on the character's frame: its viewBox must have the frame's size, and
 * an export whose viewBox starts elsewhere (Figma's start at 0 0) is shifted onto the frame.
 */
export function importPart(file: string, text: string, frame: [number, number, number, number]): Imported {
  function fail(msg: string): never {
    throw new Error(`${file}: ${msg}`);
  }
  const name = /^(body|ears|bolts)-([a-z0-9]+)\.svg$|^shared\.svg$/.exec(file) ?? fail('name art files body-<id>.svg, ears-<id>.svg, bolts-<id>.svg or shared.svg');
  const kind = (name[1] ?? 'shared') as Imported['kind'];
  const side = kind === 'ears' || kind === 'bolts';
  let root: El;
  try {
    root = parseSvg(text);
  } catch (e) {
    fail((e as Error).message);
  }
  if (root.tag !== 'svg') fail('the root element must be <svg>');
  if (kind !== 'shared') {
    const vb = (root.attrs.viewBox ?? '').trim().split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || !vb.every(Number.isFinite) || vb[2] !== frame[2] || vb[3] !== frame[3]) fail(`the viewBox must be ${frame[2]} × ${frame[3]}, the character frame (export the whole frame)`);
    const [dx, dy] = [frame[0] - vb[0], frame[1] - vb[1]];
    if (dx || dy) shift(root, dx, dy, fail);
  }

  const gradients: GradientDef[] = [];
  const markers: Record<string, XY> = {};
  const keep = (el: El, allowed: Set<string>) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(el.attrs)) {
      if (k === 'id' || k === 'fill' || k === 'stroke') continue;
      if (!allowed.has(k)) fail(`${label(el)} has ${k}=, which the art format doesn't support${k === 'clip-path' ? ' (Figma: turn off "Clip content" on the frame)' : ''}`);
      if (UNSAFE.test(v)) fail(`${label(el)} has ${k}= with " ' < > or &, which the art format doesn't support`);
      out[k] = v;
    }
    return out;
  };
  const checkId = (el: El, id: string) => (NAME.test(id) ? id : fail(`${label(el)} needs an id of letters, digits, _ and -, starting with a letter`));
  const paint = (el: El, v: string | undefined): Paint | undefined => {
    if (v === undefined) return undefined;
    if (v === 'none') return 'none';
    const url = /^url\(#([\w-]+)\)$/.exec(v);
    if (url) return { gradient: url[1] };
    const hex = hexOf(v);
    if (hex === '#000000') return el.attrs.id === 'shadow' ? '#000000' : fail(`${label(el)}: #000000 is for <ellipse id="shadow"> only`);
    return FLAT[hex] ?? fail(`${label(el)} uses ${v}, which is not in the palette: ${PALETTE}`);
  };
  const gradient = (el: El): GradientDef => {
    const id = checkId(el, el.attrs.id ?? fail(`${label(el)} needs an id`));
    const stops = el.children.filter((c) => c.tag === 'stop').map((c) => hexOf(c.attrs['stop-color'] ?? ''));
    const pair = PAIRS.find(([, a, b]) => stops.length === 2 && stops[0] === a && stops[1] === b);
    if (!pair) fail(`gradient ${id} needs 2 stops matching one of the gradient pairs: ${PALETTE}`);
    return { id, kind: el.tag === 'linearGradient' ? 'linear' : 'radial', attrs: keep(el, GRADIENT_ATTRS), token: pair[0] };
  };
  const convert = (el: El): Node | null => {
    if (el.attrs.transform !== undefined) fail(`${label(el)} has transform=; bake it into the coordinates`);
    if (el.tag === 'defs') {
      for (const c of el.children) convert(c);
      return null;
    }
    if (el.tag === 'linearGradient' || el.tag === 'radialGradient') {
      gradients.push(gradient(el));
      return null;
    }
    const id = el.attrs.id;
    if (el.tag === 'circle' && id && ((side && id === 'pivot') || (kind === 'body' && (MARKERS as readonly string[]).includes(id)))) {
      markers[id] = [Number(el.attrs.cx), Number(el.attrs.cy)];
      return null;
    }
    if (id && !side) checkId(el, id); // side art drops its ids
    if (el.tag === 'g') {
      if (el.attrs.fill || el.attrs.stroke) fail(`${label(el)}: put fill and stroke on the shapes, not on <g>`);
      const children = el.children.map(convert).filter((n) => n !== null);
      return { tag: 'g', ...(id && !side && { id }), attrs: keep(el, GROUP_ATTRS), children };
    }
    if (!SHAPES.has(el.tag)) fail(`${label(el)} is not supported; use path, rect, circle, ellipse, g and linear/radial gradients`);
    if (kind !== 'shared' && el.attrs.d !== undefined && !FRAME_PATH.test(el.attrs.d)) fail(`${label(el)}: paths may use only absolute M L H V C Q Z (flatten arcs)`);
    const shape: Shape = { tag: el.tag as Shape['tag'], attrs: keep(el, SHAPE_ATTRS) };
    if (id && !side) shape.id = id; // side art is drawn twice (L and R): ids would repeat
    const fill = paint(el, el.attrs.fill);
    const stroke = paint(el, el.attrs.stroke);
    if (fill) shape.fill = fill;
    if (stroke) shape.stroke = stroke;
    return shape;
  };
  const nodes = root.children
    .map((el) => {
      const n = convert(el);
      if (n && kind === 'body' && !BODY_TOP.includes(`${el.tag}#${el.attrs.id}`)) fail(`${label(el)} is outside <g id="shell">, <g id="screen"> and the shadow; move it into one of them`);
      return n;
    })
    .filter((n) => n !== null);
  const defined = new Set(gradients.map((g) => g.id));
  const refs = (n: Node): void => {
    if (n.tag === 'g') return n.children.forEach(refs);
    for (const p of [n.fill, n.stroke]) if (typeof p === 'object' && !defined.has(p.gradient)) fail(`<${n.tag}${n.id ? ` id="${n.id}"` : ''}> uses url(#${p.gradient}), but the file has no gradient with that id`);
  };
  nodes.forEach(refs);
  if (kind === 'shared') return { kind, part: nodes };

  const id = name[2];
  const title = id[0].toUpperCase() + id.slice(1);
  if (side) {
    const pivot = markers.pivot ?? fail('missing <circle id="pivot"> at the hinge');
    return { kind, part: { id, name: title, shapes: nodes, gradients, pivot, bounds: bounds(nodes) } };
  }
  const at = (k: (typeof MARKERS)[number]) => markers[k] ?? fail(`missing marker <circle id="${k}">`);
  const group = (gid: string) => {
    const g = nodes.find((n) => n.id === gid);
    return g?.tag === 'g' ? g.children : fail(`missing <g id="${gid}">`);
  };
  const shadow = nodes.find((n) => n.id === 'shadow');
  if (shadow?.tag !== 'ellipse') fail('missing <ellipse id="shadow">');
  const shell = gradients.find((g) => g.id === 'grad-shell' && g.kind === 'linear') ?? fail('missing <linearGradient id="grad-shell">');
  if (!Number.isFinite(Number(shell.attrs.x1 ?? NaN)) || !Number.isFinite(Number(shell.attrs.x2 ?? NaN))) fail('<linearGradient id="grad-shell"> needs numeric x1 and x2 (they place the highlight)');
  return {
    kind,
    part: {
      id,
      name: title,
      shell: group('shell'),
      screen: group('screen'),
      shadow,
      gradients,
      axisX: at('axis')[0],
      eye: at('eye-l'),
      ear: at('ear-l'),
      bolt: at('bolt-l'),
      mouth: at('mouth'),
      tilt: at('tilt'),
      squash: at('squash'),
      shadowC: [Number(shadow.attrs.cx), Number(shadow.attrs.cy)],
      symbols: at('symbols'),
      badge: at('badge'),
      zzz: { from: at('zzz-from'), to: at('zzz-to') },
      highlight: [Number(shell.attrs.x1), Number(shell.attrs.x2)],
    },
  };
}

/** The text of parts.gen.ts for a character's art files, sorted by name. `npm run import-art` writes it; a test keeps it current. */
export function generateParts(files: [name: string, text: string][], frame: [number, number, number, number]): string {
  const out: Record<string, unknown[]> = { body: [], ears: [], bolts: [], shared: [] };
  for (const [file, text] of files) {
    const { kind, part } = importPart(file, text, frame);
    if (kind === 'shared') out.shared = part as unknown[];
    else out[kind].push(part);
  }
  const list = (name: string, type: string) => `export const ${name}: ${type}[] = ${JSON.stringify(out[name], null, 2)};\n`;
  return (
    '// Generated by `npm run import-art` from src/character/nox/art/*.svg. Do not edit.\n' +
    "import type { Body, Node, Side } from '../types.ts';\n\n" +
    `export const frame: [number, number, number, number] = ${JSON.stringify(frame)};\n` +
    list('body', 'Body') + list('ears', 'Side') + list('bolts', 'Side') + list('shared', 'Node')
  );
}

const round = (v: number) => String(Math.round(v * 1e4) / 1e4);
const X = ['x', 'cx', 'x1', 'x2', 'fx'];
const Y = ['y', 'cy', 'y1', 'y2', 'fy'];

/** Adds (dx, dy) to every coordinate in frame art, in place. Paths must already be absolute M L H V C Q Z. */
function shift(el: El, dx: number, dy: number, fail: (msg: string) => never): void {
  const a = el.attrs;
  const gradient = el.tag.endsWith('Gradient');
  if (!gradient || a.gradientUnits === 'userSpaceOnUse') {
    // a gradient with gradientTransform (Figma radials: cx/cy/r are unit-space) is placed by the transform alone: shifting both would move it twice
    if (gradient && a.gradientTransform !== undefined) a.gradientTransform = `translate(${dx} ${dy}) ${a.gradientTransform}`;
    else {
      for (const k of X) if (a[k] !== undefined) a[k] = round(Number(a[k]) + dx);
      for (const k of Y) if (a[k] !== undefined) a[k] = round(Number(a[k]) + dy);
    }
  }
  if (a.d !== undefined) {
    if (!FRAME_PATH.test(a.d)) fail(`${label(el)}: paths may use only absolute M L H V C Q Z (flatten arcs)`);
    a.d = a.d.replace(/([MLHVCQZ])([^MLHVCQZ]*)/g, (_, cmd: string, args: string) =>
      cmd + (args.match(NUM) ?? []).map((c, i) => round(Number(c) + (cmd === 'H' ? dx : cmd === 'V' ? dy : i % 2 ? dy : dx))).join(' '));
  }
  for (const c of el.children) shift(c, dx, dy, fail);
}

/** The box around every coordinate in the art, path control points included (a slight over-estimate is fine). */
function bounds(nodes: Node[]): [number, number, number, number] {
  const xs: number[] = [];
  const ys: number[] = [];
  const n = (v: string | number | undefined) => Number(v ?? 0);
  const walk = (node: Node): void => {
    if (node.tag === 'g') return node.children.forEach(walk);
    const a = node.attrs;
    if (node.tag === 'rect') {
      xs.push(n(a.x), n(a.x) + n(a.width));
      ys.push(n(a.y), n(a.y) + n(a.height));
    } else if (node.tag === 'circle') {
      xs.push(n(a.cx) - n(a.r), n(a.cx) + n(a.r));
      ys.push(n(a.cy) - n(a.r), n(a.cy) + n(a.r));
    } else if (node.tag === 'ellipse') {
      xs.push(n(a.cx) - n(a.rx), n(a.cx) + n(a.rx));
      ys.push(n(a.cy) - n(a.ry), n(a.cy) + n(a.ry));
    } else {
      for (const [, cmd, args] of String(a.d).matchAll(/([MLHVCQZ])([^MLHVCQZ]*)/g)) {
        const v = args.match(NUM)?.map(Number) ?? [];
        if (cmd === 'H') xs.push(...v);
        else if (cmd === 'V') ys.push(...v);
        else v.forEach((c, i) => (i % 2 ? ys : xs).push(c));
      }
    }
  };
  nodes.forEach(walk);
  return xs.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : [0, 0, 0, 0];
}
