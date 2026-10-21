// The docs pages' behaviour (M5 spec §6.2): live demos and their code tabs, the States chips, code-block Copy, Copy page as Markdown.
import { createBot, NAMES, type EventName, type StateName } from 'noxy-bots';
import { highlight, snippet, type Format } from '../../studio/src/snippets.ts';
import { botProps, showState, type StudioState } from '../../studio/src/state.ts';
import { track } from '../../studio/src/track.ts';
import { codeTabs, copyButton } from './code.ts';

const EVENTS: readonly string[] = NAMES.event;

export function initDocs(): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-demo]')) {
    const s: StudioState = JSON.parse(el.dataset.demo!);
    createBot(el.querySelector('.stage-bot')!, { ...botProps(s), state: s.state });
    codeTabs(el.querySelector('[data-code-tabs]')!, (tab) => snippet(s, tab as Format), 'docs');
  }

  for (const el of document.querySelectorAll<HTMLElement>('[data-states]')) {
    const bot = createBot(el.querySelector('.stage-bot')!, { state: el.dataset.states as StateName });
    const chips = [...el.querySelectorAll<HTMLButtonElement>('[data-play]')];
    for (const c of chips) {
      c.addEventListener('click', () => {
        const name = c.dataset.play!;
        if (EVENTS.includes(name)) return bot.play(name as EventName);
        showState(bot, name as StateName);
        for (const x of chips) x.setAttribute('aria-pressed', String(x === c));
      });
    }
  }

  for (const el of document.querySelectorAll<HTMLElement>('[data-fence]')) {
    const code = el.querySelector('code')!;
    const text = code.textContent!.replace(/\n$/, '');
    code.innerHTML = highlight(text); // highlight escapes every character it emits
    copyButton(el.querySelector('button')!, () => text, () => text.startsWith('npm i ') && track('install_copied', { page: 'docs' }));
  }

  const page = document.getElementById('copy-page');
  if (page) copyButton(page, () => page.dataset.md!);
}
