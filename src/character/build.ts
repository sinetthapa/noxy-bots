import { pick, resolveLook } from './look.ts';
import type { Character, Colors, FlatToken, GradientDef, Group, Look, Node, Paint } from './types.ts';

/** Halo size relative to the glowing part. Build-time geometry, so a constant rather than a live tuning value. */
const HALO_SCALE = 1.8;
export const BADGE_R = 23; // the badge dot, in shared-art coordinates
export const BULB = { cx: 0, cy: 4, r: 45 }; // the bulb's glass, in shared-art coordinates

const f = (v: number) => Math.round(v * 100) / 100;
/** For a double-quoted attribute value: character data must not end the value or start markup. */
const esc = (v: string | number) => String(v).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const attrs = (a: Record<string, string | number>) => Object.entries(a).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
const idAttr = (id?: string) => (id ? ` id="${esc(id)}"` : '');

/**
 * The rig SVG for one look (spec §5): defs, parts, ids the renderer drives, no transforms. The right ear and
 * bolt repeat the left art; the renderer's transform mirrors them. `glow: 'blur'` (the default, the user's §8 pick)
 * emits today's filter glow; `'halo'` a radial-gradient halo with the same ids, kept for M4's exporters.
 * `prefix` goes in front of every id and every `#id` reference, so several bots can share one page (M2 spec §7).
 */
export function buildRig(ch: Character, look: Look, { glow = 'blur', prefix = '' }: { glow?: 'halo' | 'blur'; prefix?: string } = {}): string {
  const raw = resolveLook(ch, look).colors; // also validates every id and the theme
  // Character data (themes included) is escaped where it lands in attribute values.
  const colors = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v.map(esc) : esc(v)])) as Colors;
  const body = pick(ch.parts.body, look.body, 'body');
  const ears = pick(ch.parts.ears, look.ears, 'ears');
  const bolts = pick(ch.parts.bolts, look.bolts, 'bolts');
  const blur = glow === 'blur';

  const paint = (p: Paint): string => (typeof p === 'object' ? `url(#${esc(p.gradient)})` : p === 'none' || p === '#000000' ? p : colors[p]);
  const slots: Record<string, string> = blur
    ? {
        'sym-bulb-glow': '<g id="sym-bulb-glow" filter="url(#soft-glow)" opacity="0"><use href="#sym-bulb-body"/><use href="#sym-bulb-rays"/></g>',
        'badge-glow': `<circle id="badge-glow" r="20" fill="${colors.glow}" filter="url(#soft-glow)" opacity="0.5"/>`,
      }
    : {
        'sym-bulb-glow': `<g id="sym-bulb-glow" opacity="0"><circle cx="${BULB.cx}" cy="${BULB.cy}" r="${f(BULB.r * HALO_SCALE)}" fill="url(#halo)"/></g>`,
        'badge-glow': `<circle id="badge-glow" r="${f(BADGE_R * HALO_SCALE)}" fill="url(#halo)" opacity="0.5"/>`,
      };
  /** `inherit`: shapes of this colour take it from their group instead (the renderer lights the bolt group's fill). */
  const node = (n: Node, inherit?: FlatToken): string => {
    if (n.tag === 'g') return (n.id && Object.hasOwn(slots, n.id) && slots[n.id]) || `<g${idAttr(n.id)}${attrs(n.attrs)}>${nodes(n.children, inherit)}</g>`;
    const fill = n.fill && n.fill !== inherit ? ` fill="${paint(n.fill)}"` : '';
    const stroke = n.stroke ? ` stroke="${paint(n.stroke)}"` : '';
    return `<${n.tag}${idAttr(n.id)}${attrs(n.attrs)}${fill}${stroke}/>`;
  };
  const nodes = (list: Node[], inherit?: FlatToken) => list.map((n) => node(n, inherit)).join('');
  const gradient = (g: GradientDef) => {
    const tag = g.kind === 'linear' ? 'linearGradient' : 'radialGradient';
    const [a, b] = colors[g.token];
    return `<${tag} id="${esc(g.id)}"${attrs(g.attrs)}><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></${tag}>`;
  };
  const shared = (id: string): Group => {
    const n = ch.shared.find((s) => s.id === id);
    if (n?.tag !== 'g') throw new Error(`${ch.id}: shared art is missing <g id="${id}">`);
    return n;
  };

  const boltArt = nodes(bolts.shapes, 'accent');
  const [x1, y1, x2, y2] = bolts.bounds;
  const boltHalo = (s: string) =>
    blur
      ? `<g id="bolt-${s}-halo" fill="${colors.glow}" filter="url(#soft-glow)" opacity="0">${boltArt}</g>`
      : `<g id="bolt-${s}-halo" opacity="0">${
          bolts.shapes.length
            ? `<ellipse cx="${f((x1 + x2) / 2)}" cy="${f((y1 + y2) / 2)}" rx="${f(((x2 - x1) / 2) * HALO_SCALE)}" ry="${f(((y2 - y1) / 2) * HALO_SCALE)}" fill="url(#halo)"/>`
            : ''
        }</g>`;
  const bolt = (s: string) => `<g id="bolt-${s}" fill="${colors.accent}">${boltHalo(s)}${boltArt}</g>`;
  const earArt = nodes(ears.shapes);
  const eye = (s: string) =>
    `<g id="eye-${s}"><path id="eye-${s}-shape" fill="none" stroke="${colors.eye}" stroke-linecap="round" stroke-linejoin="round" clip-path="url(#clip-eye-${s})"/>` +
    `${nodes(shared(`glyphs-${s}`).children)}</g>`;
  const defs =
    [...ears.gradients, ...bolts.gradients, ...body.gradients].map(gradient).join('') +
    ['l', 'r'].map((s) => `<clipPath id="clip-eye-${s}" clipPathUnits="userSpaceOnUse"><path id="clip-eye-${s}-path" d="M-40 -60H40V60H-40Z"/></clipPath>`).join('') +
    (blur
      ? '<filter id="soft-glow" x="-150%" y="-150%" width="400%" height="400%"><feMorphology operator="dilate" radius="5"/><feGaussianBlur stdDeviation="12"/></filter>'
      : `<radialGradient id="halo"><stop stop-color="${colors.glow}" stop-opacity="0.9"/><stop offset="1" stop-color="${colors.glow}" stop-opacity="0"/></radialGradient>`);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${esc(ch.frame.join(' '))}" fill="none"><defs>${defs}</defs>${node(body.shadow)}` +
    `<g id="nox"><g id="body">${bolt('l')}${bolt('r')}<g id="ear-l">${earArt}</g><g id="ear-r">${earArt}</g>${nodes(body.shell)}` +
    `<g id="face">${nodes(body.screen)}${eye('l')}${eye('r')}<circle id="loader-dot" r="0" fill="${colors.eye}"/>` +
    `<g id="mouth"><path id="mouth-shape" stroke="${colors.mouth}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></g></g></g>` +
    `${node(shared('symbols'))}${node(shared('badge'))}</g></svg>`;
  const p = esc(prefix);
  return p ? svg.replaceAll(' id="', ` id="${p}`).replaceAll('url(#', `url(#${p}`).replaceAll('href="#', `href="#${p}`) : svg;
}
