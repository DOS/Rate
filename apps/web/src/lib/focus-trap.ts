/** Elements that can take keyboard focus, before the visibility check. */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Where Tab (or Shift+Tab when `backwards`) must send focus to stay inside a
 * trap whose tabbable elements are `items`, in DOM order. Returns null when
 * the browser's own move already stays inside: only the ends wrap, and focus
 * that is outside the trap comes back to its first (or last) element.
 */
export function wrapFocusTarget<T>(
  items: readonly T[],
  active: T | null,
  backwards: boolean
): T | null {
  if (items.length === 0) return null;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const index = active === null ? -1 : items.indexOf(active);
  if (index === -1) return backwards ? last : first;
  if (backwards && index === 0) return last;
  if (!backwards && index === items.length - 1) return first;
  return null;
}

/** The elements inside `root` that Tab can reach, in DOM order. */
export function tabbableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter(
    (el) =>
      el.tabIndex >= 0 &&
      !el.closest('[inert]') &&
      el.getClientRects().length > 0 &&
      getComputedStyle(el).visibility !== 'hidden'
  );
}

/**
 * Makes everything in the page `inert` except `keep` and their ancestors, so
 * the rest of the page leaves the focus order and the accessibility tree.
 * Elements that were already inert are left alone. Returns the undo.
 */
export function inertOutside(keep: readonly HTMLElement[]): () => void {
  const changed: HTMLElement[] = [];
  for (const kept of keep) {
    for (
      let node: HTMLElement = kept;
      node.parentElement && node !== document.body;
      node = node.parentElement
    ) {
      for (const sibling of Array.from(node.parentElement.children)) {
        if (!(sibling instanceof HTMLElement) || sibling.inert) continue;
        if (keep.some((el) => sibling.contains(el))) continue;
        sibling.inert = true;
        changed.push(sibling);
      }
    }
  }
  return () => {
    for (const el of changed) el.inert = false;
  };
}
