'use client';
import { useEffect, useRef, useState } from 'react';
import { IntentLink } from '@/components/elementary/IntentLink';
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
import ThemeToggle, {
  ThemeCycleButton,
} from '@/components/elementary/ThemeToggle';
import RateWordmark from '@/components/brand/RateWordmark';
import {
  inertOutside,
  tabFromSpot,
  tabbableIn,
  wrapFocusTarget,
} from '@/lib/focus-trap';

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

/** The width at which the navbar menu becomes the off-canvas phone menu (style.scss). */
const PHONE_MENU_QUERY = '(max-width: 991.98px)';

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
  // Phone layout: the menu is off-canvas and traps focus while open. Every
  // header link is an IntentLink, so nothing in it prefetches until the
  // visitor points at, focuses or touches it (DOS/Rate#1064, DOS/Rate#1330).
  const [phoneMenu, setPhoneMenu] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia(PHONE_MENU_QUERY).matches
  );
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const categoriesRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const query = window.matchMedia(PHONE_MENU_QUERY);
    const update = () => setPhoneMenu(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

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

  // While the phone menu is open, the page behind it is inert: screen readers
  // and Tab cannot reach it, and taps go through to the body (DOS/Rate#1102).
  // The toggle stays live, so every close path can hand focus back to it
  // while the page is still inert. Tab and Shift+Tab wrap inside the menu
  // (DOS/Rate#1098), which inert alone does not do. A tap or click beside
  // the drawer closes it; a press that turns into a scroll or a pinch fires
  // no click and leaves it open.
  // Focus moves without preventScroll: the drawer scrolls on short screens,
  // and the page behind stays put since the drawer is fixed.
  useEffect(() => {
    const menu = menuRef.current;
    const toggleButton = toggleRef.current;
    if (!toggle || !phoneMenu || !menu || !toggleButton) return;
    const restore = inertOutside([menu, toggleButton]);
    const outside = (e: Event) => {
      const path = e.composedPath();
      return !path.includes(menu) && !path.includes(toggleButton);
    };
    let pressedOutside = false;
    // The last spot pressed inside the drawer, where Tab continues from when
    // the press left focus on the body.
    let pressedIn: Node | null = null;
    const onPointerDown = (e: PointerEvent) => {
      pressedOutside = outside(e);
      pressedIn =
        e.target instanceof Node && menu.contains(e.target) ? e.target : null;
    };
    const onPointerUp = (e: PointerEvent) => {
      pressedOutside &&= outside(e);
    };
    const onClick = (e: MouseEvent) => {
      // Only a left click or a tap that started and ended outside; not a
      // drag out of or into the drawer.
      if (e.button !== 0 || !pressedOutside || !outside(e)) return;
      setToggle(false);
      toggleButton.focus({ preventScroll: true });
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey) return;
      const active = document.activeElement;
      const items = tabbableIn(menu);
      // After a click on a blank spot in the drawer focus is on the body:
      // Tab continues from that spot, and still wraps at the ends.
      if (active === document.body && pressedIn) {
        const target = tabFromSpot(items, pressedIn, e.shiftKey);
        if (!target) return;
        e.preventDefault();
        target.focus();
        return;
      }
      // A focused element inside the menu that Tab cannot reach (a closing
      // popup) is left to the browser's own order.
      if (
        active instanceof HTMLElement &&
        menu.contains(active) &&
        !items.includes(active)
      )
        return;
      const target = wrapFocusTarget(
        items,
        active instanceof HTMLElement ? active : null,
        e.shiftKey
      );
      if (!target) return;
      e.preventDefault();
      target.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKeyDown);
      restore();
    };
  }, [toggle, phoneMenu]);

  useEffect(() => {
    const handlerScroll = () => setScroll(window.scrollY > 50);
    window.addEventListener('scroll', handlerScroll);
    return () => window.removeEventListener('scroll', handlerScroll);
  }, []);

  const logo = (
    <IntentLink className="nav-brand" href="/" aria-label="Rate.vn">
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
    </IntentLink>
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
                    <IntentLink
                      href="/inspect"
                      className="d-flex align-items-center text-danger"
                      aria-label={tNav('inspect')}
                    >
                      <BsShieldCheck className="me-1" />
                    </IntentLink>
                  </li>
                  <li className="d-none d-sm-block">
                    <IntentLink
                      href="/compare"
                      className="d-flex align-items-center text-dark"
                      aria-label={tNav('compare')}
                    >
                      <BsArrowLeftRight className="me-1" />
                    </IntentLink>
                  </li>
                  <li className="d-none d-sm-block">
                    <IntentLink
                      href="/watchlist"
                      className="d-flex align-items-center text-primary"
                      aria-label={tNav('watchlist')}
                    >
                      <BsBellFill className="me-1" />
                    </IntentLink>
                  </li>
                  <li className="d-none d-sm-block">
                    <IntentLink
                      href="/developers"
                      className="d-flex align-items-center text-dark"
                      aria-label={tNav('developers')}
                    >
                      <BsCodeSlash className="me-1" />
                    </IntentLink>
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
                          <IntentLink
                            href={link.href!}
                            target={link.newTab ? '_blank' : undefined}
                          >
                            {link.label}
                          </IntentLink>
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
                    <IntentLink href={link.href!}>{link.label}</IntentLink>
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
                            <IntentLink
                              href={link.href!}
                              onClick={() => setCategoriesOpen(false)}
                            >
                              {link.label}
                            </IntentLink>
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
                <li className="d-flex align-items-center me-2">
                  {/* One icon on desktop, three named choices in the phone
                  menu (DOS/Rate#1435). */}
                  <ThemeCycleButton className="d-none d-lg-inline-flex" />
                  <ThemeToggle className="d-lg-none" />
                </li>
                <li className="d-flex align-items-center me-3">
                  <LocaleSwitcher isDarkHeader={false} />
                </li>
                <li className="list-buttons d-flex align-items-center">
                  <IntentLink
                    href="/watchlist"
                    className="d-inline-flex align-items-center"
                  >
                    <BsBellFill className="fs-6 me-1" />
                    {tNav('priceWatchCta')}
                  </IntentLink>
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
