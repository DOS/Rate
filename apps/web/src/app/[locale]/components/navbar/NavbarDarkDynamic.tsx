'use client';
import { useEffect, useState } from 'react';
import { Link } from '@/lib/navigation';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import {
  BsArrowLeftRight,
  BsBellFill,
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
              <div
                className="nav-toggle"
                role="button"
                tabIndex={0}
                aria-label={tNav('menuToggleAria')}
                aria-expanded={toggle}
                onClick={() => setToggle(!toggle)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setToggle(!toggle);
                }}
              ></div>
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
              className={`nav-menus-wrapper ${toggle ? 'nav-menus-wrapper-open' : ''}`}
              style={{ transitionProperty: toggle ? 'none' : 'left' }}
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
              <span
                className="nav-menus-wrapper-close-button"
                role="button"
                tabIndex={0}
                aria-label="Close navigation"
                onClick={() => setToggle(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setToggle(false);
                }}
              >
                ✕
              </span>

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
                const navLinks =
                  validLinks.length > 0 ? validLinks : defaultLinks;
                return (
                  <ul className="nav-menu">
                    {navLinks.map((link) => (
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
