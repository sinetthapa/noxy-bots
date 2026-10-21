// @vitest-environment happy-dom
// The seed field commits on Enter or blur, so typing a long seed doesn't restart the bot on every digit.
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi, type Mock } from 'vitest';
import { SeedField } from './SeedField.tsx';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let onSeed: Mock<(v: number | null) => void>;
const input = () => document.getElementById('seed') as HTMLInputElement;
const render = (seed: number | null) => act(() => root.render(createElement(SeedField, { seed, onSeed })));
/** Types like a person: React's onChange listens for 'input' events after the native value changes. */
const type = (v: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), v);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
const blur = () => act(() => void input().dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
const enter = () => act(() => void input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));

beforeEach(() => {
  onSeed = vi.fn();
  root = createRoot(document.body.appendChild(document.createElement('div')));
});
afterEach(() => {
  act(() => root.unmount());
  document.body.textContent = '';
});

it('typing changes nothing until blur', () => {
  render(null);
  type('1');
  type('12');
  expect(onSeed).not.toHaveBeenCalled();
  blur();
  expect(onSeed.mock.calls).toEqual([[12]]);
});

it('Enter commits too', () => {
  render(null);
  type('42');
  enter();
  expect(onSeed.mock.calls).toEqual([[42]]);
});

it('junk is dropped on commit and the field shows the seed in use again', () => {
  render(7);
  for (const junk of ['12e', '-1', '1.5', '4294967296']) {
    type(junk);
    enter();
    expect(input().value).toBe('7');
  }
  expect(onSeed).not.toHaveBeenCalled();
});

it('an empty field means random', () => {
  render(7);
  type('');
  blur();
  expect(onSeed.mock.calls).toEqual([[null]]);
});

it('committing the seed already in use does nothing', () => {
  render(7);
  type('007');
  blur();
  expect(onSeed).not.toHaveBeenCalled();
  expect(input().value).toBe('7');
});

it('a seed changed from outside replaces typed text', () => {
  render(7);
  type('12');
  render(99);
  expect(input().value).toBe('99');
});
