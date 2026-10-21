// Settings in the URL (M3 spec §5.3): parameters named like <noxy-bot> attributes, checked by allowlist, never put into markup.
import { DIALS, NAMES, nox, PERSONALITIES, type DialName, type Personality, type ThemeBase } from 'noxy-bots';
import { DEFAULTS, normalise, PARTS, q, SIZE_KEYS, SLOTS, themeBase, type Part, type SizeKey, type StudioState } from './state.ts';

const SIZE_PARAMS: Record<string, SizeKey> = { 'eye-size': 'eye', 'eye-spacing': 'eyeSpacing', 'ear-size': 'ear', 'bolt-size': 'bolt' };
export const PARAMS = [
  'theme', ...PARTS, ...Object.keys(SIZE_PARAMS), ...SLOTS.map((k) => `color-${k}`), 'personality', ...DIALS, 'state', 'speed', 'seed',
] as const;

const HEX = /^#[0-9a-f]{6}$/i; // the same rule as the package's internal HEX (src/character/look.ts:4), which isn't public API
const KEPT_STATES: readonly string[] = [...NAMES.base, ...NAMES.activity, ...NAMES.emotion]; // events play once, so they aren't kept
const has = (list: readonly { id: string }[], id: string) => list.some((x) => x.id === id);

/** A finite number in range (2 decimals), an integer when `int`, else undefined. */
function numberIn(raw: string, lo: number, hi: number, int = false): number | undefined {
  if (raw.trim() === '') return undefined;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < lo || v > hi || (int && !Number.isInteger(v))) return undefined;
  return int ? v : q(v);
}

/** The numeric parameters: [lo, hi, integer]. */
const RANGES: Record<string, [number, number, boolean?]> = {
  ...Object.fromEntries(Object.keys(SIZE_PARAMS).map((k) => [k, [0.7, 1.3]])),
  ...Object.fromEntries(DIALS.map((k) => [k, [0, 2]])),
  speed: [0.1, 4],
  seed: [0, 4294967295, true],
};

/** Applies one known parameter to s (or to colours); false when its value is bad. */
function apply(s: StudioState, colors: Partial<ThemeBase>, key: string, raw: string): boolean {
  if (key === 'theme') {
    if (!has(nox.themes, raw)) return false;
    s.theme = raw;
  } else if ((PARTS as readonly string[]).includes(key)) {
    if (!has(nox.parts[key as Part], raw)) return false;
    s.parts[key as Part] = raw;
  } else if (key.startsWith('color-')) {
    if (!HEX.test(raw)) return false;
    colors[key.slice('color-'.length) as keyof ThemeBase] = raw.toLowerCase();
  } else if (key === 'personality') {
    if (!Object.hasOwn(PERSONALITIES, raw)) return false;
    s.personality = raw as Personality;
  } else if (key === 'state') {
    if (!KEPT_STATES.includes(raw)) return false;
    s.state = raw as StudioState['state'];
  } else {
    const [lo, hi, int] = RANGES[key];
    const v = numberIn(raw, lo, hi, int);
    if (v === undefined) return false;
    if (Object.hasOwn(SIZE_PARAMS, key)) s.sizes[SIZE_PARAMS[key]] = v;
    else if (key === 'speed') s.speed = v;
    else if (key === 'seed') s.seed = v;
    else s.dials[key as DialName] = v;
  }
  return true;
}

/** Reads a link. Only known names are looked at, by our own list; a bad value is dropped and named in `ignored`. */
export function parse(search: string): { state: StudioState; ignored: string[] } {
  const p = new URLSearchParams(search);
  const s = structuredClone(DEFAULTS);
  const colors: Partial<ThemeBase> = {};
  const ignored: string[] = [];
  for (const key of PARAMS) {
    const raw = p.get(key); // the first of a repeat
    if (raw !== null && (raw.length > 64 || !apply(s, colors, key, raw))) ignored.push(key);
  }
  if (Object.keys(colors).length) s.colors = normalise(s.theme, { ...themeBase(s.theme), ...colors });
  return { state: s, ignored };
}

/** Non-default values in PARAMS order; explicit dials always; seed only when chosen. */
export function serialize(s: StudioState): string {
  const p = new URLSearchParams();
  if (s.theme !== DEFAULTS.theme) p.set('theme', s.theme);
  for (const part of PARTS) if (s.parts[part] !== DEFAULTS.parts[part]) p.set(part, s.parts[part]);
  for (const [param, key] of Object.entries(SIZE_PARAMS)) if (s.sizes[key] !== DEFAULTS.sizes[key]) p.set(param, String(s.sizes[key]));
  if (s.colors) {
    const base = themeBase(s.theme);
    for (const k of SLOTS) if (s.colors[k] !== base[k]) p.set(`color-${k}`, s.colors[k]);
  }
  if (s.personality !== DEFAULTS.personality) p.set('personality', s.personality);
  for (const k of DIALS) if (s.dials[k] !== undefined) p.set(k, String(s.dials[k]));
  if (s.state !== DEFAULTS.state) p.set('state', s.state);
  if (s.speed !== DEFAULTS.speed) p.set('speed', String(s.speed));
  if (s.seed !== null) p.set('seed', String(s.seed));
  return p.toString();
}

/** The link Copy link copies: built from state, never location.href, so it doesn't depend on the last URL write. */
export const link = (query: string): string => location.origin + location.pathname + (query ? `?${query}` : '');

/** Puts the query in the address bar. Safari throws after too many replaceState calls; that write is dropped. */
export function writeUrl(query: string): void {
  try {
    history.replaceState(null, '', query ? `?${query}` : location.pathname);
  } catch {
    // dropped: the next change writes again, and Copy link never reads the address bar
  }
}
