// Clipboard (M3 spec §6): false when the browser won't copy, so the UI can say what to do instead.
import { afterEach, expect, it, vi } from 'vitest';
import { copy, copyKeys } from './clipboard.ts';

afterEach(() => vi.unstubAllGlobals());

it('copies when the clipboard works', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  expect(await copy('hi')).toBe(true);
  expect(writeText).toHaveBeenCalledWith('hi');
});

it('false when permission is denied', async () => {
  vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.reject(new Error('NotAllowedError')) } });
  expect(await copy('hi')).toBe(false);
});

it('false when there is no clipboard (a plain-http page)', async () => {
  vi.stubGlobal('navigator', {});
  expect(await copy('hi')).toBe(false);
});

it('names ⌘C on Apple devices and Ctrl+C elsewhere', () => {
  expect(copyKeys('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15')).toBe('⌘C');
  expect(copyKeys('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('⌘C');
  expect(copyKeys('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0')).toBe('Ctrl+C');
  expect(copyKeys('Mozilla/5.0 (X11; Linux x86_64) Firefox/131.0')).toBe('Ctrl+C');
});
