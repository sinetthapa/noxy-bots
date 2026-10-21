// The generated data and the halo constants must match the art files they come from.
import { describe, expect, it } from 'vitest';
import { BADGE_R, BULB } from '../build.ts';
import { generateParts } from '../import.ts';
import type { Group, Node } from '../types.ts';
import { nox } from './index.ts';
import generated from './parts.gen.ts?raw';

const art = import.meta.glob<string>('./art/*.svg', { query: '?raw', import: 'default', eager: true });

/** The node with this id anywhere in the shared art. */
function find(id: string, list: Node[] = nox.shared): Node | undefined {
  for (const n of list) {
    if (n.id === id) return n;
    const hit = n.tag === 'g' ? find(id, n.children) : undefined;
    if (hit) return hit;
  }
}

describe('Nox art', () => {
  it('parts.gen.ts is current (run npm run import-art)', () => {
    const files = Object.keys(art).sort().map((path): [string, string] => [path.slice('./art/'.length), art[path]]);
    expect(generateParts(files, nox.frame)).toBe(generated);
  });

  it('has the empty slots buildRig fills with glows', () => {
    for (const id of ['sym-bulb-glow', 'badge-glow']) expect(find(id)).toMatchObject({ tag: 'g', children: [] });
  });

  it("BADGE_R and BULB match the badge dot and the bulb's glass", () => {
    const dot = (find('badge') as Group).children.find((n) => n.tag === 'circle' && !n.id);
    expect(Number(dot?.attrs.r)).toBe(BADGE_R);
    const glass = (find('sym-bulb-body') as Group).children[0];
    const xs = String(glass.attrs.d).match(/-?[\d.]+/g)!.map(Number).filter((_, i) => i % 2 === 0);
    expect(Math.min(...xs)).toBeCloseTo(BULB.cx - BULB.r, -0.5); // within 1.5 units
    expect(Math.max(...xs)).toBeCloseTo(BULB.cx + BULB.r, -0.5);
  });
});
