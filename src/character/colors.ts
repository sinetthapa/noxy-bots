import type { Colors, ThemeBase } from './types.ts';

export const rgb = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function blend(a: string, b: string, t: number): number[] {
  const A = rgb(a);
  const B = rgb(b);
  const k = Math.min(1, Math.max(0, t));
  return A.map((v, i) => Math.round(v + (B[i] - v) * k));
}

/** `rgb(r,g,b)` between two hex colours; the renderer's per-frame blends (the golden pins these strings). */
export const mix = (a: string, b: string, t: number): string => `rgb(${blend(a, b, t).join(',')})`;

const hex = (a: string, b: string, t: number): string =>
  '#' + blend(a, b, t).map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

/** A full theme from 5 base colours (spec §7.2). Returns uppercase #RRGGBB. */
export function deriveTheme(base: ThemeBase): Colors {
  const [S, Sc, E, A, M] = [base.shell, base.screen, base.eye, base.accent, base.mouth].map((c) => c.toUpperCase());
  return {
    shell: ['#FFFFFF', S],
    earShell: ['#FFFFFF', hex(S, '#FFFFFF', 0.6)],
    trim: S,
    screen: [Sc, hex(Sc, '#000000', 0.6)],
    accent: A,
    accentLit: hex(A, '#FFFFFF', 0.45),
    glow: hex(A, '#FFFFFF', 0.2),
    eye: E,
    eyeDim: hex(E, '#000000', 0.7),
    eyeBright: hex(E, '#FFFFFF', 0.65),
    mouth: M,
    symbol: A,
  };
}
