// @vitest-environment happy-dom
// The gaze pad is a slider screen readers can read (DESIGN.md Accessibility): role="slider" needs a value and range.
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { GazePad } from './GazePad.tsx';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('has aria-valuenow, -min and -max beside the two-axis valuetext', () => {
  const box = document.body.appendChild(document.createElement('div'));
  const root = createRoot(box);
  act(() => root.render(createElement(GazePad, { gaze: { x: 0.3, y: -0.4 }, onGaze: () => {}, follow: false, onFollow: () => {} })));
  const pad = box.querySelector('[role=slider]')!;
  expect([pad.getAttribute('aria-valuenow'), pad.getAttribute('aria-valuemin'), pad.getAttribute('aria-valuemax')]).toEqual(['0.3', '-1', '1']);
  expect(pad.getAttribute('aria-valuetext')).toBe('x 0.3, y -0.4');
  act(() => root.unmount());
});
