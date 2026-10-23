import { getLocale, getTranslations } from 'next-intl/server';
import NavbarDarkDynamic from './navbar/NavbarDarkDynamic';
import FooterTop from './footer-top';
import FooterDynamic from './footer/FooterDynamic';
import BackToTop from './back-to-top';

/** The id the skip link targets; E2E specs select the landmark by it. */
export const MAIN_CONTENT_ID = 'main-content';

/**
 * The frame every page shares: skip link, navbar, the page's own content in
 * the one <main> landmark, then the footer CTA and footer (DOS/Rate#764).
 * Pages pass their content as children, so none of them renders its own
 * <main>.
 */
export default async function PageShell({
  children,
  // Without a locale the request locale is used, as in FooterTop.
  locale,
  footerTop = true,
  mainClassName,
}: {
  readonly children: React.ReactNode;
  readonly locale?: string;
  /** The footer call-to-action band above the footer. */
  readonly footerTop?: boolean;
  readonly mainClassName?: string;
}) {
  const tNav = await getTranslations({
    locale: locale ?? (await getLocale()),
    namespace: 'rate.nav',
  });
  return (
    <>
      {/* First focusable element on the page; hidden until it has focus. */}
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="rate-skip-link visually-hidden-focusable"
      >
        {tNav('skipToContent')}
      </a>
      <NavbarDarkDynamic links={[]} />
      {/* tabIndex -1: following the skip link moves focus here, so the next
      Tab continues inside the content instead of in the navbar. */}
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className={mainClassName}>
        {children}
      </main>
      {footerTop ? <FooterTop locale={locale} /> : null}
      <FooterDynamic sections={[]} links={[]} locale={locale} />
      <BackToTop />
    </>
  );
}
