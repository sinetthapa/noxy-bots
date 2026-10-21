import { createBot, type StateName } from 'noxy-bots';
import 'noxy-bots/element';

const host = document.getElementById('driven')!;
const bot = createBot(host, { label: 'Nox' });

const STATES: StateName[] = ['idle', 'thinking', 'speaking', 'happy', 'sad', 'success', 'error', 'idea', 'sleep'];
for (const name of STATES) {
  const button = document.createElement('button');
  button.textContent = name;
  button.onclick = () => bot.state(name);
  document.getElementById('buttons')!.append(button);
}

// The eyes follow the pointer: its position from the bot's centre, as a share of half the window.
const clamp = (v: number) => Math.max(-1, Math.min(1, v));
addEventListener('pointermove', (e) => {
  const r = host.getBoundingClientRect();
  bot.lookAt(clamp((e.clientX - r.left - r.width / 2) / (innerWidth / 2)), clamp((e.clientY - r.top - r.height / 2) / (innerHeight / 2)));
});
document.documentElement.addEventListener('pointerleave', () => bot.lookAt(null));
