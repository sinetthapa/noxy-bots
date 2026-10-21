// npm run perf (by hand, M2 spec §13): 20 bots on examples/perf.html in headless Chrome. For `full` and `still`
// motion, three runs each, every run in a fresh browser (a second tab runs throttled); a 3 s warm-up, then a
// 4 s DevTools trace. Prints the median main-thread time per drawn frame against the targets.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TARGET_MS = { full: 6, still: 1 }; // per drawn frame, 20 bots at 30 fps
const FPS = 30;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdp(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id) pending.get(d.id)?.(d.result), pending.delete(d.id);
    else events.push(d);
  };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((r) => (pending.set(++id, r), ws.send(JSON.stringify({ id, method, params }))));
  return { send, events, close: () => ws.close() };
}

/** One run: main-thread milliseconds per drawn frame. */
async function run(page) {
  const dir = mkdtempSync(join(tmpdir(), 'noxy-perf-'));
  const port = 9300 + Math.floor(Math.random() * 600);
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--no-first-run', '--window-size=1200,900', 'about:blank'], { stdio: 'ignore' });
  try {
    for (let i = 0; i < 50; i++) {
      try {
        await fetch(`http://localhost:${port}/json/version`);
        break;
      } catch {
        await sleep(200);
      }
    }
    const tab = await (await fetch(`http://localhost:${port}/json/new?${encodeURIComponent(page)}`, { method: 'PUT' })).json();
    const c = await cdp(tab.webSocketDebuggerUrl);
    await sleep(3000); // warm-up
    const frames = async () => (await c.send('Runtime.evaluate', { expression: 'frames()', returnByValue: true })).result.value;
    const f0 = await frames();
    await c.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] }, transferMode: 'ReportEvents' });
    await sleep(4000);
    const f1 = await frames();
    const done = new Promise((r) => {
      const poll = setInterval(() => c.events.some((e) => e.method === 'Tracing.tracingComplete') && (clearInterval(poll), r()), 50);
    });
    await c.send('Tracing.end');
    await done;
    c.close();
    const trace = c.events.filter((e) => e.method === 'Tracing.dataCollected').flatMap((e) => e.params.value);
    // The page's main thread is the one with the most tasks; its RunTask time covers script, style, layout and paint.
    const tasks = trace.filter((e) => e.name === 'RunTask' && e.ph === 'X');
    if (!tasks.length) throw new Error(`perf: no RunTask events in the trace; is Chrome at ${CHROME}? (set CHROME=<path>)`);
    const perThread = new Map();
    for (const e of tasks) perThread.set(`${e.pid}:${e.tid}`, (perThread.get(`${e.pid}:${e.tid}`) ?? 0) + 1);
    const main = [...perThread].sort((a, b) => b[1] - a[1])[0][0];
    const mainTasks = tasks.filter((e) => `${e.pid}:${e.tid}` === main);
    const busy = mainTasks.reduce((sum, e) => sum + e.dur / 1000, 0);
    const secs = (Math.max(...mainTasks.map((e) => e.ts + e.dur)) - Math.min(...mainTasks.map((e) => e.ts))) / 1e6;
    const drawn = Math.min(f1 - f0, secs * FPS); // the bots draw at 30 fps, or every frame if the browser runs slower
    return busy / drawn;
  } finally {
    chrome.kill();
    await sleep(300);
    rmSync(dir, { recursive: true, force: true });
  }
}

const server = await createServer({ configFile: 'examples/vite.config.ts', logLevel: 'error', server: { port: 0 } });
await server.listen();
const base = server.resolvedUrls.local[0];
let ok = true;
for (const motion of ['full', 'still']) {
  const runs = [];
  for (let i = 0; i < 3; i++) runs.push(await run(`${base}perf.html?bots=20&motion=${motion}`));
  const median = [...runs].sort((a, b) => a - b)[1];
  const pass = median <= TARGET_MS[motion];
  ok &&= pass;
  console.log(`${motion}: median ${median.toFixed(2)} ms per drawn frame (runs ${runs.map((r) => r.toFixed(2)).join(', ')}); target ≤ ${TARGET_MS[motion]} ms: ${pass ? 'PASS' : 'FAIL'}`);
}
await server.close();
process.exit(ok ? 0 : 1);
