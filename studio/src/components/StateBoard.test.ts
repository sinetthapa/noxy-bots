// @vitest-environment happy-dom
// The state dock opens on the tab that holds the current state, and follows it when the state changes from outside.
import { NAMES } from 'noxy-bots';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { layerOf, StateBoard } from './StateBoard.tsx';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('finds the layer of every pickable state', () => {
  for (const layer of ['base', 'activity', 'emotion'] as const) for (const n of NAMES[layer]) expect(layerOf(n)).toBe(layer);
});

it('shows the current state checked on its own tab, and follows a new state', () => {
  const box = document.body.appendChild(document.createElement('div'));
  const root = createRoot(box);
  const render = (value: 'idle' | 'happy') => act(() => root.render(createElement(StateBoard, { value, onPick: () => {}, onPlay: () => {} })));
  const checked = () => box.querySelector('[role=radio][aria-checked=true]')?.textContent;
  const tab = () => box.querySelector('[role=tab][aria-selected=true]')?.textContent;
  render('idle');
  expect([tab(), checked()]).toEqual(['Base', 'idle']);
  render('happy');
  expect([tab(), checked()]).toEqual(['Emotion', 'happy']);
  act(() => root.unmount());
});

it('toggles the notification badge from its chip; another event plays and clears it', () => {
  const box = document.body.appendChild(document.createElement('div'));
  const root = createRoot(box);
  const calls: unknown[] = [];
  const render = (badge: boolean) =>
    act(() => root.render(createElement(StateBoard, { value: 'idle', onPick: () => {}, onPlay: (n) => calls.push(n), badge, onBadge: (on) => calls.push(on) })));
  const chip = (name: string) => [...box.querySelectorAll('button')].find((b) => b.textContent === name)!;
  render(false);
  expect(chip('notification').getAttribute('aria-pressed')).toBe('false');
  act(() => chip('notification').click());
  render(true);
  expect(chip('notification').getAttribute('aria-pressed')).toBe('true');
  act(() => chip('notification').click());
  act(() => chip('success').click());
  expect(calls).toEqual([true, false, 'success', false]);
  act(() => root.unmount());
});
