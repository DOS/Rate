'use client';
import { useEffect, useRef, useState } from 'react';
import { Link } from '@/lib/navigation';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import {
  BsArrowLeftRight,
  BsBellFill,
  BsChevronDown,
  BsCodeSlash,
  BsShieldCheck,
} from 'react-icons/bs';
import LocaleSwitcher from '@/components/elementary/LocaleSwitcher';
import RateWordmark from '@/components/brand/RateWordmark';

export interface NavbarLinkItem {
  readonly id?: string | number;
  readonly label?: string | null;
  readonly href?: string | null;
  readonly newTab?: boolean | null;
}

const CATEGORY_LINK_IDS = new Set([
  'smartphones',
  'laptops',
  'tablets',
  'smartwatches',
  'earbuds',
]);
// Already reachable from the logo and the price-alert button on desktop.
const DESKTOP_HIDDEN_LINK_IDS = new Set(['home', 'watchlist']);

export function NavbarDarkDynamic({
  links,
  logoUrl,
}: {
  readonly links: readonly NavbarLinkItem[];
  readonly logoUrl?: string | null;
}) {
  const tNav = useTranslations('rate.nav');
  const [scroll, setScroll] = useState(false);
  const [toggle, setToggle] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const categoriesRef = useRef<HTMLLIElement>(null);

  // Desktop categories dropdown: closes on Escape (focus back to its button),
  // on a pointer press outside it, and when focus leaves it (DOS/Rate#611).
  useEffect(() => {
    if (!categoriesOpen) return;
    const root = categoriesRef.current;
    const close = () => setCategoriesOpen(false);
    const onPointerDown = (e: PointerEvent) => {
      if (root && !e.composedPath().includes(root)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      close();
      root?.querySelector<HTMLElement>('button')?.focus();
    };
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (root && next && !root.contains(next)) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    root?.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      root?.removeEventListener('focusout', onFocusOut);
    };
  }, [categoriesOpen]);

  // Phone menu: focus moves into it on open, Escape closes it and focus
  // returns to the toggle (DOS/Rate#523).
  useEffect(() => {
    if (!toggle) return;
    menuRef.current
      ?.querySelector<HTMLElement>('a[href]')
      ?.focus({ preventScroll: true });
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setToggle(false);
      toggleRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  useEffect(() => {
    const handlerScroll = () => setScroll(window.scrollY > 50);
    window.addEventListener('scroll', handlerScroll);
    return () => window.removeEventListener('scroll', handlerScroll);
  }, []);

  const logo = (
    <Link className="nav-brand" href="/" aria-label="Rate.vn">
      {logoUrl ? (
        <Image
          src={logoUrl}
          width={0}
          height={0}
          sizes="100vw"
          style={{ width: '166px', height: 'auto' }}
          className="logo"
          alt="Rate.vn Logo"
        />
      ) : (
        <RateWordmark tone="ink" size={30} />
      )}
    </Link>
  );

  return (
    <>
      <div
        className={`header header-light ${scroll ? 'header-fixed' : ''} `}
        data-sticky-element=""
      >
        <div className="container-fluid">
          {/* Phone vs desktop layout comes from media queries in style.scss
          (992px), not from a JS width class: the server HTML must already
          be right, or the navbar jumps after hydration (DOS/Rate#515). */}
          <nav id="navigation" className="navigation">
            <div className="nav-header">
              {logo}
              <button
                ref={toggleRef}
                type="button"
                className="nav-toggle"
                aria-label={tNav('menuToggleAria')}
                aria-controls="rate-nav-menu"
                aria-expanded={toggle}
                onClick={() => setToggle(!toggle)}
              ></button>
              {/* Below 576px only the locale switcher and Inspect fit next to the
              logo; more icons pushed the menu button off the screen. The
              hidden ones are all in the menu (DOS/Rate#515). */}
              <div className="mobile_nav">
                <ul className="d-flex align-items-center gap-2">
                  <li className="me-1">
                    <LocaleSwitcher isDarkHeader={false} compact={true} />
                  </li>
                  <li>
                    <Link
                      href="/inspect"
                      className="d-flex align-items-center text-danger"
                      aria-label={tNav('inspect')}
                    >
                      <BsShieldCheck className="me-1" />
                    </Link>
                  </li>
                  <li className="d-none d-sm-block">
                    <Link
                      href="/compare"
                      className="d-flex align-items-center text-dark"
                      aria-label={tNav('compare')}
                    >
                      <BsArrowLeftRight className="me-1" />
                    </Link>
                  </li>
                  <li className="d-none d-sm-block">
                    <Link
                      href="/watchlist"
                      className="d-flex align-items-center text-primary"
                      aria-label={tNav('watchlist')}
                    >
                      <BsBellFill className="me-1" />
                    </Link>
                  </li>
                  <li className="d-none d-sm-block">
                    <Link
                      href="/developers"
                      className="d-flex align-items-center text-dark"
                      aria-label={tNav('developers')}
                    >
                      <BsCodeSlash className="me-1" />
                    </Link>
                  </li>
                </ul>
              </div>
            </div>

            <div
              ref={menuRef}
              id="rate-nav-menu"
              className={`nav-menus-wrapper ${toggle ? 'nav-menus-wrapper-open' : ''}`}
              // Closing slides out, and visibility turns hidden only at the
              // end of the slide (see style.scss).
              style={{
                transitionProperty: toggle ? 'none' : 'left, visibility',
              }}
            >
              <div className="mobLogos">
                {logoUrl ? (
                  <Image
                    src={logoUrl}
                    width={0}
                    height={0}
                    sizes="100vw"
                    style={{ width: '140px', height: 'auto' }}
                    className="img-fluid lightLogo"
                    alt="Rate.vn Logo"
                  />
                ) : (
                  <RateWordmark tone="ink" size={26} />
                )}
              </div>
              <button
                type="button"
                className="nav-menus-wrapper-close-button"
                aria-label={tNav('menuCloseAria')}
                onClick={() => {
                  setToggle(false);
                  toggleRef.current?.focus({ preventScroll: true });
                }}
              >
                <span aria-hidden="true">✕</span>
              </button>

              {(() => {
                const defaultLinks: NavbarLinkItem[] = [
                  {
                    id: 'home',
                    label: tNav('home'),
                    href: '/',
                  },
                  {
                    id: 'smartphones',
                    label: tNav('smartphones'),
                    href: '/smartphones',
                  },
                  {
                    id: 'laptops',
                    label: tNav('laptops'),
                    href: '/laptops',
                  },
                  {
                    id: 'tablets',
                    label: tNav('tablets'),
                    href: '/tablets',
                  },
                  {
                    id: 'smartwatches',
                    label: tNav('smartwatches'),
                    href: '/smartwatches',
                  },
                  {
                    id: 'earbuds',
                    label: tNav('earbuds'),
                    href: '/earbuds',
                  },
                  {
                    id: 'leaderboard',
                    label: tNav('leaderboard'),
                    href: '/leaderboard',
                  },
                  {
                    id: 'merchants',
                    label: tNav('merchants'),
                    href: '/merchants',
                  },
                  {
                    id: 'inspect',
                    label: tNav('inspect'),
                    href: '/inspect',
                  },
                  {
                    id: 'compare',
                    label: tNav('compare'),
                    href: '/compare',
                  },
                  {
                    id: 'watchlist',
                    label: tNav('watchlist'),
                    href: '/watchlist',
                  },
                  {
                    id: 'developers',
                    label: tNav('developers'),
                    href: '/developers',
                  },
                ];
                const validLinks = (links || []).filter(
                  (l) => l?.href && l?.label
                );
                if (validLinks.length > 0) {
                  return (
                    <ul className="nav-menu">
                      {validLinks.map((link) => (
                        <li key={String(link.id) + link.href}>
                          <Link
                            href={link.href!}
                            target={link.newTab ? '_blank' : undefined}
                          >
                            {link.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  );
                }
                // Desktop fits one row: the five catalogues sit in one
                // dropdown, and Home / Watchlist (logo, price-alert button)
                // show only in the phone menu (DOS/Rate#611).
                const categoryLinks = defaultLinks.filter((l) =>
                  CATEGORY_LINK_IDS.has(String(l.id))
                );
                const firstCategoryIndex = defaultLinks.findIndex((l) =>
                  CATEGORY_LINK_IDS.has(String(l.id))
                );
                const renderLink = (link: NavbarLinkItem) => (
                  <li
                    key={String(link.id) + link.href}
                    className={
                      DESKTOP_HIDDEN_LINK_IDS.has(String(link.id))
                        ? 'd-lg-none'
                        : undefined
                    }
                  >
                    <Link href={link.href!}>{link.label}</Link>
                  </li>
                );
                return (
                  <ul className="nav-menu">
                    {defaultLinks.slice(0, firstCategoryIndex).map(renderLink)}
                    <li
                      ref={categoriesRef}
                      className={`rate-nav-dropdown ${categoriesOpen ? 'is-open' : ''}`}
                    >
                      <button
                        type="button"
                        className="rate-nav-dropdown-toggle"
                        aria-expanded={categoriesOpen}
                        aria-controls="rate-nav-categories"
                        onClick={() => setCategoriesOpen((o) => !o)}
                      >
                        {tNav('categories')}
                        <BsChevronDown aria-hidden="true" />
                      </button>
                      <ul id="rate-nav-categories" className="nav-dropdown">
                        {categoryLinks.map((link) => (
                          <li key={String(link.id)}>
                            <Link
                              href={link.href!}
                              onClick={() => setCategoriesOpen(false)}
                            >
                              {link.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </li>
                    {defaultLinks
                      .slice(firstCategoryIndex)
                      .filter((l) => !CATEGORY_LINK_IDS.has(String(l.id)))
                      .map(renderLink)}
                  </ul>
                );
              })()}

              <ul className="nav-menu nav-menu-social align-to-right d-flex align-items-center mb-0">
                <li className="d-flex align-items-center me-3">
                  <LocaleSwitcher isDarkHeader={false} />
                </li>
                <li className="list-buttons d-flex align-items-center">
                  <Link
                    href="/watchlist"
                    className="d-inline-flex align-items-center"
                  >
                    <BsBellFill className="fs-6 me-1" />
                    {tNav('priceWatchCta')}
                  </Link>
                </li>
              </ul>
            </div>
          </nav>
        </div>
      </div>
      <div className="clearfix"></div>
    </>
  );
}

export default NavbarDarkDynamic;
