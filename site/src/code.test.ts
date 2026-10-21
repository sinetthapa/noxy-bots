// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { codeTabs, copyButton } from './code.ts';

const writeText = vi.fn(async (_: string) => {});
const noxyTrack = vi.fn();
beforeEach(() => {
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  (globalThis as { noxyTrack?: unknown }).noxyTrack = noxyTrack;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

// CodeTabs.astro's markup, as the build writes it.
function mount(): HTMLElement {
  document.body.innerHTML = `<div id="t" data-code-tabs><div role="tablist">
    <button role="tab" id="t-html" data-tab="html" aria-selected="true" tabindex="0">HTML</button>
    <button role="tab" id="t-react" data-tab="react" aria-selected="false" tabindex="-1">React</button>
    <button role="tab" id="t-js" data-tab="js" aria-selected="false" tabindex="-1">JS</button>
    <button data-copy><svg></svg> <span>Copy</span></button></div>
    <pre role="tabpanel" aria-labelledby="t-html"><code></code></pre></div>`;
  return document.getElementById('t')!;
}
const tab = (id: string) => document.getElementById(`t-${id}`)!;
const key = (el: HTMLElement, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

describe('codeTabs', () => {
  test('shows the selected tab, highlighted and escaped', () => {
    codeTabs(mount(), (t) => `<${t}>`, 'docs');
    expect(document.querySelector('code')!.innerHTML).toContain('&lt;html');
  });
  test('arrow keys move the selection and focus, wrapping', () => {
    codeTabs(mount(), (t) => t, 'docs');
    key(tab('html'), 'ArrowLeft');
    expect(tab('js').getAttribute('aria-selected')).toBe('true');
    expect([tab('html').tabIndex, tab('js').tabIndex]).toEqual([-1, 0]);
    expect(document.activeElement).toBe(tab('js'));
    expect(document.querySelector('pre')!.getAttribute('aria-labelledby')).toBe('t-js');
    key(tab('js'), 'ArrowRight');
    expect(tab('html').getAttribute('aria-selected')).toBe('true');
  });
  test('Copy copies the selected tab and reports it with the page', async () => {
    codeTabs(mount(), (t) => `code ${t}`, 'docs');
    tab('react').click();
    document.querySelector<HTMLElement>('[data-copy]')!.click();
    await vi.waitFor(() => expect(noxyTrack).toHaveBeenCalledWith('code_copied', { format: 'react', page: 'docs' }));
    expect(writeText).toHaveBeenCalledWith('code react');
  });
  test('render() redraws after the text changes', () => {
    let v = 'one';
    const render = codeTabs(mount(), () => v, 'landing');
    v = 'two';
    render();
    expect(document.querySelector('code')!.textContent).toBe('two');
  });
});

describe('copyButton', () => {
  test('says Copied, then its label again', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<button><svg></svg> <span>Copy page as Markdown</span></button>';
    const b = document.querySelector('button')!;
    const copied = vi.fn();
    copyButton(b, () => '# md', copied);
    b.click();
    await vi.waitFor(() => expect(b.textContent).toContain('Copied'));
    expect([writeText.mock.calls[0][0], copied.mock.calls.length]).toEqual(['# md', 1]);
    vi.advanceTimersByTime(1600);
    expect(b.textContent).toContain('Copy page as Markdown');
    vi.useRealTimers();
  });
  test('a copy that works swaps its icon for a check, then back, and is announced', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<button><svg><rect></rect></svg> <span>Copy</span></button>';
    const b = document.querySelector('button')!;
    copyButton(b, () => 'x');
    expect(b.querySelector('span')!.getAttribute('aria-live')).toBe('polite');
    b.click();
    await vi.waitFor(() => expect(b.querySelector('svg')!.innerHTML).toBe('<path d="M20 6 9 17l-5-5"></path>'));
    vi.advanceTimersByTime(1600);
    expect(b.querySelector('svg')!.innerHTML).toBe('<rect></rect>');
    vi.useRealTimers();
  });
  test('copies within the click itself, so Safari allows it', () => {
    document.body.innerHTML = '<button><span>Copy</span></button>';
    copyButton(document.querySelector('button')!, () => 'now');
    document.querySelector('button')!.click();
    expect(writeText).toHaveBeenCalledWith('now'); // no await before this: writeText ran in the click's task
  });
  test('a refused copy says Select and copy, and reports nothing', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'));
    document.body.innerHTML = '<button><span>Copy</span></button>';
    const copied = vi.fn();
    copyButton(document.querySelector('button')!, () => 'x', copied);
    document.querySelector('button')!.click();
    await vi.waitFor(() => expect(document.body.textContent).toBe('Select and copy'));
    expect(copied).not.toHaveBeenCalled();
  });
});
