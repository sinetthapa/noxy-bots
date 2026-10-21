import { afterEach, expect, test, vi } from 'vitest';
import { track } from './track.ts';

const g = globalThis as { noxyTrack?: unknown };
afterEach(() => void delete g.noxyTrack);

test('does nothing when the site has not set noxyTrack', () => {
  expect(() => track('link_copied')).not.toThrow();
});

test('forwards the event and props to noxyTrack', () => {
  const spy = vi.fn();
  g.noxyTrack = spy;
  track('export', { format: 'png', size: 1080 });
  expect(spy).toHaveBeenCalledWith('export', { format: 'png', size: 1080 });
});
