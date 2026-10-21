// npm run perf opens this page: ?bots=20&motion=full|still. All bots stay on screen (1200 × 900 window).
import 'noxy-bots/element';

const q = new URLSearchParams(location.search);
const bots = Math.min(200, Math.max(1, Math.round(Number(q.get('bots') ?? 20)) || 1));
const m = q.get('motion') ?? 'full';
const motion = ['auto', 'full', 'calm', 'still'].includes(m) ? m : 'full';
document.body.replaceChildren(
  ...Array.from({ length: bots }, (_, i) => {
    const bot = document.createElement('noxy-bot');
    bot.setAttribute('seed', String(i + 1));
    bot.setAttribute('motion', motion);
    return bot;
  }),
);

// Counts animation frames, so the script can tell how many frames the bots drew.
let frames = 0;
const count = () => {
  frames++;
  requestAnimationFrame(count);
};
requestAnimationFrame(count);
Object.assign(window, { frames: () => frames });
