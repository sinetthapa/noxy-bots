import { ACTIVITIES, BASES, EMOTIONS, EVENTS } from '../src/brain/library';
import type { Nox } from '../src/brain/nox';

/** The state board: radios for base/activity/emotion, event buttons, and a live resolver readout. */
export function createBoard(el: HTMLElement, nox: Nox): { update(): void } {
  el.innerHTML = `
    <div class="row"><span>Base</span><div data-group="base"></div></div>
    <div class="row"><span>Activity</span><div data-group="activity"></div></div>
    <div class="row"><span>Emotion</span><div data-group="emotion"></div></div>
    <div class="row"><span>Events</span><div data-group="event"></div></div>
    <div class="row"><span>Motion</span><div data-group="motion"></div></div>
    <pre class="readout"></pre>`;
  const group = (name: string) => el.querySelector<HTMLElement>(`[data-group="${name}"]`)!;
  const button = (parent: HTMLElement, label: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', onClick);
    parent.append(b);
    return b;
  };

  const r = nox.resolver;
  const radios: { btn: HTMLButtonElement; active: () => boolean }[] = [];
  for (const b of BASES) radios.push({ btn: button(group('base'), b, () => nox.setBase(b)), active: () => r.base === b });
  for (const a of [null, ...ACTIVITIES]) {
    radios.push({ btn: button(group('activity'), a ?? 'None', () => nox.setActivity(a)), active: () => r.activity === a });
  }
  for (const e of [null, ...EMOTIONS]) {
    radios.push({ btn: button(group('emotion'), e ?? 'None', () => nox.setEmotion(e)), active: () => r.sticky === e });
  }
  for (const m of ['full', 'calm', 'still'] as const) {
    radios.push({ btn: button(group('motion'), m, () => nox.setMotion(m)), active: () => nox.motion === m });
  }
  for (const ev of EVENTS) button(group('event'), ev, () => nox.trigger(ev));
  button(group('event'), 'Twitch L', () => nox.twitch('L'));
  button(group('event'), 'Twitch R', () => nox.twitch('R'));
  button(group('event'), 'Notify', () => nox.notify());
  button(group('event'), 'Seen', () => nox.seen());
  const readout = el.querySelector<HTMLElement>('.readout')!;

  return {
    update() {
      for (const { btn, active } of radios) btn.setAttribute('aria-pressed', String(active()));
      const activity = r.effectiveActivity ?? (r.activity ? `${r.activity} (suspended while asleep)` : '–');
      readout.textContent = [
        `effective base  ${r.effectiveBase}${r.awakeHold ? '  (awake for events, will sleep again)' : ''}`,
        `activity        ${activity}`,
        `emotion         ${r.emotion ?? '–'}`,
        `playing         ${r.playing ? `${r.playing.name}  ${Math.round(r.playing.t)} ms` : '–'}`,
        `queue           ${r.queue.join(', ') || '–'}`,
        `notification    ${nox.notifying ? 'pending (badge up)' : '–'}`,
        `motion          ${nox.motion}`,
        '',
        ...r.log.slice(-8),
      ].join('\n');
    },
  };
}
