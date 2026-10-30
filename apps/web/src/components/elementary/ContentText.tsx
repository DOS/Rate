import { contentLang } from '@/lib/content-lang';

/**
 * Marketplace or crawler text, marked `lang="vi"` when it is Vietnamese on a
 * page in another locale (DOS/Rate#699). Renders the bare text otherwise.
 */
export default function ContentText({
  text,
  locale,
  lang: knownLang,
}: {
  text: string | number | null | undefined;
  locale: string;
  /** A language the caller already knows, such as an English spec value. */
  lang?: 'en' | 'vi';
}) {
  const lang = knownLang ?? contentLang(text, locale);
  return lang ? <span lang={lang}>{text}</span> : <>{text}</>;
}
