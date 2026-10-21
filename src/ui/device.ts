/** True on phones and tablets (finger instead of mouse). */
export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
}

/**
 * Takes the focus away from a text field so the on-screen keyboard closes.
 * Called whenever the user does something other than typing (selecting,
 * closing a dialog), so the keyboard only shows when a field is tapped.
 */
export function blurActiveField(): void {
  if (typeof document === 'undefined') return;
  const el = document.activeElement as HTMLElement | null;
  if (el && el.matches('input, textarea, select')) el.blur();
}
