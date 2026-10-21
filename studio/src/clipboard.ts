// Copies text; false when the browser won't (no clipboard on a plain-http page, or permission denied).
export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The copy shortcut to name in a fallback message: ⌘C on Apple devices, Ctrl+C elsewhere. */
export const copyKeys = (ua: string = navigator.userAgent): string => (/Mac|iPhone|iPad/.test(ua) ? '⌘C' : 'Ctrl+C');
