// @vitest-environment happy-dom
// The animation dialog (M4 spec §7, reworked 2026-10-19): the loop of the stage's state by default or one event from a
// dropdown, a live preview of it, the format first, an aria-disabled button where MP4 can't be made, a Lottie that works
// anyway, 10 % progress steps, one export at a time, and Cancel or closing that saves nothing.
import { act, createElement, forwardRef, useImperativeHandle, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { toast } from 'sonner';
import { afterEach, beforeEach, expect, it, vi, type Mock } from 'vitest';
import type { Mp4Request } from '../animation/mp4.ts';
import { DEFAULTS, type Gaze, type StudioState } from '../state.ts';
import { AnimationDialog, type Engine } from './AnimationDialog.tsx';

vi.mock('sonner', () => ({ toast: vi.fn() }));
// The preview's bot: a fake that records its props and the calls the dialog makes on it.
type FakeBot = { props: Record<string, unknown>; state: Mock; lookAt: Mock };
const bots = vi.hoisted(() => [] as FakeBot[]);
vi.mock('noxy-bots/react', () => ({
  NoxyBot: forwardRef(function FakeNoxyBot(props: Record<string, unknown>, ref) {
    const [bot] = useState(() => (bots.push({ props, state: vi.fn(), lookAt: vi.fn() }), bots.at(-1)!));
    useImperativeHandle(ref, () => bot, [bot]);
    return null;
  }),
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
beforeEach(() => {
  root = createRoot(document.body.appendChild(document.createElement('div')));
});
afterEach(() => {
  act(() => root.unmount());
  document.body.textContent = '';
  bots.length = 0;
  vi.clearAllMocks();
  vi.useRealTimers();
});

/** An engine whose exports wait until the test finishes them, and reject when aborted. */
function fakeEngine(ok = true) {
  const jobs: { req: Mp4Request; signal: AbortSignal; onProgress: (d: number) => void; finish: (b: Blob) => void; fail: (e: Error) => void }[] = [];
  const job = () =>
    vi.fn(
      (req: Mp4Request, signal: AbortSignal, onProgress: (d: number) => void) =>
        new Promise<Blob>((finish, fail) => {
          jobs.push({ req, signal, onProgress, finish, fail });
          signal.addEventListener('abort', () => fail(signal.reason));
        }),
    );
  const engine: Engine = { canMakeMp4: vi.fn(async () => ok), exportMp4: job(), exportLottie: job(), save: vi.fn() };
  return { engine, jobs };
}
const flush = () => act(async () => {});
const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement;
const radio = (text: string) => [...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent === text) as HTMLButtonElement;
const click = (el: HTMLElement) => act(() => el.click());
const pick = (event: string) =>
  act(() => {
    const select = document.querySelector('select')!;
    select.value = event;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
const preview = () => document.querySelector('[data-preview]') as HTMLElement;
async function open(engine: Engine, s: StudioState = DEFAULTS, gaze: Gaze = null) {
  act(() => root.render(createElement(AnimationDialog, { s, gaze, engine })));
  await click(button('Animation…'));
  await flush();
}

it('opens on "Animation…" with the loop of the stage state, previewed as the stage shows it', async () => {
  await open(fakeEngine().engine, DEFAULTS, { x: 0.5, y: 0 });
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Export animation');
  expect(radio('idle loop').getAttribute('aria-checked')).toBe('true');
  expect(radio('Event').getAttribute('aria-checked')).toBe('false');
  expect(document.querySelector('select')).toBeNull();
  expect(bots.at(-1)!.props.state).toBe('idle');
  expect(bots.at(-1)!.lookAt).toHaveBeenCalledWith(0.5, 0);
  expect(bots.at(-1)!.state).not.toHaveBeenCalled();
  expect(preview().style.background).toBe('#ffffff');
});

it('Event offers the events in a dropdown and the preview plays the chosen one on repeat', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  await open(fakeEngine().engine);
  await click(radio('Event'));
  expect(document.querySelector('select')!.value).toBe('error');
  expect(bots.at(-1)!.state).toHaveBeenCalledExactlyOnceWith('error');
  pick('dizzy');
  expect(bots.at(-1)!.state).toHaveBeenCalledExactlyOnceWith('dizzy');
  act(() => vi.advanceTimersByTime(3000));
  expect(bots.at(-1)!.state).toHaveBeenCalledTimes(2);
  await click(radio('idle loop'));
  act(() => vi.advanceTimersByTime(6000));
  expect(bots.at(-1)!.state).not.toHaveBeenCalled(); // back on the loop: a fresh bot, no replays
});

it('Background opens a colour picker on one click and closes it on the next', async () => {
  await open(fakeEngine().engine);
  const trigger = document.querySelector('[aria-label^="Background colour"]') as HTMLButtonElement;
  const hex = () => document.querySelector<HTMLInputElement>('input[aria-label="Background hex"]');
  expect(hex()).toBeNull();
  await click(trigger);
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(hex(), '#112233');
    hex()!.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(preview().style.background).toBe('#112233');
  await click(trigger);
  expect(hex()).toBeNull();
});

it('Lottie hides the size and background, and the one Download button follows the format', async () => {
  await open(fakeEngine().engine);
  expect(radio('1080').getAttribute('aria-checked')).toBe('true');
  expect(button('Download Lottie')).toBeUndefined();
  await click(radio('Lottie'));
  expect(radio('1080')).toBeUndefined();
  expect(document.querySelector('[aria-label^="Background colour"]')).toBeNull();
  expect(button('Download MP4')).toBeUndefined();
  expect(button('Download Lottie').className).toContain('bg-primary');
  expect(preview().style.background).toBe(''); // a Lottie has no background: the preview sits on the card
});

it('an unsupported browser gets an aria-disabled button that does nothing', async () => {
  const { engine } = fakeEngine(false);
  await open(engine);
  expect(button('Download MP4').getAttribute('aria-disabled')).toBe('true');
  await click(button('Download MP4'));
  expect(engine.exportMp4).not.toHaveBeenCalled();
});

it('exports the loop with every setting, seed 0 included, and saves noxy-<state>.mp4 (Review Focus 2)', async () => {
  const { engine, jobs } = fakeEngine();
  await open(engine, { ...DEFAULTS, state: 'thinking', speed: 0.5, seed: 0 });
  await click(button('Download MP4'));
  expect(jobs[0].req).toMatchObject({ state: 'thinking', event: null, speed: 0.5, seed: 0, size: 1080, background: '#ffffff', gaze: null });
  expect(jobs[0].req.dials).toEqual({ energy: 1, bounce: 1, squish: 1, blink: 1, glance: 1, wiggle: 1, head: 1, snap: 1 });
  await act(async () => jobs[0].finish(new Blob(['mp4'])));
  expect(engine.save).toHaveBeenCalledWith(expect.any(Blob), 'noxy-thinking.mp4');
});

it('an event makes noxy-<event>.mp4', async () => {
  const { engine, jobs } = fakeEngine();
  await open(engine);
  await click(radio('Event'));
  pick('success');
  await click(button('Download MP4'));
  expect(jobs[0].req.event).toBe('success');
  await act(async () => jobs[0].finish(new Blob(['mp4'])));
  expect(engine.save).toHaveBeenCalledWith(expect.any(Blob), 'noxy-success.mp4');
});

it('the progress text moves in 10 % steps', async () => {
  const { engine, jobs } = fakeEngine();
  await open(engine);
  await click(button('Download MP4'));
  act(() => jobs[0].onProgress(0.43));
  expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('Recording… 40%');
  act(() => jobs[0].onProgress(0.49));
  expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('Recording… 40%');
});

it('a second click while exporting starts nothing (Review Focus 3)', async () => {
  const { engine } = fakeEngine();
  await open(engine);
  await click(button('Download MP4'));
  await click(button('Download MP4'));
  expect(engine.exportMp4).toHaveBeenCalledOnce();
});

it('Cancel stops the export: nothing saved, no error toast', async () => {
  const { engine, jobs } = fakeEngine();
  await open(engine);
  await click(button('Download MP4'));
  await click(button('Cancel'));
  await flush();
  expect(jobs[0].signal.aborted).toBe(true);
  expect(engine.save).not.toHaveBeenCalled();
  expect(toast).not.toHaveBeenCalled();
  expect(button('Cancel')).toBeUndefined();
});

it('closing the dialog cancels the export (Review Focus 4)', async () => {
  const { engine, jobs } = fakeEngine();
  await open(engine);
  await click(button('Download MP4'));
  await click(document.querySelector('[aria-label="Close"]') as HTMLButtonElement);
  await flush();
  expect(jobs[0].signal.aborted).toBe(true);
  expect(engine.save).not.toHaveBeenCalled();
});

it('a failed export shows one toast', async () => {
  const { engine, jobs } = fakeEngine();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await open(engine);
  await click(button('Download MP4'));
  await act(async () => jobs[0].fail(new Error('encoder died')));
  expect(toast).toHaveBeenCalledExactlyOnceWith("Couldn't make the MP4");
  expect(engine.save).not.toHaveBeenCalled();
});

it('Download Lottie bakes the same request and saves noxy-<state>.json', async () => {
  const { engine, jobs } = fakeEngine();
  await open(engine, { ...DEFAULTS, state: 'thinking', speed: 0.5, seed: 0 });
  await click(radio('Lottie'));
  await click(button('Download Lottie'));
  expect(engine.exportMp4).not.toHaveBeenCalled();
  expect(jobs[0].req).toMatchObject({ state: 'thinking', event: null, speed: 0.5, seed: 0, gaze: null });
  await act(async () => jobs[0].finish(new Blob(['{}'])));
  expect(engine.save).toHaveBeenCalledWith(expect.any(Blob), 'noxy-thinking.json');
});

it("the Lottie works in a browser that can't make MP4", async () => {
  const { engine, jobs } = fakeEngine(false);
  await open(engine);
  await click(radio('Event'));
  pick('success');
  await click(radio('Lottie'));
  await click(button('Download Lottie'));
  await act(async () => jobs[0].finish(new Blob(['{}'])));
  expect(engine.save).toHaveBeenCalledWith(expect.any(Blob), 'noxy-success.json');
});

it('the clip and format are locked while it exports', async () => {
  const { engine } = fakeEngine();
  await open(engine);
  await click(button('Download MP4'));
  expect(document.querySelector('fieldset')!.disabled).toBe(true);
});

it('Download stays focusable while it exports, so keyboard focus stays on it, and a second press waits', async () => {
  const { engine, jobs } = fakeEngine();
  await open(engine);
  const download = button('Download MP4');
  act(() => download.focus());
  await click(download);
  expect(download.closest('fieldset[disabled]')).toBeNull(); // a browser drops focus from a button the fieldset disables (happy-dom doesn't)
  expect(download.getAttribute('aria-disabled')).toBe('true');
  await click(download);
  expect(engine.exportMp4).toHaveBeenCalledTimes(1);
  await act(async () => jobs[0].finish(new Blob()));
  expect(document.activeElement).toBe(download);
  expect(download.getAttribute('aria-disabled')).toBeNull();
});

it('a failed Lottie shows its own toast', async () => {
  const { engine, jobs } = fakeEngine();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await open(engine);
  await click(radio('Lottie'));
  await click(button('Download Lottie'));
  await act(async () => jobs[0].fail(new Error('bad rig')));
  expect(toast).toHaveBeenCalledExactlyOnceWith("Couldn't make the Lottie");
});
