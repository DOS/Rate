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
 * Where Tab (or Shift+Tab when `backwards`) goes from `spot`, a non-focusable
 * node that was clicked: the first of `items` after it (or the last before
 * it), wrapping to the other end when there is none.
 */
export function tabFromSpot(
  items: readonly HTMLElement[],
  spot: Node,
  backwards: boolean
): HTMLElement | null {
  const after = (el: HTMLElement) =>
    spot.contains(el) ||
    Boolean(
      spot.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING
    );
  const next = backwards
    ? [...items].reverse().find((el) => !after(el) && !el.contains(spot))
    : items.find(after);
  return next ?? (backwards ? items[items.length - 1] : items[0]) ?? null;
}

/**
 * How many open `inertOutside` calls hold each element inert. Only elements
 * in this map had their `inert` set by us; anything else that is inert
 * belongs to other code and is never cleared here.
 */
const inertHolds = new Map<HTMLElement, number>();

/**
 * Makes everything in the page `inert` except `keep` and their ancestors, so
 * the rest of the page leaves the focus order and the accessibility tree.
 * Elements added to the page while it holds (a toast, a portal, new content
 * after a soft navigation) become inert too. Elements that other code made
 * inert are left alone, and so is an element whose `inert` other code
 * changes while this holds. Returns the undo, which clears only the `inert`
 * set here, once no other open call still holds the element.
 */
export function inertOutside(keep: readonly HTMLElement[]): () => void {
  // Every element this call has held, including ones it gave up because
  // other code took over their `inert`: it does not take those again.
  const mine = new Set<HTMLElement>();
  // Drops this call's hold; the last hold clears the `inert` set here.
  function release(el: HTMLElement) {
    const holds = inertHolds.get(el);
    if (holds === undefined) return;
    if (holds > 1) {
      inertHolds.set(el, holds - 1);
    } else {
      inertHolds.delete(el);
      el.inert = false;
    }
  }
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'childList') {
        // A removed element is no longer held, so it is not kept or watched.
        for (const node of Array.from(record.removedNodes)) {
          if (!(node instanceof HTMLElement) || !mine.has(node)) continue;
          release(node);
          mine.delete(node);
        }
        continue;
      }
      // Our own writes are dropped below, so this change is someone else's.
      if (record.target instanceof HTMLElement)
        inertHolds.delete(record.target);
    }
    hold();
  });
  function hold() {
    observer.disconnect();
    for (const kept of keep) {
      for (
        let node: HTMLElement = kept;
        node.parentElement && node !== document.body;
        node = node.parentElement
      ) {
        observer.observe(node.parentElement, { childList: true });
        for (const sibling of Array.from(node.parentElement.children)) {
          if (!(sibling instanceof HTMLElement) || mine.has(sibling)) continue;
          if (keep.some((el) => sibling.contains(el))) continue;
          const holds = inertHolds.get(sibling);
          if (holds === undefined && sibling.inert) continue;
          // Written only once: a second write would read, to the observer
          // of the call that holds it already, as a change by other code.
          if (holds === undefined) sibling.inert = true;
          inertHolds.set(sibling, (holds ?? 0) + 1);
          mine.add(sibling);
        }
      }
    }
    for (const el of mine) {
      if (inertHolds.has(el))
        observer.observe(el, { attributeFilter: ['inert'] });
    }
    observer.takeRecords();
  }
  hold();
  return () => {
    observer.disconnect();
    for (const el of mine) release(el);
  };
}
