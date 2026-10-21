// @vitest-environment happy-dom
// Code snippets (M3 spec §5.5): each one shows the same Nox the studio shows.
import { createBot, DEFAULT_LOOK } from 'noxy-bots';
import 'noxy-bots/element';
import type { NoxyBotElement } from 'noxy-bots/element';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Nox } from '../../src/brain/nox.ts';
import { PERSONALITIES, tuningFor } from '../../src/brain/personality.ts';
import { highlight, options, snippet } from './snippets.ts';
import { DEFAULTS, lookOf, themeBase, type StudioState } from './state.ts';

const brains = vi.hoisted(() => [] as Nox[]);
vi.mock('../../src/brain/nox.ts', async (importOriginal) => {
  const m = await importOriginal<typeof import('../../src/brain/nox.ts')>();
  return { ...m, createNox: (o: Parameters<typeof m.createNox>[0]) => (brains.push(m.createNox(o)), brains.at(-1)!) };
});
beforeAll(() => {
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => {
  document.body.textContent = '';
});

const sample: StudioState = {
  ...DEFAULTS,
  theme: 'mint',
  parts: { ...DEFAULTS.parts, ears: 'antenna' },
  sizes: { ...DEFAULTS.sizes, eye: 1.1 },
  colors: { ...themeBase('mint'), eye: '#00ff00' },
  personality: 'curious',
  dials: { blink: 1.4 },
  state: 'thinking',
  speed: 1.5,
  seed: 7,
};
/** Evaluates the object literal after `marker` in a snippet: proves it is valid JS. */
const literalAfter = (text: string, marker: string, end: string) => new Function(`return (${text.slice(text.indexOf(marker) + marker.length, text.lastIndexOf(end))})`)();
const lower = (v: unknown) => JSON.parse(JSON.stringify(v).toLowerCase());

describe('snippet', () => {
  it('html: the attributes are the URL parameters, one per line past two', () => {
    expect(snippet(sample, 'html')).toBe(`<script type="module">
  import 'noxy-bots/element';
</script>

<noxy-bot
  theme="mint"
  ears="antenna"
  eye-size="1.1"
  color-eye="#00ff00"
  personality="curious"
  blink="1.4"
  state="thinking"
  speed="1.5"
  seed="7"
></noxy-bot>`);
    expect(snippet({ ...DEFAULTS, theme: 'mint' }, 'html')).toMatch(/<noxy-bot theme="mint"><\/noxy-bot>$/);
    expect(snippet(DEFAULTS, 'html')).toMatch(/<noxy-bot><\/noxy-bot>$/);
  });

  it('react and js: valid literals with the same options', () => {
    const react = snippet(sample, 'react');
    expect(react.startsWith("import { NoxyBot } from 'noxy-bots/react';\n\n<NoxyBot\n")).toBe(true);
    expect(react).toContain('\n  personality="curious"\n  blink={1.4}\n  state="thinking"\n  speed={1.5}\n  seed={7}\n/>');
    expect(literalAfter(react, 'look={', '}\n  personality')).toEqual(options(sample).look);
    const js = snippet(sample, 'js');
    expect(js.startsWith("import { createBot } from 'noxy-bots';\n\nconst bot = createBot(document.getElementById('nox'), {")).toBe(true);
    expect(literalAfter(js, "getElementById('nox'), ", ');')).toEqual(options(sample));
    expect(snippet(DEFAULTS, 'react')).toBe("import { NoxyBot } from 'noxy-bots/react';\n\n<NoxyBot />");
    expect(snippet(DEFAULTS, 'js')).toBe("import { createBot } from 'noxy-bots';\n\nconst bot = createBot(document.getElementById('nox'));");
  });

  it('json: the options object, which createBot accepts', () => {
    const o = JSON.parse(snippet(sample, 'json'));
    expect(o).toEqual(options(sample));
    expect(o.look.theme).toEqual({ base: sample.colors });
    expect(() => createBot(document.body.appendChild(document.createElement('div')), o)).not.toThrow();
    expect(snippet(DEFAULTS, 'json')).toBe('{}');
  });

  it('explicit dials always appear', () => {
    expect(options({ ...DEFAULTS, dials: { blink: 1 } })).toEqual({ blink: 1 });
  });

  it('the HTML snippet, in a real <noxy-bot>, shows the same look and dials', () => {
    const doc = new DOMParser().parseFromString(snippet(sample, 'html'), 'text/html');
    const e = document.createElement('noxy-bot') as NoxyBotElement;
    for (const a of doc.querySelector('noxy-bot')!.attributes) e.setAttribute(a.name, a.value);
    document.body.append(e);
    expect(lower(e.bot!.look)).toEqual(lower({ ...DEFAULT_LOOK, ...lookOf(sample) }));
    expect(brains.at(-1)!.tuning).toEqual(tuningFor({ ...PERSONALITIES.curious, blink: 1.4 }));
    expect(brains.at(-1)!.resolver.effectiveActivity).toBe('THINKING');
  });
});

describe('highlight', () => {
  it('keywords and strings', () =>
    expect(highlight("import 'noxy-bots';")).toBe(`<span class="t-kw">import</span> <span class="t-str">'noxy-bots'</span>;`));
  it('object keys and numbers', () => expect(highlight('eye: 1.05,')).toBe('<span class="t-key">eye</span>: <span class="t-num">1.05</span>,'));
  it('tags and attributes, with markup escaped', () =>
    expect(highlight('<noxy-bot state="idle"></noxy-bot>')).toBe(
      '<span class="t-tag">&lt;noxy-bot</span> <span class="t-attr">state</span>=<span class="t-str">&quot;idle&quot;</span><span class="t-tag">&gt;</span><span class="t-tag">&lt;/noxy-bot</span><span class="t-tag">&gt;</span>',
    ));
  it('comments run to the end of the line', () => expect(highlight('// a <b>\nx')).toBe('<span class="t-com">// a &lt;b&gt;</span>\nx'));
  it('plain text is escaped', () => expect(highlight('a & b')).toBe('a &amp; b'));
});
