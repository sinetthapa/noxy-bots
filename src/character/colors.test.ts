import { describe, expect, it } from 'vitest';
import { deriveTheme, mix } from './colors.ts';

describe('colors', () => {
  it('mix returns rgb() strings, clamped', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('rgb(128,128,128)');
    expect(mix('#000000', '#FFFFFF', 2)).toBe('rgb(255,255,255)');
  });

  it("deriveTheme on Classic's base gives the spec §7.2 column exactly", () => {
    expect(deriveTheme({ shell: '#92A7AD', screen: '#313E4F', eye: '#2EC7E6', accent: '#FA6C2E', mouth: '#EFEFEF' })).toEqual({
      shell: ['#FFFFFF', '#92A7AD'],
      earShell: ['#FFFFFF', '#D3DCDE'],
      trim: '#92A7AD',
      screen: ['#313E4F', '#141920'],
      accent: '#FA6C2E',
      accentLit: '#FCAE8C',
      glow: '#FB8958',
      eye: '#2EC7E6',
      eyeDim: '#0E3C45',
      eyeBright: '#B6EBF6',
      mouth: '#EFEFEF',
      symbol: '#FA6C2E',
    });
  });

  it('deriveTheme accepts lowercase input (colour pickers emit it) and returns uppercase', () => {
    expect(deriveTheme({ shell: '#92a7ad', screen: '#313e4f', eye: '#2ec7e6', accent: '#fa6c2e', mouth: '#efefef' }).trim).toBe('#92A7AD');
  });
});
