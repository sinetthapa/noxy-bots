import { describe, expect, it } from 'vitest';
import { nox } from './index.ts';

describe('Nox as data', () => {
  it("carries today's anchors (spec §3), with the axis at 312.25", () => {
    expect(nox.parts.body.find((b) => b.id === 'nox')).toMatchObject({
      axisX: 312.25,
      eye: [190.065, 484.347],
      ear: [133, 285],
      bolt: [34, 495],
      mouth: [312.2, 584],
      tilt: [312.1, 480],
      squash: [312.1, 707],
      shadowC: [312.1, 735],
      symbols: [312.1, 104],
      badge: [705, 240],
      zzz: { from: [380, 190], to: [470, 30] },
      highlight: [117.815, 508.313],
    });
  });

  it('draws the left ear and bolt in frame coordinates, hinged at their pivots', () => {
    expect(nox.parts.ears.find((s) => s.id === 'nox')).toMatchObject({ pivot: [133, 285], bounds: [16.5827, -9.56813, 211.574, 381.585] });
    expect(nox.parts.bolts.find((s) => s.id === 'nox')).toMatchObject({ pivot: [34, 495], bounds: [0, 438.53, 34.21468, 551.002] });
  });

  it('has the frame, the shared groups buildRig needs, and "none" sides', () => {
    expect(nox.frame).toEqual([-180, -60, 985, 830]);
    expect(nox.shared.map((n) => n.id)).toEqual(['glyphs-l', 'glyphs-r', 'symbols', 'badge']);
    expect(nox.parts.ears.at(-1)).toMatchObject({ id: 'none', shapes: [] });
    expect(nox.parts.bolts.at(-1)).toMatchObject({ id: 'none', shapes: [] });
  });

  it('every theme keeps a base whose shell is its bottom shell stop (M3 spec §4.2)', () => {
    for (const t of nox.themes) {
      expect(Object.keys(t.base).sort()).toEqual(['accent', 'eye', 'mouth', 'screen', 'shell']);
      expect(t.colors.shell[1].toUpperCase()).toBe(t.base.shell.toUpperCase());
    }
    expect(nox.themes.find((t) => t.id === 'classic')!.base).toEqual({ shell: '#92A7AD', screen: '#313E4F', eye: '#2EC7E6', accent: '#FA6C2E', mouth: '#EFEFEF' });
    expect(nox.themes.find((t) => t.id === 'onyx')!.base).toEqual({ shell: '#23272D', screen: '#0F1318', eye: '#2EC7E6', accent: '#FA6C2E', mouth: '#EFEFEF' });
  });
});
