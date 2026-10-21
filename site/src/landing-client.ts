// The landing page's behaviour: hero bot and headline o's (follow the cursor), moods, Randomize, theme picks, code tabs (code.ts), extra [data-bot] bots.
import { createBot, NAMES, type Bot, type EmotionName, type StateName } from 'noxy-bots';
import { snippet, type Format } from '../../studio/src/snippets.ts';
import { botProps, DEFAULTS, randomize, showState, type StudioState } from '../../studio/src/state.ts';
import { codeTabs } from './code.ts';
import { booper, gaze, hopFrames, lottieSnippet } from './landing.ts';

export function initLanding(): void {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const heroHost = $('hero-bot');
  let s: StudioState = { ...DEFAULTS };
  const bot = createBot(heroHost, botProps(s));
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  intro(heroHost, bot, still);
  const followers: [HTMLElement, Bot][] = [[heroHost, bot]]; // the hero and the headline's [data-follow] o's
  for (const el of document.querySelectorAll<HTMLElement>('[data-bot]')) {
    const b = createBot(el, JSON.parse(el.dataset.bot || '{}'));
    if ('follow' in el.dataset) followers.push([el, b]);
  }

  // The closing card's bot: curious, and a new random look every few seconds while it's on screen, swapped mid-bounce.
  const ctaHost = $('cta-bot');
  let cta = randomize({ ...DEFAULTS, state: 'curious' });
  const ctaBot = createBot(ctaHost, { ...botProps(cta), state: cta.state });
  const swap = () => {
    cta = randomize(cta);
    if (still.matches) return ctaBot.update(botProps(cta));
    ctaHost.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.6, 0.5) translateY(30%)' }], { duration: 140, easing: 'ease-in' }).onfinish = () => {
      ctaBot.update(botProps(cta));
      ctaHost.animate([{ transform: 'scale(0.6, 0.5) translateY(30%)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(0.34, 1.8, 0.64, 1)' });
    };
  };
  let timer = 0;
  new IntersectionObserver(([e]) => {
    clearInterval(timer);
    if (e.isIntersecting) timer = window.setInterval(swap, 2600);
  }).observe(ctaHost);

  // Code: the hero bot's current look, as the studio writes it.
  const renderCode = codeTabs($('code'), (tab) => (tab === 'lottie' ? lottieSnippet(s.state) : snippet(s, tab as Format)), 'landing');
  const themes = [...document.querySelectorAll<HTMLButtonElement>('[data-theme]')];
  const render = () => {
    renderCode();
    for (const t of themes) t.setAttribute('aria-pressed', String(!s.colors && s.theme === t.dataset.theme));
  };
  render();

  // Moods
  const moods = [...document.querySelectorAll<HTMLButtonElement>('[data-mood]')];
  for (const b of moods) {
    b.addEventListener('click', () => {
      s = { ...s, state: b.dataset.mood as StateName };
      showState(bot, s.state);
      for (const m of moods) m.setAttribute('aria-pressed', String(m === b));
      render();
    });
  }

  // Randomize: theme, parts, sizes, personality (the studio's 🎲).
  $('shuffle').addEventListener('click', () => {
    s = randomize(s);
    bot.update(botProps(s));
    render();
  });

  // Theme picks: the mini bots lend the hero bot their theme.
  for (const t of themes) {
    t.addEventListener('click', () => {
      s = { ...s, theme: t.dataset.theme!, colors: null };
      bot.update(botProps(s));
      render();
    });
  }

  // Nox always follows the cursor (mouse and pen only; touch has no hover). A bot hidden by the scheme has no box and is skipped.
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    for (const [el, b] of followers) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      const g = gaze(e.clientX, e.clientY, r);
      b.lookAt(g.x, g.y);
    }
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { for (const [, b] of followers) b.lookAt(null); });

  // Boop (the user, 2026-10-16): pressing Nox squashes him from his feet; letting go springs him back with a 1.4 s reaction, then
  // his mood again (a timed emotion clears a mood that is one). Asleep, he wakes to laugh and dozes off again. Not during the intro.
  // Every press squashes, but a new reaction waits until the last one ends (booper; the user, 2026-10-18).
  const boop = booper();
  let back = 0;
  heroHost.addEventListener('pointerdown', (e) => {
    if (document.documentElement.classList.contains('intro') || !(e.target as Element).closest('[id$="-nox"]')) return;
    const squash = still.matches ? null : heroHost.animate({ transform: ['scale(1)', 'scale(1.06, 0.93)'] }, { duration: 90, easing: 'ease-out', fill: 'forwards' });
    const end = (u: PointerEvent) => {
      removeEventListener('pointerup', end);
      removeEventListener('pointercancel', end);
      squash?.cancel();
      if (squash) heroHost.animate({ transform: ['scale(1.06, 0.93)', 'scale(1)'] }, { duration: 420, easing: 'cubic-bezier(0.34, 1.8, 0.64, 1)' });
      if (u.type === 'pointercancel' || boop.busy(u.timeStamp)) return;
      const last = boop.next(u.timeStamp, s.state === 'sleep');
      if (last === 'laugh') return bot.play('laugh');
      bot.emotion(last, 1400);
      clearTimeout(back);
      back = window.setTimeout(() => (NAMES.emotion as readonly string[]).includes(s.state) && bot.emotion(s.state as EmotionName), 1400);
    };
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
  });
}

// First visit in a tab (Base.astro adds html.intro before paint): an empty page, Nox boots mid-screen, hops into the
// card, and the page fades in around the landing. A click, scroll, touch or key skips to the end. Later visits: boot in place.
function intro(host: HTMLElement, bot: Bot, still: MediaQueryList): void {
  const root = document.documentElement;
  const r = host.getBoundingClientRect();
  if (!root.classList.contains('intro') || document.hidden || scrollY > 0 || r.top > innerHeight - 120 || performance.now() > 1500) {
    root.classList.remove('intro');
    if (!still.matches) bot.state('boot');
    return;
  }
  try { sessionStorage.setItem('noxy-intro', '1'); } catch { /* private windows: it just plays again */ }
  for (const el of document.querySelectorAll('.rise')) el.classList.remove('rise'); // else the quick rise replays after
  bot.state('boot'); // 2 s: eyes flicker on, ears spring up

  // Nox: centred at 0.8x while booting, a squash at 1.7 s, the hop (1.9 to 2.55 s), a squash on landing. One animation,
  // since separate transform animations would override each other. The origin is his feet (origin-bottom).
  const T = 2900, s0 = 0.8;
  const dx = innerWidth / 2 - (r.left + r.width / 2);
  const dy = innerHeight / 2 - r.bottom + (s0 * r.height) / 2;
  const hop = hopFrames(dx, dy, s0, 40).slice(1).map((f, i, a) => ({ ...f, offset: (1900 + (650 * (i + 1)) / a.length) / T }));
  const anims = [
    host.animate({ opacity: [0, 1] }, { duration: 600, easing: 'ease-out', fill: 'both' }),
    host.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${s0}, ${s0})`, easing: 'ease-in-out' },
      { transform: `translate(${dx}px, ${dy}px) scale(${s0}, ${s0})`, offset: 1700 / T, easing: 'ease-out' },
      { transform: `translate(${dx}px, ${dy}px) scale(${s0 * 1.05}, ${s0 * 0.92})`, offset: 1900 / T },
      ...hop.slice(0, -1),
      { ...hop.at(-1)!, easing: 'ease-out' },
      { transform: 'translate(0px, 0px) scale(1.06, 0.93)', offset: 2660 / T, easing: 'ease-in-out' },
      { transform: 'translate(0px, 0px) scale(0.98, 1.02)', offset: 2780 / T, easing: 'ease-in-out' },
      { transform: 'translate(0px, 0px) scale(1, 1)' },
    ], { duration: T, fill: 'both' }),
  ];
  // The page: in steps from take-off (data-intro: 0 card, 1 header, 2 headline, ... 6 lower sections).
  for (const el of document.querySelectorAll<HTMLElement>('[data-intro]')) {
    const step = Number(el.dataset.intro);
    const look = step ? { opacity: [0, 1], transform: ['translateY(10px)', 'none'], filter: ['blur(6px)', 'blur(0px)'] } : { opacity: [0, 1] };
    anims.push(el.animate(look, { delay: 1950 + 150 * step, duration: 1000, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' }));
  }

  const listen = new AbortController();
  const done = () => { listen.abort(); root.classList.remove('intro'); for (const a of anims) a.cancel(); };
  Promise.all(anims.map((a) => a.finished)).then(done, done); // same task as the last frame: no flash, no lingering fill
  for (const t of ['pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(t, () => { for (const a of anims) a.finish(); }, { signal: listen.signal, passive: true });
}
