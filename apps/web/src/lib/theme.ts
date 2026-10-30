/**
 * Light and dark theme (DOS/Rate#1435). `data-bs-theme` on <html> is always
 * `light` or `dark` once THEME_INIT_SCRIPT has run, before the first paint:
 * the visitor's stored choice, else their `prefers-color-scheme`. The CSS
 * keys off that attribute only (Bootstrap's color modes do the same). The
 * server never reads the choice, so every page keeps one cacheable HTML
 * (ISR). Without JavaScript the page stays light.
 */
export type ThemeChoice = 'light' | 'dark' | 'system';
export type Theme = Exclude<ThemeChoice, 'system'>;

export const THEME_STORAGE_KEY = 'rate-theme';
export const THEME_ATTRIBUTE = 'data-bs-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Inlined at the top of <head>, so it runs before the body paints. Its text
 * is fixed: the CSP allows it by hash (THEME_INIT_SCRIPT_HASH), not by nonce,
 * because cached pages have no nonce (DOS/Rate#1348). Any edit here must
 * update the hash; csp.test.ts checks the two match.
 */
export const THEME_INIT_SCRIPT =
  'var t;try{t=localStorage.getItem("rate-theme")}catch(e){}if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.setAttribute("data-bs-theme",t)';

/** `'sha256-…'` of THEME_INIT_SCRIPT, for script-src. */
export const THEME_INIT_SCRIPT_HASH =
  "'sha256-hiWmIwJT0Q1kyL2TLtP8vzFIgvesHvawVQyXALgij64='";

/** The stored choice; "system" when there is none or storage is blocked. */
export function readThemeChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

/** The theme a choice resolves to now. */
export function resolveTheme(choice: ThemeChoice): Theme {
  if (choice !== 'system') return choice;
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

/** Applies a choice now and keeps it for the next page load. */
export function applyThemeChoice(choice: ThemeChoice): void {
  document.documentElement.setAttribute(THEME_ATTRIBUTE, resolveTheme(choice));
  try {
    if (choice === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage blocked (private mode): the choice holds for this page only.
  }
}

/**
 * While the choice is "system", follows a change of the OS setting without
 * a reload. Returns the unsubscribe function.
 */
export function followSystemTheme(getChoice: () => ThemeChoice): () => void {
  const query = window.matchMedia(DARK_QUERY);
  const onChange = () => {
    if (getChoice() === 'system') {
      document.documentElement.setAttribute(
        THEME_ATTRIBUTE,
        query.matches ? 'dark' : 'light'
      );
    }
  };
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
