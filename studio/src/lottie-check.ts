// The Lottie check page (M4 spec §6.6, Q7), dev only: the studio's settings from the URL, baked to a Lottie and played
// in lottie-web and the dotLottie player. Beside them: the live bot (its own clock) and the halo rig drawn from the same
// poses, on the players' 60 fps clock, for an exact comparison.
import { DotLottie } from '@lottiefiles/dotlottie-web';
import wasm from '@lottiefiles/dotlottie-web/dotlottie-player.wasm?url';
import lottie from 'lottie-web';
import { createBot, NAMES, nox, type EventName } from 'noxy-bots';
import { bake, haloRig } from './animation/lottie.ts';
import { record } from './animation/record.ts';
import { requestFor } from './components/AnimationDialog.tsx';
import { botProps, showState } from './state.ts';
import { parse } from './url.ts';
import './styles.css';

DotLottie.setWasmUrl(wasm); // the player's WebAssembly from the dev server, not a CDN

const W = 360;
const H = Math.round((W * nox.frame[3]) / nox.frame[2]);
const s = parse(location.search).state;
const base = { ...s, seed: s.seed ?? (Math.random() * 2 ** 32) >>> 0 }; // one seed for every clip on the page

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = className;
  e.append(...kids);
  return e;
};
const panel = (label: string, view: HTMLElement) => el('figure', 'grid gap-1', el('figcaption', 'text-xs text-muted-foreground', label), view);

const clip = el('select', 'rounded border border-border bg-transparent px-2 py-1');
clip.append(new Option(`${s.state} loop`, ''), ...NAMES.event.map((e) => new Option(e, e)));
const play = el('button', 'rounded border border-border px-3 py-1', 'Pause');
const scrub = Object.assign(el('input', 'min-w-0 flex-1'), { type: 'range', min: '0', step: '1' });
const readout = el('span', 'w-24 font-mono text-xs');
const info = el('p', 'text-xs text-muted-foreground');
const [liveBox, rigBox, webBox, dotBox] = [0, 1, 2, 3].map(() => el('div', 'border border-border'));
for (const box of [rigBox, webBox, dotBox]) Object.assign(box.style, { width: `${W}px`, height: `${H}px` });
liveBox.style.width = `${W}px`; // the bot fills its host's width and keeps the frame's shape
document.body.append(
  el(
    'main',
    'grid gap-4 p-6',
    el('h1', 'text-lg', 'Lottie check'),
    el('div', 'flex max-w-[1488px] items-center gap-2', clip, play, scrub, readout),
    el(
      'div',
      'flex flex-wrap gap-4',
      panel('Live bot (blur glow, own clock)', liveBox),
      panel('Halo rig (reference)', rigBox),
      panel('lottie-web (SVG)', webBox),
      panel('dotLottie (canvas)', dotBox),
    ),
    info,
  ),
);

const bot = createBot(liveBox, botProps(base)); // once: it runs on its own clock, and an event clip replays it on each wrap
showState(bot, s.state);

let cur: { n: number; event: EventName | null; draw: (i: number) => void; destroy: () => void } | null = null;
let shown = -1;
let playing = true;
let t0 = performance.now();
let gen = 0; // the latest load; an older one that finishes late destroys its players

function show(i: number) {
  if (!cur || i === shown) return;
  shown = i;
  cur.draw(i);
  scrub.value = String(i);
  readout.textContent = `${i} / ${cur.n}`;
}

async function load() {
  const g = ++gen;
  cur?.destroy();
  cur = null;
  info.textContent = 'Baking…';
  const event = (clip.value || null) as EventName | null;
  const req = requestFor(base, null, event, 0, ''); // size and background are the MP4's; the Lottie has neither
  const frames = await record(req);
  const t = performance.now();
  const json = JSON.stringify(bake(frames, req.look, `noxy-${event ?? s.state}`));
  const ms = performance.now() - t;
  if (g !== gen) return;
  const rig = haloRig(req.look);
  rig.svg.setAttribute('width', String(W));
  rig.svg.setAttribute('height', String(H));
  rigBox.replaceChildren(rig.svg);
  const canvas = Object.assign(el('canvas'), { width: W * devicePixelRatio, height: H * devicePixelRatio });
  Object.assign(canvas.style, { width: `${W}px`, height: `${H}px` });
  dotBox.replaceChildren(canvas); // each load owns its canvas and its lottie-web container, so a late one can't clear the next
  const box = el('div');
  Object.assign(box.style, { width: `${W}px`, height: `${H}px` });
  webBox.replaceChildren(box);
  const web = lottie.loadAnimation({ container: box, renderer: 'svg', autoplay: false, loop: false, animationData: JSON.parse(json) });
  const dot = new DotLottie({ canvas, data: json, autoplay: false, renderConfig: { devicePixelRatio, autoResize: false } });
  const next = {
    n: frames.length,
    event,
    draw: (i: number) => (rig.draw(frames[i]), web.goToAndStop(i, true), dot.setFrame(i)),
    destroy: () => (web.destroy(), dot.destroy()),
  };
  await new Promise<void>((ok, fail) => {
    dot.addEventListener('load', () => ok());
    dot.addEventListener('loadError', (e) => fail(e.error));
  }).catch((e) => {
    next.destroy();
    throw e;
  });
  if (g !== gen) return next.destroy();
  scrub.max = String(frames.length - 1);
  [cur, shown] = [next, -1];
  show(0); // a paused page shows the new clip at once
  info.textContent = `${(json.length / 1024).toFixed(0)} KB · ${frames.length} frames · baked in ${ms.toFixed(0)} ms · seed ${base.seed}`;
  t0 = performance.now();
  if (event) bot.play(event);
}

function tick(now: number) {
  if (playing && cur) {
    const i = Math.floor((Math.max(0, now - t0) * 60) / 1000) % cur.n; // a frame can start before a load set t0
    if (i < shown && cur.event) bot.play(cur.event); // the clock wrapped
    show(i);
  }
  requestAnimationFrame(tick);
}

clip.onchange = () => void load().catch((e) => (info.textContent = String(e)));
play.onclick = () => {
  playing = !playing;
  play.textContent = playing ? 'Pause' : 'Play';
  t0 = performance.now() - (Math.max(shown, 0) * 1000) / 60; // resume from the frame on screen
};
scrub.oninput = () => {
  playing = false;
  play.textContent = 'Play';
  show(Number(scrub.value));
};
clip.onchange(new Event('change'));
requestAnimationFrame(tick);
