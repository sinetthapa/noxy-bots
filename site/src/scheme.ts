// The header's scheme button (M5 spec §4.3, revised by the user 2026-10-13): Light ↔ Dark, light by default, the same key the
// studio uses, so a reload keeps it. Not imported from studio/src/prefs.ts: that module imports React, which static pages shouldn't load.
type Scheme = 'light' | 'dark';
const KEY = 'noxy-studio-scheme';
const load = (): Scheme => {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light'; // storage can throw in private windows
  }
};
const save = (s: Scheme) => {
  try {
    localStorage.setItem(KEY, s);
  } catch {}
};
export const next = (s: Scheme): Scheme => (s === 'light' ? 'dark' : 'light');

/** Wires one button: its data-scheme shows the current choice. */
export function schemeButton(button: HTMLElement): void {
  let scheme = load();
  const show = () => {
    document.documentElement.classList.toggle('dark', scheme === 'dark');
    button.dataset.scheme = scheme;
    button.setAttribute('aria-label', scheme === 'dark' ? 'Switch to light' : 'Switch to dark');
  };
  button.addEventListener('click', () => {
    scheme = next(scheme);
    save(scheme);
    show();
  });
  show();
}
