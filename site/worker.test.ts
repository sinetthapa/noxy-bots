// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest';
import worker from './worker.ts';

const ASSETS = { fetch: vi.fn(async () => new Response('asset')) };
const upstream = vi.fn(async (_url: string, _init?: RequestInit) => new Response('ok'));
vi.stubGlobal('fetch', upstream);
afterEach(() => {
  ASSETS.fetch.mockClear();
  upstream.mockReset();
  upstream.mockImplementation(async () => new Response('ok'));
});
const call = (path: string, init?: RequestInit) => worker.fetch(new Request(`https://noxybots.com${path}`, init), { ASSETS });

test('/ingest/e/ goes to the ingest host: prefix stripped, redirects not followed, X-Forwarded-For from CF-Connecting-IP', async () => {
  await call('/ingest/e/?ver=1', { method: 'POST', body: '{}', headers: { 'CF-Connecting-IP': '203.0.113.7' } });
  const [url, init] = upstream.mock.calls[0];
  expect(url).toBe('https://us.i.posthog.com/e/?ver=1');
  expect(new Headers(init?.headers).get('x-forwarded-for')).toBe('203.0.113.7');
  expect(init?.method).toBe('POST');
  expect(init?.redirect).toBe('manual');
});

test('only content-type and user-agent go upstream: no cookie, Referer or cf-* headers', async () => {
  await call('/ingest/e/', {
    method: 'POST',
    body: '{}',
    headers: { 'content-type': 'text/plain', 'user-agent': 'UA', cookie: 'a=b', referer: 'https://noxybots.com/studio?seed=3', 'cf-ipcountry': 'XX', 'cf-ray': 'r' },
  });
  const headers = new Headers(upstream.mock.calls[0][1]?.headers);
  expect([...headers.keys()].sort()).toEqual(['content-type', 'user-agent']);
});

test('the response keeps its status, body, content and Retry-After headers, drops every other header and adds nosniff', async () => {
  upstream.mockImplementation(async () => new Response('{"status":1}', {
    status: 429,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'retry-after': '30', 'set-cookie': 'x=1; Path=/', 'service-worker-allowed': '/', 'access-control-allow-origin': '*', location: '//evil.example/' },
  }));
  const res = await call('/ingest/e/', { method: 'POST', body: '{}' });
  expect(res.status).toBe(429);
  expect(await res.text()).toBe('{"status":1}');
  expect(Object.fromEntries(res.headers)).toEqual({ 'content-type': 'application/json', 'cache-control': 'no-store', 'retry-after': '30', 'x-content-type-options': 'nosniff' });
});

test.each([
  '/ingest/',
  '/ingest/flags/?v=2',
  '/ingest/decide',
  '/ingest/i/v0/e/',
  '/ingest/i/v1/logs',
  '/ingest/api/surveys/',
  '/ingest/static/array.js',
  '/ingest/array/phc_key/config.js',
  '/ingest//evil.example/x',
  '/ingest/e',
  '/ingest/e/x',
])('%s is 404 and never reaches PostHog', async (path) => {
  const res = await call(path);
  expect(res.status).toBe(404);
  expect(upstream).not.toHaveBeenCalled();
});

test.each(['PUT', 'DELETE', 'PATCH'])('%s on /ingest is 405', async (method) => {
  const res = await call('/ingest/e/', { method });
  expect(res.status).toBe(405);
  expect(upstream).not.toHaveBeenCalled();
});

test.each(['/', '/studio', '/ingest', '/ingestion/x'])('%s is served from assets', async (path) => {
  expect(await (await call(path)).text()).toBe('asset');
  expect(upstream).not.toHaveBeenCalled();
});
