// No DOM here, as on a server: importing the element module must do nothing and not throw.
import { expect, it } from 'vitest';

it('imports on a server without a DOM', async () => {
  expect(typeof HTMLElement).toBe('undefined');
  await expect(import('./element.ts')).resolves.toBeDefined();
});
