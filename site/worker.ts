// The site's Worker (M5 spec §9.1): /ingest/e/ goes to PostHog; everything else is a static asset.
import { REGION } from './src/site.ts';

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
}

const HOSTS = { us: 'us.i.posthog.com', eu: 'eu.i.posthog.com' } as const;
const METHODS = ['GET', 'POST', 'OPTIONS'];
// analytics.ts turns off flags, remote config and external scripts, so events are the only call the SDK makes.
const PATHS = ['/e/'];
const pick = (from: Headers, names: string[]) => {
  const out = new Headers();
  for (const n of names) {
    const v = from.get(n);
    if (v !== null) out.set(n, v);
  }
  return out;
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/ingest/')) return env.ASSETS.fetch(req);
    if (!METHODS.includes(req.method)) return new Response(null, { status: 405 });
    const path = url.pathname.slice('/ingest'.length);
    if (!PATHS.includes(path)) return new Response(null, { status: 404 }); // never an open proxy
    const headers = pick(req.headers, ['content-type', 'user-agent']); // no cookie, Referer or cf-*
    const ip = req.headers.get('CF-Connecting-IP');
    if (ip) headers.set('X-Forwarded-For', ip); // the visitor's IP for the cookieless hash, not Cloudflare's
    const res = await fetch(`https://${HOSTS[REGION]}${path}${url.search}`, {
      method: req.method,
      headers,
      body: req.method === 'POST' ? req.body : undefined,
      redirect: 'manual',
    });
    const out = pick(res.headers, ['content-type', 'cache-control', 'retry-after']); // the SDK paces retries by Retry-After; no Set-Cookie, Location, CORS or Service-Worker-Allowed
    out.set('X-Content-Type-Options', 'nosniff');
    return new Response(res.body, { status: res.status, headers: out });
  },
};
