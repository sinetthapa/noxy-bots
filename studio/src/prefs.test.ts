// @vitest-environment happy-dom
// Saved preferences (M3 spec §5.2): a private window whose storage throws still opens with the defaults.
import { afterEach, expect, it, vi } from 'vitest';
import { load, save } from './prefs.ts';

afterEach(() => vi.restoreAllMocks());

it('reads a saved, allowed value', () => {
  save('noxy-test', 'dark');
  expect(load('noxy-test', ['system', 'light', 'dark'], 'system')).toBe('dark');
});

it('an unknown saved value falls back', () => {
  localStorage.setItem('noxy-test', 'purple');
  expect(load('noxy-test', ['system', 'light', 'dark'], 'system')).toBe('system');
});

it('storage that throws falls back on read and is ignored on write', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('SecurityError');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('QuotaExceededError');
  });
  expect(load('noxy-test', ['simple', 'advanced'], 'simple')).toBe('simple');
  expect(() => save('noxy-test', 'advanced')).not.toThrow();
});
