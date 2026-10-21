// A Vite plugin for both dev servers (vite.config.ts, examples/vite.config.ts). Vite's /__open-in-editor opens any
// path in the developer's editor for any caller; only the dev page itself (its error overlay) may ask.
// Structural types, not vite's: those pull @types/node into tsc's program.

interface Req {
  headers: Record<string, string | string[] | undefined>;
}
interface Res {
  statusCode: number;
  end(): void;
}

/** 403 unless the browser says the request comes from the dev page's own origin. */
export function guard(req: Req, res: Res, next: () => void): void {
  if (req.headers['sec-fetch-site'] === 'same-origin') return next();
  res.statusCode = 403;
  res.end();
}

export const devGuard = () => ({
  name: 'noxy-dev-guard',
  configureServer(server: { middlewares: { use(route: string, fn: typeof guard): unknown } }) {
    server.middlewares.use('/__open-in-editor', guard); // here, not in a returned post hook, so it runs before Vite's own handler
  },
});
