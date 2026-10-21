import { expect, test } from 'vitest';
import { next } from './scheme.ts';

test('next toggles Light ↔ Dark', () => {
  expect([next('light'), next('dark')]).toEqual(['dark', 'light']);
});
