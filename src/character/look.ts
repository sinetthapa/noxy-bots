import { deriveTheme } from './colors.ts';
import type { Character, Colors, Layout, Look, ThemeBase, XY } from './types.ts';

export const HEX = /^#[0-9a-f]{6}$/i;
const SIZE_KEYS = ['eye', 'eyeSpacing', 'ear', 'bolt'] as const;
const EPS = 1e-9; // slider float noise: 0.7 + 60 × 0.01 can land a hair past 1.3

/** The variant (or theme) with this id; throws listing the valid ids. */
export function pick<T extends { id: string }>(list: T[], id: string, what: string): T {
  const hit = list.find((p) => p.id === id);
  if (!hit) throw new Error(`noxy-bots: unknown ${what} "${id}"; valid: ${list.map((p) => p.id).join(', ')}`);
  return hit;
}

function colors(ch: Character, theme: Look['theme']): Colors {
  if (typeof theme === 'string') return pick(ch.themes, theme, 'theme').colors;
  if (typeof theme?.base !== 'object' || theme.base === null) throw new Error(`noxy-bots: theme must be a theme id or { base }, got ${JSON.stringify(theme)}`);
  const base = {} as ThemeBase; // each value read once: a getter can't pass the check and then return something else
  for (const k of ['shell', 'screen', 'eye', 'accent', 'mouth'] as const) {
    const v: unknown = theme.base[k];
    if (typeof v !== 'string' || !HEX.test(v)) throw new Error(`noxy-bots: theme.base.${k} must be #rrggbb, got "${v}"`);
    base[k] = v;
  }
  return deriveTheme(base);
}

/** Looks can come from outside (JSON, attributes), so every size is checked, not clamped. */
function sizes(s: Look['sizes']): Look['sizes'] {
  for (const k of SIZE_KEYS) {
    const v = s?.[k];
    if (typeof v !== 'number' || !(v >= 0.7 - EPS && v <= 1.3 + EPS)) throw new Error(`noxy-bots: sizes.${k} must be a number from 0.7 to 1.3, got ${typeof v === 'string' ? `"${v}"` : String(v)}`);
  }
  return s;
}

/** Everything the renderer reads for this look: absolute anchors (right = mirror of left), sizes and colours. Validates the whole look. */
export function resolveLook(ch: Character, look: Look): Layout {
  const body = pick(ch.parts.body, look.body, 'body');
  const ears = pick(ch.parts.ears, look.ears, 'ears');
  const eyes = pick(ch.parts.eyes, look.eyes, 'eyes');
  const bolts = pick(ch.parts.bolts, look.bolts, 'bolts');
  const s = sizes(look.sizes);
  const ax = body.axisX;
  const mirror = ([x, y]: XY): XY => [2 * ax - x, y];
  const eyeL: XY = [ax + (body.eye[0] - ax) * s.eyeSpacing, body.eye[1]];
  const eyeR = mirror(eyeL);
  return {
    eye: { w: eyes.w * s.eye, h: eyes.h * s.eye, c: { L: eyeL, R: eyeR } },
    ear: { anchor: { L: body.ear, R: mirror(body.ear) }, pivot: ears.pivot, size: s.ear },
    bolt: { anchor: { L: body.bolt, R: mirror(body.bolt) }, pivot: bolts.pivot, size: s.bolt },
    loader: [(eyeL[0] + eyeR[0]) / 2, eyeL[1]],
    mouth: body.mouth,
    tilt: body.tilt,
    squash: body.squash,
    shadow: body.shadowC,
    symbols: body.symbols,
    badge: body.badge,
    zzz: body.zzz,
    highlight: body.highlight,
    colors: colors(ch, look.theme),
  };
}
