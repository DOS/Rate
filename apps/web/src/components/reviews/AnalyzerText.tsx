'use client';

import { useLocale, useTranslations } from 'next-intl';
import { analyzerCopy } from '@/lib/analyzer-copy';

type AnalyzerTranslator = ReturnType<typeof useTranslations<'analyzerCopy'>>;

/** Plain-text form of {@link AnalyzerText}, e.g. for search (DOS/Rate#647). */
export function analyzerText(text: string, t: AnalyzerTranslator): string {
  const copy = analyzerCopy(text);
  return 'key' in copy ? t(copy.key, copy.values) : copy.text;
}

/**
 * Renders a string written by the review analyzer in the active locale when
 * it is one of the analyzer's templates; otherwise the original Vietnamese,
 * marked as such outside the vi locale (DOS/Rate#647).
 */
export default function AnalyzerText({ text }: { text: string }) {
  const t = useTranslations('analyzerCopy');
  const locale = useLocale();
  const copy = analyzerCopy(text);
  if ('key' in copy) return <>{t(copy.key, copy.values)}</>;
  if (locale === 'vi' || !copy.lang) return <>{copy.text}</>;
  return (
    <>
      <span lang="vi">{copy.text}</span>{' '}
      <span className="text-muted small">({t('originalVietnamese')})</span>
    </>
  );
}
