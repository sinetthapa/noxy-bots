// Comparison and approval sheets (dev only): /sheet.html?sheet=classic|glow|parts|themes, plus &glow=halo (blur is the default).
// Each bot is drawn once and shown as an <img>, so the copies on one page don't share ids.
import { neutralPose, type Pose } from '../src/brain/pose';
import { DEFAULT_TUNING } from '../src/brain/tuning';
import { buildRig } from '../src/character/build';
import { resolveLook } from '../src/character/look';
import { DEFAULT_LOOK, nox } from '../src/character/nox';
import type { Look } from '../src/character/types';
import { createSvgRenderer } from '../src/render/svg';

type Glow = 'halo' | 'blur';
const SIZES = [72, 110, 240];
const NEUTRAL: Partial<Pose> = {};
const TURNED: Partial<Pose> = { 'earL.angle': 100, 'earR.angle': 100, yaw: 1 };
const LIT: Partial<Pose> = { accentGlow: 1, symBulb: 1, bulbLit: 1, badge: 1 };

function image(look: Look, glow: Glow, pose: Partial<Pose>): string {
  const host = document.createElement('div');
  host.innerHTML = buildRig(nox, look, { glow });
  const svg = host.querySelector('svg')!;
  createSvgRenderer(svg, resolveLook(nox, look), DEFAULT_TUNING).draw({ ...neutralPose(), ...pose });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML)}`;
}
const row = (title: string, cells: [src: string, px: number][]) =>
  `<section><h2>${title}</h2>${cells.map(([src, px]) => `<figure><img src="${src}" width="${px}" alt="${title}, ${px}px"><figcaption>${px}px</figcaption></figure>`).join('')}</section>`;
const sizes = (src: string) => SIZES.map((px): [string, number] => [src, px]);

const params = new URLSearchParams(location.search);
const sheet = params.get('sheet') ?? 'classic';
const glow = (params.get('glow') ?? 'blur') as Glow;
const rows: string[] = [];
if (sheet === 'classic') {
  for (const [name, pose] of [['neutral', NEUTRAL], ['ears down, yaw right', TURNED], ['lit: bolts, bulb, badge', LIT]] as const) {
    rows.push(row(name, sizes(image(DEFAULT_LOOK, glow, pose))));
  }
}
if (sheet === 'glow') {
  for (const g of ['blur', 'halo'] as const) rows.push(row(`${g}, lit`, sizes(image(DEFAULT_LOOK, g, LIT))));
}
if (sheet === 'parts') {
  const looks: [string, Look][] = [['Classic', DEFAULT_LOOK]];
  for (const kind of ['body', 'ears', 'eyes', 'bolts'] as const) {
    for (const v of nox.parts[kind]) if (v.id !== DEFAULT_LOOK[kind]) looks.push([`${kind}: ${v.name}`, { ...DEFAULT_LOOK, [kind]: v.id }]);
  }
  looks.push(['all placeholders', { ...DEFAULT_LOOK, body: 'box', ears: 'antenna', eyes: 'round' }]);
  for (const [name, look] of looks) rows.push(row(name, [NEUTRAL, TURNED, LIT].map((p): [string, number] => [image(look, glow, p), 110])));
}
if (sheet === 'themes') {
  for (const t of nox.themes) rows.push(row(t.name, [NEUTRAL, LIT].map((p): [string, number] => [image({ ...DEFAULT_LOOK, theme: t.id }, glow, p), 110])));
}
if (rows.length) document.body.innerHTML = rows.join('');
else document.body.replaceChildren(Object.assign(document.createElement('p'), { textContent: `Unknown sheet "${sheet}". Try ?sheet=classic, glow, parts or themes.` }));
