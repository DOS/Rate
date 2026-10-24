/**
 * Letters that only Vietnamese uses among the site's languages. Acute vowels
 * (á, é, í, ó, ú, ý) are left out because Czech uses them too.
 */
const VIETNAMESE_RE =
  /[àãèìĩòõùũăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/iu;

const MAX_CONTENT_LANG_LEN = 4_000;

export function isVietnamese(text: string): boolean {
  if (typeof text !== 'string' || text.length === 0) return false;
  const bounded =
    text.length > MAX_CONTENT_LANG_LEN
      ? text.slice(0, MAX_CONTENT_LANG_LEN)
      : text;
  return VIETNAMESE_RE.test(bounded.normalize('NFC'));
}

/**
 * `lang` for marketplace or crawler text shown as is: "vi" when it is
 * Vietnamese and the page is in another locale, so screen readers switch
 * voice (WCAG 3.1.2, DOS/Rate#699). The vi locale needs no override.
 */
export function contentLang(
  text: string | number | boolean | null | undefined,
  locale: string
): 'vi' | undefined {
  return locale !== 'vi' && typeof text === 'string' && isVietnamese(text)
    ? 'vi'
    : undefined;
}
