// Code snippets (M3 spec §5.5): built from checked state only, and shown as text or through highlight(), which escapes every character.
import { DEFAULTS, PARTS, SIZE_KEYS, type StudioState } from './state.ts';
import { serialize } from './url.ts';

export type Format = 'html' | 'react' | 'js' | 'json';
export const FORMATS: readonly [Format, string][] = [['html', 'HTML'], ['react', 'React'], ['js', 'JS'], ['json', 'JSON']];

/** The createBot options for this state: non-default values, explicit dials always. */
export function options(s: StudioState): Record<string, unknown> {
  const look: Record<string, unknown> = {};
  for (const part of PARTS) if (s.parts[part] !== DEFAULTS.parts[part]) look[part] = s.parts[part];
  if (s.colors) look.theme = { base: { ...s.colors } };
  else if (s.theme !== DEFAULTS.theme) look.theme = s.theme;
  const sizes = Object.fromEntries(SIZE_KEYS.filter((k) => s.sizes[k] !== DEFAULTS.sizes[k]).map((k) => [k, s.sizes[k]]));
  if (Object.keys(sizes).length) look.sizes = sizes;
  const o: Record<string, unknown> = {};
  if (Object.keys(look).length) o.look = look;
  if (s.personality !== DEFAULTS.personality) o.personality = s.personality;
  for (const [k, v] of Object.entries(s.dials)) o[k] = v;
  if (s.state !== DEFAULTS.state) o.state = s.state;
  if (s.speed !== DEFAULTS.speed) o.speed = s.speed;
  if (s.seed !== null) o.seed = s.seed;
  return o;
}

/** A JS object literal: unquoted keys, single-quoted strings. Values are checked ids, names, numbers and hex colours, so they hold no quotes. */
const literal = (v: unknown): string => JSON.stringify(v, null, 2).replace(/"(\w+)":/g, '$1:').replaceAll('"', "'");
const esc = (s: string): string => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function snippet(s: StudioState, format: Format): string {
  if (format === 'json') return JSON.stringify(options(s), null, 2);
  if (format === 'html') {
    const attrs = [...new URLSearchParams(serialize(s))].map(([k, v]) => `${k}="${esc(v)}"`);
    const tag = attrs.length > 2 ? `<noxy-bot\n  ${attrs.join('\n  ')}\n></noxy-bot>` : `<noxy-bot${attrs.map((a) => ` ${a}`).join('')}></noxy-bot>`;
    return `<script type="module">\n  import 'noxy-bots/element';\n</script>\n\n${tag}`;
  }
  const o = options(s);
  if (format === 'react') {
    const props = Object.entries(o).map(([k, v]) => (typeof v === 'string' ? `${k}="${v}"` : `${k}={${literal(v).replaceAll('\n', '\n  ')}}`));
    return `import { NoxyBot } from 'noxy-bots/react';\n\n<NoxyBot${props.length ? `\n  ${props.join('\n  ')}\n` : ' '}/>`;
  }
  const rest = Object.keys(o).length ? `, ${literal(o)}` : '';
  return `import { createBot } from 'noxy-bots';\n\nconst bot = createBot(document.getElementById('nox')${rest});`;
}

// One alternative per token class, in priority order; anything unmatched stays plain (escaped).
const TOKENS = /(\/\/.*)|('[^'\n]*'|"[^"\n]*")|(<\/?[\w-]+|\/?>)|\b(import|from|const|true|false)\b|\b(\d+(?:\.\d+)?)\b|([\w-]+)(?==)|(\w+)(?=:)/g;
const CLASSES = ['t-com', 't-str', 't-tag', 't-kw', 't-num', 't-attr', 't-key'];

/** Code colours (the studio's code panel and the landing's code window): escaped HTML with a span per token. Snippets are ours, so a regex is enough (ponytail: no real parser). */
export function highlight(code: string): string {
  let out = '';
  let last = 0;
  for (const m of code.matchAll(TOKENS)) {
    const i = m.slice(1).findIndex((g) => g !== undefined);
    out += esc(code.slice(last, m.index)) + `<span class="${CLASSES[i]}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(code.slice(last));
}
