import { describe, expect, it } from 'vitest';
import { resolveLook } from './look.ts';
import { CLASSIC, DEFAULT_LOOK, nox } from './nox/index.ts';
import type { Look } from './types.ts';

const look = (o: Partial<Look>): Look => ({ ...DEFAULT_LOOK, ...o });

describe('resolveLook', () => {
  it('Classic: the body anchors, the right side mirrored about the axis, Classic colours', () => {
    const l = resolveLook(nox, DEFAULT_LOOK);
    expect(l.ear).toEqual({ anchor: { L: [133, 285], R: [491.5, 285] }, pivot: [133, 285], size: 1 });
    expect(l.bolt).toEqual({ anchor: { L: [34, 495], R: [590.5, 495] }, pivot: [34, 495], size: 1 });
    expect(l.eye.w).toBe(53.6758);
    expect(l.eye.c.L[0]).toBeCloseTo(190.065, 9);
    expect(l.eye.c.R[0]).toBeCloseTo(434.435, 9);
    expect(l.loader[0]).toBeCloseTo(312.25, 9);
    expect(l.shadow).toEqual([312.1, 735]);
    expect(l.highlight).toEqual([117.815, 508.313]);
    expect(l.colors).toBe(CLASSIC);
  });

  it('applies sizes: eye scales w/h, spacing scales the distance from the axis, ear/bolt pass through', () => {
    const l = resolveLook(nox, look({ sizes: { eye: 1.2, eyeSpacing: 0.8, ear: 0.9, bolt: 1.1 } }));
    expect(l.eye.w).toBeCloseTo(53.6758 * 1.2, 9);
    expect(312.25 - l.eye.c.L[0]).toBeCloseTo((312.25 - 190.065) * 0.8, 9);
    expect([l.ear.size, l.bolt.size]).toEqual([0.9, 1.1]);
  });

  it('accepts the size range ends, with slider float noise', () => {
    const l = resolveLook(nox, look({ sizes: { eye: 0.7, eyeSpacing: 1.3, ear: 0.7 + 60 * 0.01, bolt: 1 } }));
    expect(l.ear.size).toBeCloseTo(1.3, 9);
  });

  it('derives a custom theme from 5 base colours, any case', () => {
    const l = resolveLook(nox, look({ theme: { base: { shell: '#336699', screen: '#101010', eye: '#00ff00', accent: '#FF0000', mouth: '#FFFFFF' } } }));
    expect(l.colors.eye).toBe('#00FF00');
    expect(l.colors.shell).toEqual(['#FFFFFF', '#336699']);
  });

  it('reads each base colour once: a getter cannot swap in a bad one after the check', () => {
    let reads = 0;
    const base = { screen: '#101010', eye: '#00ff00', accent: '#FF0000', mouth: '#FFFFFF', get shell() { return reads++ ? '"/><x/>' : '#000000'; } };
    const colors = Object.values(resolveLook(nox, look({ theme: { base } })).colors).flat();
    expect(colors.filter((c) => !/^#[0-9A-F]{6}$/.test(c))).toEqual([]);
  });

  it.each([
    [look({ body: 'blob' }), /^noxy-bots: unknown body "blob"; valid: .*\bnox\b/],
    [look({ ears: 'x' }), /unknown ears "x"; valid: .*\bnone\b/],
    [look({ theme: 'neon' }), /unknown theme "neon"; valid: .*\bclassic\b/],
    [look({ theme: { base: { shell: 'red', screen: '#000000', eye: '#000000', accent: '#000000', mouth: '#000000' } } }), /theme.base.shell must be #rrggbb, got "red"/],
    [look(JSON.parse('{"theme":{"base":{"shell":"#000000"}}}')), /theme.base.screen must be #rrggbb, got "undefined"/],
    [look(JSON.parse('{"theme":null}')), /noxy-bots: theme must be a theme id or \{ base \}, got null/],
    [look(JSON.parse('{"theme":{"base":{"shell":["#aabbcc"],"screen":"#000000","eye":"#000000","accent":"#000000","mouth":"#000000"}}}')), /^noxy-bots: theme.base.shell must be #rrggbb/],
    [look({ sizes: { eye: 5, eyeSpacing: 1, ear: 1, bolt: 1 } }), /noxy-bots: sizes.eye must be a number from 0.7 to 1.3, got 5/],
    [look({ sizes: { eye: 1, eyeSpacing: 1, ear: 1, bolt: 1.31 } }), /sizes.bolt must be a number from 0.7 to 1.3, got 1.31/],
    [look({ sizes: { eye: 1, eyeSpacing: Number.NaN, ear: 1, bolt: 1 } }), /sizes.eyeSpacing must be a number from 0.7 to 1.3, got NaN/],
    [look(JSON.parse('{"sizes":{"eye":1}}')), /sizes.eyeSpacing must be a number from 0.7 to 1.3, got undefined/],
    [look(JSON.parse('{"sizes":null}')), /sizes.eye must be a number from 0.7 to 1.3, got undefined/],
  ])('throws on bad input, listing the valid ids', (l, message) => {
    expect(() => resolveLook(nox, l)).toThrow(message);
  });
});
