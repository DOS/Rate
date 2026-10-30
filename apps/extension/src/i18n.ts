/**
 * UI strings through chrome.i18n, with the Vietnamese catalogue as the
 * fallback where chrome.i18n is missing, e.g. in tests (DOS/Rate#1304).
 * Server text (verdict labels, explanations, product names) is never
 * translated here.
 */
import viMessages from './_locales/vi/messages.json';

export type MessageKey = keyof typeof viMessages;

export interface CatalogueEntry {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Fills a catalogue entry the way chrome.i18n.getMessage does. */
export function formatCatalogueEntry(
  entry: CatalogueEntry,
  substitutions: readonly string[] = []
): string {
  const fill = (text: string) =>
    text.replace(/\$(\d)/g, (_, digit: string) => {
      return substitutions[Number(digit) - 1] ?? '';
    });
  return entry.message.replace(
    /\$([A-Za-z0-9_@]+)\$|\$\$/g,
    (whole, name: string | undefined) => {
      if (!name) return '$';
      const placeholder = entry.placeholders?.[name.toLowerCase()];
      return placeholder ? fill(placeholder.content) : whole;
    }
  );
}

/** The message for `key` in the browser's language, else Vietnamese. */
export function t(
  key: MessageKey,
  substitutions: ReadonlyArray<string | number> = []
): string {
  const subs = substitutions.map(String);
  try {
    const translated =
      typeof chrome === 'undefined'
        ? ''
        : chrome.i18n?.getMessage(key, subs.length > 0 ? subs : undefined);
    if (translated) return translated;
  } catch {
    // Fall through to the bundled Vietnamese text.
  }
  return formatCatalogueEntry(viMessages[key] as CatalogueEntry, subs);
}

/**
 * The message as HTML: its own text is escaped, and each substitution is
 * HTML the caller built and escaped already.
 */
export function tHtml(key: MessageKey, htmlParts: readonly string[]): string {
  // Private-use marks survive escaping and never occur in a message.
  const tokens = htmlParts.map((_, i) => `${i}`);
  return escapeHtml(t(key, tokens)).replace(
    /(\d+)/g,
    (_, index: string) => htmlParts[Number(index)] ?? ''
  );
}

// Marks that occur in Vietnamese and not in Czech or English, once the text
// is decomposed: grave, circumflex, tilde, breve, hook, horn, dot below.
// French, Spanish or Slovak names ("Lancôme", "São") match too, and
// Vietnamese written without these marks ("Sac nhanh") does not; both are
// rare in what the panel shows.
const VIETNAMESE_MARKS =
  /\u0111|\u0110|\u0300|\u0302|\u0303|\u0306|\u0309|\u031b|\u0323/;

/** Whether server text is Vietnamese, as marketplace data and summaries are. */
export function isVietnameseText(text: string): boolean {
  return VIETNAMESE_MARKS.test(text.normalize('NFD'));
}

/**
 * ` lang="vi"` for Vietnamese server text shown in an English or Czech panel,
 * so screen readers read it as Vietnamese (DOS/Rate#1374); empty otherwise.
 */
export function contentLangAttr(text: string): string {
  return isForeignVietnamese(text) ? ' lang="vi"' : '';
}

/** Vietnamese server text in a panel shown in another language. */
export function isForeignVietnamese(text: string): boolean {
  return t('langCode') !== 'vi' && isVietnameseText(text);
}

/** Server text as escaped HTML, in a `lang="vi"` span when it needs one. */
export function contentTextHtml(text: string): string {
  const html = escapeHtml(text);
  return isForeignVietnamese(text) ? `<span lang="vi">${html}</span>` : html;
}

/** Fills `data-i18n*` attributes of a static page (DOS/Rate#1304). */
export function applyDocumentMessages(root: Document): void {
  root.documentElement.lang = t('langCode');
  root.title = t('panelTitle');
  const bindings: Array<[string, (el: HTMLElement, text: string) => void]> = [
    ['data-i18n', (el, text) => (el.textContent = text)],
    [
      'data-i18n-placeholder',
      (el, text) => el.setAttribute('placeholder', text),
    ],
    ['data-i18n-aria-label', (el, text) => el.setAttribute('aria-label', text)],
  ];
  for (const [attribute, apply] of bindings) {
    root.querySelectorAll<HTMLElement>(`[${attribute}]`).forEach((el) => {
      const key = el.getAttribute(attribute);
      if (key && Object.prototype.hasOwnProperty.call(viMessages, key)) {
        apply(el, t(key as MessageKey));
      }
    });
  }
}
