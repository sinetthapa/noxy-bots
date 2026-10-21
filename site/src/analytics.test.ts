import { beforeEach, expect, test, vi } from 'vitest';

const { posthog, order } = vi.hoisted(() => {
  const order: string[] = [];
  return { posthog: { init: vi.fn(() => void order.push('init')), capture: vi.fn() }, order };
});
vi.mock('posthog-js', () => ({ default: posthog }));
const replaceState = vi.fn(() => void order.push('scrub'));

beforeEach(() => {
  vi.resetModules(); // a fresh analytics.ts each time: start() sets module state
  posthog.init.mockClear();
  posthog.capture.mockClear();
  replaceState.mockClear();
  order.length = 0;
  vi.stubGlobal('location', { pathname: '/', search: '', hash: '' });
  vi.stubGlobal('history', { state: 1, replaceState });
});
const load = () => import('./analytics.ts');

test('stripUrls drops query and hash from every URL value and the search-engine keyword, and leaves the rest', async () => {
  const { stripUrls } = await load();
  const e = stripUrls({
    event: '$pageview',
    properties: {
      $current_url: 'https://noxybots.com/studio?state=happy&seed=3#x',
      $referrer: 'https://example.com/a?q=1',
      $initial_current_url: 'https://noxybots.com/?utm=1',
      $initial_referrer: '$direct',
      $session_entry_url: 'https://noxybots.com/studio?seed=9',
      $pathname: '/studio',
      ph_keyword: 'noxy bots',
      utm_source: 'newsletter',
      format: 'png',
      size: 1080,
    },
  });
  expect(e?.properties).toEqual({
    $current_url: 'https://noxybots.com/studio',
    $referrer: 'https://example.com/a',
    $initial_current_url: 'https://noxybots.com/',
    $initial_referrer: '$direct',
    $session_entry_url: 'https://noxybots.com/studio',
    $pathname: '/studio',
    utm_source: 'newsletter',
    format: 'png',
    size: 1080,
  });
  expect(stripUrls(null)).toBeNull();
});

test.each(['$$heatmap', '$web_vitals', '$dead_click', '$exception', '$autocapture'])('stripUrls drops %s events', async (event) => {
  const { stripUrls } = await load();
  expect(stripUrls({ event, properties: { $heatmap_data: { 'https://noxybots.com/studio?seed=3': [] } } })).toBeNull();
});

test('track is a no-op before start', async () => {
  const { track } = await load();
  track('export', { format: 'svg' });
  expect(posthog.capture).not.toHaveBeenCalled();
});

test.each([
  ['a preview host', 'noxy.example.workers.dev', 'phc_key'],
  ['localhost', 'localhost', 'phc_key'],
  ['no key', 'noxybots.com', undefined],
])('start does nothing on %s', async (_, host, key) => {
  const { start, track } = await load();
  await start(host, key);
  track('link_copied');
  expect(posthog.init).not.toHaveBeenCalled();
  expect(posthog.capture).not.toHaveBeenCalled();
});

test('on noxybots.com, start inits cookieless PostHog through /ingest and track captures', async () => {
  const { start, track, stripUrls } = await load();
  await start('noxybots.com', 'phc_key');
  expect(posthog.init).toHaveBeenCalledWith('phc_key', expect.objectContaining({
    api_host: '/ingest',
    cookieless_mode: 'always',
    person_profiles: 'never',
    autocapture: false,
    disable_session_recording: true,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    advanced_disable_flags: true, // no /flags call and no remote config
    disable_external_dependency_loading: true, // no toolbar, surveys or logs scripts
    mask_personal_data_properties: true, // ad click IDs; utm tags stay
    before_send: stripUrls,
  }));
  track('export', { format: 'mp4', size: 1080 });
  expect(posthog.capture).toHaveBeenCalledWith('export', { format: 'mp4', size: 1080 });
});

test.each(['#__posthog=eyJ9', '#state=%7B%7D', '#top&__posthog=1'])('start drops a toolbar hash (%s) before PostHog loads', async (hash) => {
  vi.stubGlobal('location', { pathname: '/studio', search: '?seed=3', hash });
  vi.doMock('posthog-js', () => (order.push('load'), { default: posthog })); // the toolbar reads the hash when posthog-js loads
  const { start } = await load();
  await start('noxybots.com', 'phc_key');
  expect(replaceState).toHaveBeenCalledWith(1, '', '/studio?seed=3');
  expect(order).toEqual(['scrub', 'load', 'init']);
});

test('start keeps any other hash', async () => {
  vi.stubGlobal('location', { pathname: '/docs/states', search: '', hash: '#events' });
  const { start } = await load();
  await start('noxybots.com', 'phc_key');
  expect(replaceState).not.toHaveBeenCalled();
});
