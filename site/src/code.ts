// Copy buttons and code tabs (CodeTabs.astro), shared by the landing and the docs (M5 spec §6.2): plain script, no React.
import { copy } from '../../studio/src/clipboard.ts';
import { highlight } from '../../studio/src/snippets.ts';
import { track } from '../../studio/src/track.ts';

/** A button whose last child is its label: it copies text() and says Copied, its icon a check (DESIGN.md), or Select and copy,
 *  for 1.6 s. text() runs before any await, so Safari still sees the click. */
export function copyButton(button: HTMLElement, text: () => string, copied?: () => void): void {
  const label = button.lastElementChild!;
  const icon = button.querySelector('svg');
  const [rest, art] = [label.textContent, icon?.innerHTML];
  label.setAttribute('aria-live', 'polite');
  let timer = 0;
  button.addEventListener('click', async () => {
    const ok = await copy(text());
    if (ok) copied?.();
    label.textContent = ok ? 'Copied' : 'Select and copy';
    if (icon) icon.innerHTML = ok ? '<path d="M20 6 9 17l-5-5"></path>' : art!; // lucide's Check
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      label.textContent = rest;
      if (icon) icon.innerHTML = art!;
    }, 1600);
  });
}

/** Wires one CodeTabs: arrow keys move between tabs, Copy copies the selected one. Returns render(), for when text() changes. */
export function codeTabs(root: HTMLElement, text: (tab: string) => string, page: 'landing' | 'docs'): () => void {
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const panel = root.querySelector<HTMLElement>('[role="tabpanel"]')!;
  let tab = tabs.find((t) => t.getAttribute('aria-selected') === 'true')!.dataset.tab!;
  const render = () => void (panel.firstElementChild!.innerHTML = highlight(text(tab))); // highlight escapes every character it emits
  const select = (t: HTMLButtonElement) => {
    tab = t.dataset.tab!;
    for (const x of tabs) {
      x.setAttribute('aria-selected', String(x === t));
      x.tabIndex = x === t ? 0 : -1;
    }
    panel.setAttribute('aria-labelledby', t.id);
    render();
  };
  for (const t of tabs) {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const next = tabs[(tabs.indexOf(t) + d + tabs.length) % tabs.length];
      select(next);
      next.focus();
    });
  }
  copyButton(root.querySelector('[data-copy]')!, () => text(tab), () => track('code_copied', { format: tab, page }));
  render();
  return render;
}
