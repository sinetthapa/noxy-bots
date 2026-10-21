// Studio state (M3 spec §5.2): one reducer is the source of truth; the URL, snippets and bot props derive from it.
import { DEFAULT_LOOK, NAMES, nox, PERSONALITIES, type Bot, type BotOptions, type DialName, type LookPatch, type Personality, type StateName, type ThemeBase } from 'noxy-bots';

export const PARTS = ['body', 'ears', 'eyes', 'bolts'] as const;
export const SIZE_KEYS = ['eye', 'eyeSpacing', 'ear', 'bolt'] as const;
export const SLOTS = ['shell', 'screen', 'eye', 'accent', 'mouth'] as const;
export type Part = (typeof PARTS)[number];
export type SizeKey = (typeof SIZE_KEYS)[number];
export type Slot = (typeof SLOTS)[number];
export type Gaze = { x: number; y: number } | null;

export interface StudioState {
  theme: string;
  parts: Record<Part, string>;
  sizes: Record<SizeKey, number>;
  /** Custom colours, or null for the theme's own. Never equal to the theme's base (the reducer normalises). */
  colors: ThemeBase | null;
  personality: Personality;
  /** Explicit dial overrides, kept even when equal to the preset. */
  dials: Partial<Record<DialName, number>>;
  /** The board's single selection: a base, activity or emotion name. */
  state: StateName;
  speed: number;
  /** null = none chosen (a random seed each mount); 0 is a real seed. */
  seed: number | null;
}

export const DEFAULTS: StudioState = Object.freeze({
  theme: DEFAULT_LOOK.theme as string,
  parts: { body: DEFAULT_LOOK.body, ears: DEFAULT_LOOK.ears, eyes: DEFAULT_LOOK.eyes, bolts: DEFAULT_LOOK.bolts },
  sizes: { ...DEFAULT_LOOK.sizes },
  colors: null,
  personality: 'default',
  dials: {},
  state: NAMES.base[0],
  speed: 1,
  seed: null,
});

export type Action =
  | { type: 'theme'; id: string }
  | { type: 'part'; part: Part; id: string }
  | { type: 'size'; key: SizeKey; value: number }
  | { type: 'color'; slot: Slot; value: string }
  | { type: 'personality'; name: Personality }
  | { type: 'dial'; name: DialName; value: number }
  | { type: 'resetDials' }
  | { type: 'state'; name: StateName }
  | { type: 'speed'; value: number }
  | { type: 'seed'; value: number | null }
  | { type: 'replace'; state: StudioState };

/** Two decimals, at entry, so the URL round-trips exactly. */
export const q = (v: number): number => Math.round(v * 100) / 100;

/** A theme's five colours, lowercase (what <input type="color"> gives back). Unknown ids fall back to the first theme. */
export function themeBase(id: string): ThemeBase {
  const t = nox.themes.find((x) => x.id === id) ?? nox.themes[0];
  return Object.fromEntries(SLOTS.map((k) => [k, t.base[k].toLowerCase()])) as unknown as ThemeBase;
}

/** null when the colours are the theme's own, so the studio and the snippet agree. */
export function normalise(theme: string, c: ThemeBase): ThemeBase | null {
  const b = themeBase(theme);
  return SLOTS.every((k) => c[k] === b[k]) ? null : c;
}

export function reduce(s: StudioState, a: Action): StudioState {
  switch (a.type) {
    case 'theme':
      return { ...s, theme: a.id, colors: null };
    case 'part':
      return { ...s, parts: { ...s.parts, [a.part]: a.id } };
    case 'size':
      return { ...s, sizes: { ...s.sizes, [a.key]: q(a.value) } };
    case 'color':
      return { ...s, colors: normalise(s.theme, { ...(s.colors ?? themeBase(s.theme)), [a.slot]: a.value.toLowerCase() }) };
    case 'personality':
      return { ...s, personality: a.name };
    case 'dial':
      return { ...s, dials: { ...s.dials, [a.name]: q(a.value) } };
    case 'resetDials':
      return { ...s, dials: {} };
    case 'state':
      return { ...s, state: a.name };
    case 'speed':
      return { ...s, speed: q(a.value) };
    case 'seed':
      return { ...s, seed: a.value };
    case 'replace':
      return a.state;
  }
}

/** 🎲: a theme, parts, sizes 0.85–1.15 and a personality. Clears colours and dials; keeps state, speed and seed (spec §5.4). */
export function randomize(s: StudioState, r: () => number = Math.random): StudioState {
  const pick = <T,>(list: readonly T[]): T => list[Math.min(list.length - 1, Math.floor(r() * list.length))];
  return {
    ...s,
    theme: pick(nox.themes).id,
    parts: Object.fromEntries(PARTS.map((p) => [p, pick<{ id: string }>(nox.parts[p]).id])) as StudioState['parts'],
    sizes: Object.fromEntries(SIZE_KEYS.map((k) => [k, q(0.85 + r() * 0.3)])) as StudioState['sizes'],
    personality: pick(Object.keys(PERSONALITIES) as Personality[]),
    colors: null,
    dials: {},
  };
}

export const lookOf = (s: StudioState): LookPatch => ({ ...s.parts, theme: s.colors ? { base: { ...s.colors } } : s.theme, sizes: { ...s.sizes } });

/** The main bot's props. Seed only when chosen: NoxyBot reads it on mount, and the stage remounts on a change. */
export const botProps = (s: StudioState): BotOptions => ({
  look: lookOf(s),
  personality: s.personality,
  ...s.dials,
  speed: s.speed,
  ...(s.seed === null ? {} : { seed: s.seed }),
});

/** Exactly this state, like a fresh createBot({ state }); state() alone keeps the other layers (spec §5.2). */
export function showState(bot: Bot, name: StateName): void {
  if (!(NAMES.base as readonly string[]).includes(name)) bot.state('idle');
  bot.state(name);
}

/** The seed field: '' is none (null); otherwise an integer 0–4294967295, else undefined (ignore the keystroke). */
export function seedFrom(raw: string): number | null | undefined {
  if (raw.trim() === '') return null;
  const v = Number(raw);
  return Number.isInteger(v) && v >= 0 && v <= 4294967295 ? v : undefined;
}
