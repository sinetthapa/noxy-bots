// @vitest-environment happy-dom
// Its own file: the element must be created before the module that defines it is imported.
import { expect, it, vi } from 'vitest';
import type { NoxyBotElement } from './element.ts';

it('keeps a look set before the element upgraded', async () => {
  vi.stubGlobal('requestAnimationFrame', () => 0);
  const e = document.createElement('noxy-bot') as NoxyBotElement;
  e.look = { ears: 'none' };
  document.body.append(e);
  await import('./element.ts');
  expect(e.bot!.look.ears).toBe('none');
});
