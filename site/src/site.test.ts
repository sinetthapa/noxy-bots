import { expect, test } from 'vitest';
import { current, pathOf } from './site.ts';

test.each([
  ['/', '/'],
  ['/index.html', '/'],
  ['/studio', '/studio'],
  ['/studio/', '/studio'],
  ['/studio.html', '/studio'],
  ['/404.html', '/404'],
  ['/docs.html', '/docs'],
  ['/docs/states.html', '/docs/states'],
])('pathOf(%s) is %s', (p, want) => {
  expect(pathOf(new URL(p, 'https://noxybots.com'))).toBe(want);
});

test.each([
  ['/docs', '/docs', 'page'],
  ['/docs/states', '/docs', 'true'],
  ['/docsx', '/docs', undefined],
  ['/', '/docs', undefined],
])('current(%s, %s) is %s', (here, href, want) => {
  expect(current(here, href)).toBe(want);
});
