// uniform(): an empty interval returns its bound without drawing (M3 spec §4.1).
import { describe, expect, it } from 'vitest';
import { mulberry32, uniform } from './rng.ts';

describe('uniform', () => {
  it('returns lo for an empty interval without drawing', () => {
    let draws = 0;
    const rng = () => (draws++, 0.5);
    expect(uniform(rng, Infinity, Infinity)).toBe(Infinity);
    expect(uniform(rng, 3, 3)).toBe(3);
    expect(draws).toBe(0);
  });

  it('still draws inside a real interval', () => {
    const v = uniform(mulberry32(1), 10, 20);
    expect(v).toBeGreaterThanOrEqual(10);
    expect(v).toBeLessThan(20);
  });
});
