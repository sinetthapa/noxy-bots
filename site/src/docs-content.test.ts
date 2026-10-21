// @vitest-environment happy-dom
// The docs pages against the code (M5 spec §6.1): each one converts to Markdown, and each reference page names everything it covers,
// so a new state, part, theme, attribute or method fails here until the page has it.
import { createBot, NAMES, nox, PERSONALITIES, type Motion } from 'noxy-bots';
import { describe, expect, test } from 'vitest';
import { PARAMS } from '../../studio/src/url.ts';
import { toMarkdown } from './docs.ts';

const files = import.meta.glob<string>('./content/docs/*.mdx', { query: '?raw', import: 'default', eager: true });
const page = (id: string) => files[`./content/docs/${id}.mdx`];
const body = (id: string) => page(id).replace(/^---\n[\s\S]*?\n---\n/, '');
const ticked = (text: string, names: readonly string[]) => names.filter((n) => !text.includes(`\`${n}\``));
// Motion is a type only: a new mode fails the typecheck here until it's listed.
const MOTIONS: Record<Motion, true> = { auto: true, full: true, calm: true, still: true };

describe('docs pages', () => {
  test.each(Object.keys(files).map((f) => f.slice('./content/docs/'.length, -'.mdx'.length)))('%s converts to Markdown', (id) => {
    expect(() => toMarkdown({ title: id, description: '' }, body(id))).not.toThrow();
  });

  test('states shows every layer', () => {
    for (const layer of Object.keys(NAMES)) expect(page('states')).toContain(`<StateChips layer="${layer}" />`);
    const n = Object.values(NAMES).flat().length;
    expect(page('states')).toContain(`All ${n} of`);
    for (const id of ['states', 'api']) expect(page(id)).toContain(`any of the ${n}`);
  });

  test('parts names every part and variant', () => {
    expect(ticked(page('parts'), Object.entries(nox.parts).flatMap(([part, list]) => [part, ...list.map((v) => v.id)]))).toEqual([]);
  });

  test('themes names every theme and colour', () => {
    expect(ticked(page('themes'), [...nox.themes.map((t) => t.id), ...PARAMS.filter((p) => p.startsWith('color-'))])).toEqual([]);
  });

  test('the API reference names every attribute, personality, motion mode and method', async () => {
    await import('noxy-bots/element'); // registers <noxy-bot>
    const attrs: string[] = (customElements.get('noxy-bot') as unknown as { observedAttributes: string[] }).observedAttributes;
    const methods = Object.keys(createBot(document.createElement('div'))).map((m) => (m === 'look' || m === 'paused' ? m : `${m}(`));
    const api = page('api');
    expect(ticked(api, [...attrs, ...Object.keys(PERSONALITIES), ...Object.keys(MOTIONS)])).toEqual([]);
    expect(methods.filter((m) => !api.includes(`\`${m}`))).toEqual([]);
  });
});
