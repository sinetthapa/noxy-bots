// Per-viewer preferences (M3 spec §5.2): mode and colour scheme in localStorage, never in the URL. Storage can throw.
import { useEffect, useState } from 'react';

export type Mode = 'simple' | 'advanced';
export type Scheme = 'light' | 'dark';
export const MODES: readonly Mode[] = ['simple', 'advanced'];
export const SCHEMES: readonly Scheme[] = ['light', 'dark'];

export function load<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v as T) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // a private window: kept for this visit only
  }
}

/** The colour scheme: light by default (user, 2026-10-13). Sets .dark on <html> (index.html does it once before first paint). */
export function useScheme(): [Scheme, (s: Scheme) => void, boolean] {
  const [scheme, setScheme] = useState<Scheme>(() => load('noxy-studio-scheme', SCHEMES, 'light'));
  const dark = scheme === 'dark';
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    save('noxy-studio-scheme', scheme);
  }, [dark, scheme]);
  return [scheme, setScheme, dark];
}
