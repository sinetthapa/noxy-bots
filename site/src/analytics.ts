// PostHog, cookieless, production only (M5 spec §8). Pages and the studio call track(); it does nothing until start() ran.
import { REGION } from './site.ts';

export type Props = Record<string, string | number>;
type Event = { event: string; properties?: Record<string, unknown> } | null;

let capture: ((event: string, props?: Props) => void) | null = null;

export function track(event: string, props?: Props): void {
  capture?.(event, props);
}

const bare = (v: unknown) => (typeof v === 'string' && /^https?:\/\//.test(v) ? v.replace(/[?#].*$/, '') : v);

// Only these leave the browser. Features the PostHog dashboard can switch on remotely (heatmaps, web vitals,
// dead clicks) nest full URLs and element text, so their events are dropped rather than cleaned.
const KEEP = new Set(['$pageview', '$pageleave', 'export', 'code_copied', 'link_copied', 'install_copied', 'outbound_click']);

/** before_send: drops events not in KEEP, and the query and hash from every top-level URL value
 *  ($current_url, $referrer, $session_entry_url…), so studio settings never leave the browser.
 *  Also drops ph_keyword, the search terms taken from a search engine's referrer. */
export function stripUrls<T extends Event>(e: T): T | null {
  if (!e || !KEEP.has(e.event)) return null;
  const p = e.properties;
  if (p) {
    delete p.ph_keyword;
    for (const k of Object.keys(p)) p[k] = bare(p[k]);
  }
  return e;
}

/** Loads PostHog only on the production host with a key; previews and localhost send nothing. */
export async function start(host = location.hostname, key: string | undefined = import.meta.env.PUBLIC_POSTHOG_KEY): Promise<void> {
  if (host !== 'noxybots.com' || !key) return;
  // posthog-js reads a toolbar link (#__posthog= or #state=) when it loads and saves it in localStorage: drop it first.
  if (/(__posthog|state)=/.test(location.hash)) history.replaceState(history.state, '', location.pathname + location.search);
  const { default: posthog } = await import('posthog-js');
  posthog.init(key, {
    api_host: '/ingest',
    ui_host: `https://${REGION}.posthog.com`,
    defaults: '2026-05-30',
    cookieless_mode: 'always',
    person_profiles: 'never',
    autocapture: false,
    disable_session_recording: true,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    capture_performance: false,
    capture_exceptions: false,
    advanced_disable_flags: true, // also turns off remote config, so the dashboard can't switch features on
    disable_external_dependency_loading: true, // no toolbar, surveys or logs scripts
    mask_personal_data_properties: true, // ad click IDs (gclid, fbclid…); utm tags stay
    before_send: stripUrls,
  });
  capture = (event, props) => void posthog.capture(event, props);
}
