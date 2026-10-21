// M3 spec §6: the studio never builds HTML from strings (audit run-1 leads 4–5). Test files are skipped.
import { expect, it } from 'vitest';

const sources = import.meta.glob(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

it('no studio source uses innerHTML or dangerouslySetInnerHTML', () => {
  expect(Object.keys(sources).length).toBeGreaterThanOrEqual(3);
  expect(Object.entries(sources).filter(([, src]) => src.includes('innerHTML')).map(([file]) => file)).toEqual([]);
});

it('only studio/src/animation reads the package internals (M4 spec §8)', () => {
  const users = Object.entries(sources).filter(([, src]) => src.includes("from 'noxy-src/")).map(([file]) => file);
  expect(users.filter((f) => !f.startsWith('./animation/'))).toEqual([]);
});
