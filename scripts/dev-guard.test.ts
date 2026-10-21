import { describe, expect, it, vi } from 'vitest';
import { guard } from './dev-guard.ts';

const call = (site?: string) => {
  const res = { statusCode: 200, end: vi.fn() };
  const next = vi.fn();
  guard({ headers: site === undefined ? {} : { 'sec-fetch-site': site } }, res, next);
  return { status: res.statusCode, ended: res.end.mock.calls.length, next: next.mock.calls.length };
};

describe('the /__open-in-editor guard', () => {
  it.each(['cross-site', 'same-site', 'none', undefined])('refuses sec-fetch-site %s', (site) => {
    expect(call(site)).toEqual({ status: 403, ended: 1, next: 0 });
  });

  it("passes the dev page's own requests on to Vite", () => {
    expect(call('same-origin')).toEqual({ status: 200, ended: 0, next: 1 });
  });
});
