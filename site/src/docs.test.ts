import { describe, expect, test } from 'vitest';
import { snippet } from '../../studio/src/snippets.ts';
import { DEFAULTS } from '../../studio/src/state.ts';
import { demoState, heading, llmsTxt, mdPath, pagePath, toMarkdown } from './docs.ts';

describe('demoState', () => {
  test('no attrs is the default Nox', () => expect(demoState('')).toEqual(DEFAULTS));
  test('reads studio parameters', () => {
    const s = demoState('state=thinking theme=mint eyes=round eye-size=1.2');
    expect([s.state, s.theme, s.parts.eyes, s.sizes.eye]).toEqual(['thinking', 'mint', 'round', 1.2]);
  });
  test('a hex colour keeps its #', () => expect(demoState('color-eye=#7CFFCB').colors?.eye).toBe('#7cffcb'));
  test.each([
    ['eye=round', 'an unknown name (parse() skips it)'],
    ['theme=mintt', 'a bad value'],
    ['state=laugh', 'an event (it plays once, so it is not kept)'],
    ['theme', 'no value'],
    ['theme=', 'an empty value'],
    ['theme=mint theme=onyx', 'a repeat'],
    ['theme="mint"', 'quotes'],
  ])('throws on %s: %s', (attrs) => expect(() => demoState(attrs)).toThrow(/^Demo: bad/));
});

test('heading starts lower case, acronyms aside', () => {
  expect(heading('Getting started')).toBe('getting started');
  expect(heading('API reference')).toBe('API reference');
});

test('paths: /docs is Getting started, its copy /docs/index.md', () => {
  expect([pagePath('index'), pagePath('states'), mdPath('index'), mdPath('states')]).toEqual(['/docs', '/docs/states', '/docs/index.md', '/docs/states.md']);
});

describe('toMarkdown', () => {
  const page = { title: 'States', description: 'All of them: "29".' };
  test('frontmatter, then the body', () => expect(toMarkdown(page, 'Hi.')).toBe('---\ntitle: "States"\ndescription: "All of them: \\"29\\"."\n---\n\nHi.'));
  test('a Demo line becomes its HTML snippet', () => {
    expect(toMarkdown(page, '<Demo attrs="theme=mint" />')).toContain('```html\n' + snippet(demoState('theme=mint'), 'html') + '\n```');
  });
  test('a StateChips line becomes the layer\'s names', () => expect(toMarkdown(page, '<StateChips layer="base" />')).toContain('`idle`, `focused`, `break`, `drowsy`, `sleep`, `deep-sleep`'));
  test('code blocks and inline code pass through', () => {
    const body = '```jsx\n<NoxyBot state="happy" />\n<Demo attrs="nope" />\n```\nUse `<NoxyBot>` or `<noxy-bot>`.';
    expect(toMarkdown(page, body)).toContain(body);
  });
  test.each([
    ["<Demo attrs='theme=mint' />"],
    ['<Demo attrs="theme=mint"/>'],
    ['  <Demo attrs="theme=mint" />'],
    ['<Demo attrs="theme=mint">'],
    ['Text <Demo attrs="" /> inline'],
    ['<StateChips layer="mood" />'],
    ['<Callout>Hi</Callout>'],
  ])('throws on any other component form: %s', (line) => expect(() => toMarkdown(page, line)).toThrow());
  test('a bad Demo value fails here too', () => expect(() => toMarkdown(page, '<Demo attrs="theme=mintt" />')).toThrow(/^Demo: bad/));
});

test('llms.txt lists every page in order, absolute', () => {
  const txt = llmsTxt([
    { id: 'states', title: 'States', description: 'All 29.', order: 2 },
    { id: 'index', title: 'Getting started', description: 'Install.', order: 1 },
  ], new URL('https://noxybots.com'));
  expect(txt).toMatch(/^# noxybots\n\n> .+\n\n## Docs\n\n- \[Getting started\]\(https:\/\/noxybots\.com\/docs\/index\.md\): Install\.\n- \[States\]\(https:\/\/noxybots\.com\/docs\/states\.md\): All 29\.\n$/);
});
