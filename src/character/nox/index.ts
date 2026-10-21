import { deriveTheme } from '../colors.ts';
import type { Character, Colors, Look, Side, Theme, ThemeBase } from '../types.ts';
import * as parts from './parts.gen.ts';

/** Today's exact colours (spec §7.2). */
export const CLASSIC: Colors = {
  shell: ['#FFFFFF', '#92A7AD'],
  earShell: ['#FFFFFF', '#D9E0E3'],
  trim: '#95A9AF',
  screen: ['#313E4F', '#12171D'],
  accent: '#FA6C2E',
  accentLit: '#FFB089',
  glow: '#FF8A4C',
  eye: '#2EC7E6',
  eyeDim: '#0F3D47',
  eyeBright: '#B8F4FF',
  mouth: '#EFEFEF',
  symbol: '#FC721A',
};

const NONE: Side = { id: 'none', name: 'None', shapes: [], gradients: [], pivot: [0, 0], bounds: [0, 0, 0, 0] };

/** A theme drawn from its five base colours. */
const derived = (id: string, name: string, base: ThemeBase): Theme => ({ id, name, base, colors: deriveTheme(base) });

export const nox: Character = {
  id: 'nox',
  name: 'Nox',
  frame: parts.frame,
  parts: {
    body: parts.body,
    ears: [...parts.ears, NONE],
    eyes: [
      { id: 'capsule', name: 'Capsule', w: 53.6758, h: 114.41 },
      { id: 'round', name: 'Round', w: 72, h: 72 },
    ],
    bolts: [...parts.bolts, NONE],
  },
  shared: parts.shared,
  themes: [
    { id: 'classic', name: 'Classic', base: { shell: '#92A7AD', screen: '#313E4F', eye: '#2EC7E6', accent: '#FA6C2E', mouth: '#EFEFEF' }, colors: CLASSIC },
    // Proposals for the user's swatch sheet (spec §7.2); working names.
    derived('midnight', 'Midnight', { shell: '#5B6B85', screen: '#0B0F17', eye: '#8AB4FF', accent: '#FFB547', mouth: '#E6ECF5' }),
    derived('mint', 'Mint', { shell: '#9FD8C8', screen: '#1E3B38', eye: '#7CFFCB', accent: '#FF7A59', mouth: '#F2FFF9' }),
    derived('bubblegum', 'Bubblegum', { shell: '#F4A9C8', screen: '#3A1F3D', eye: '#FFE066', accent: '#FF4F9A', mouth: '#FFF0F6' }),
    // Dark, hand-tuned: deriveTheme keeps the shell's top stop white, which can't read as dark.
    {
      id: 'onyx',
      name: 'Onyx',
      base: { shell: '#23272D', screen: '#0F1318', eye: '#2EC7E6', accent: '#FA6C2E', mouth: '#EFEFEF' },
      colors: { ...CLASSIC, shell: ['#59616B', '#23272D'], earShell: ['#59616B', '#30353C'], trim: '#3D434B', screen: ['#0F1318', '#050608'] },
    },
  ],
  license: { art: 'CC-BY-4.0', author: 'sinetthapa', source: 'https://github.com/sinetthapa/noxy-bots' },
};

export const DEFAULT_LOOK: Look = {
  body: 'nox',
  ears: 'nox',
  eyes: 'capsule',
  bolts: 'nox',
  sizes: { eye: 1, eyeSpacing: 1, ear: 1, bolt: 1 },
  theme: 'classic',
};
