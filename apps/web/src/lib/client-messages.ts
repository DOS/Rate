/**
 * Which messages each route sends to Client Components (DOS/Rate#736).
 * Server Components read the full catalog through getTranslations; the
 * client only gets what its components call useTranslations() on, so a page
 * does not ship strings it never shows.
 *
 * A pick is a namespace ("deals"), a nested key ("rate.nav") or the keys of
 * a namespace that start with a prefix ("compare.tray*").
 */
export const CLIENT_MESSAGE_SCOPES = {
  // Navbar, error boundary, compare tray and the quick compare / watch / price
  // signal controls that appear on most pages.
  shared: [
    'rate.nav',
    'errors.global',
    'compare.tray*',
    'compare.quickToggle*',
    'watchlist.quickToggle*',
    'deals.radarBadge*',
  ],
  home: ['heroSearch', 'priceVerdict'],
  contact: ['staticPages.quarantine*', 'heroSearch', 'priceVerdict'],
  catalog: ['catalog.sidebar', 'catalog.toolbar', 'catalog.schemas'],
  productDetail: [
    'productDetail',
    'reviews',
    'analyzerCopy',
    'priceVerdict',
    'watchlist',
  ],
  compare: ['compare'],
  deals: ['deals'],
  leaderboard: ['leaderboard'],
  inspect: ['inspect', 'priceVerdict', 'analyzerCopy', 'watchlist'],
  merchants: ['merchants'],
  merchantProfile: ['merchants', 'analyzerCopy'],
  watchlist: ['watchlist'],
  developers: ['developers'],
  auth: ['authPortal'],
} as const satisfies Record<string, readonly string[]>;

export type ClientMessageScope = keyof typeof CLIENT_MESSAGE_SCOPES;

type Messages = Record<string, unknown>;

const UNSAFE_MESSAGE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const isRecord = (value: unknown): value is Messages =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function mergeInto(target: Messages, path: string[], value: unknown) {
  if (path.length === 0 || path.some((k) => !k || UNSAFE_MESSAGE_KEYS.has(k))) {
    return;
  }
  let node = target;
  for (const key of path.slice(0, -1)) {
    if (!Object.hasOwn(node, key) || !isRecord(node[key])) node[key] = {};
    node = node[key] as Messages;
  }
  const last = path[path.length - 1]!;
  node[last] =
    Object.hasOwn(node, last) && isRecord(node[last]) && isRecord(value)
      ? { ...node[last], ...value }
      : value;
}

/** The messages a scope needs on the client, always including `shared`. */
export function pickClientMessages(
  messages: Messages,
  scope: ClientMessageScope = 'shared'
): Messages {
  if (!isRecord(messages)) return {};
  const safeScope: ClientMessageScope = Object.hasOwn(
    CLIENT_MESSAGE_SCOPES,
    scope
  )
    ? scope
    : 'shared';
  const picks = new Set<string>([
    ...CLIENT_MESSAGE_SCOPES.shared,
    ...CLIENT_MESSAGE_SCOPES[safeScope],
  ]);
  const out: Messages = {};
  for (const pick of picks) {
    const path = pick.replace(/\*$/, '').split('.');
    if (pick.endsWith('*')) {
      const prefix = path.pop()!;
      const parent = path.reduce<unknown>(
        (node, key) =>
          isRecord(node) &&
          !UNSAFE_MESSAGE_KEYS.has(key) &&
          Object.hasOwn(node, key)
            ? node[key]
            : undefined,
        messages
      );
      if (!isRecord(parent)) continue;
      const subset = Object.fromEntries(
        Object.entries(parent).filter(
          ([key]) => !UNSAFE_MESSAGE_KEYS.has(key) && key.startsWith(prefix)
        )
      );
      if (Object.keys(subset).length > 0) mergeInto(out, path, subset);
    } else {
      const value = path.reduce<unknown>(
        (node, key) =>
          isRecord(node) &&
          !UNSAFE_MESSAGE_KEYS.has(key) &&
          Object.hasOwn(node, key)
            ? node[key]
            : undefined,
        messages
      );
      if (value !== undefined) mergeInto(out, path, value);
    }
  }
  return out;
}
