import { contentLang } from '@/lib/content-lang';

/**
 * Marketplace or crawler text, marked `lang="vi"` when it is Vietnamese on a
 * page in another locale (DOS/Rate#699). Renders the bare text otherwise.
 */
export default function ContentText({
  text,
  locale,
}: {
  text: string | number | null | undefined;
  locale: string;
}) {
  const lang = contentLang(text, locale);
  return lang ? <span lang={lang}>{text}</span> : <>{text}</>;
}
