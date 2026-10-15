'use client';
import React, { useEffect, useState } from 'react';
import { Link } from '@/lib/navigation';
import Image from 'next/image';
import { useLocale } from 'next-intl';
import {
  BsArrowLeftRight,
  BsBellFill,
  BsCodeSlash,
  BsShieldCheck,
} from 'react-icons/bs';
import LocaleSwitcher from '@/components/elementary/LocaleSwitcher';
import { getRateCopy } from '@/lib/rate-i18n';

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
  const locale = useLocale();
  const copy = getRateCopy(locale);
  const [scroll, setScroll] = useState(false);
  const [toggle, setToggle] = useState(false);
  const [windowWidth, setWindowWidth] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlerScroll = () => setScroll(window.scrollY > 50);
    const handleResize = () => setWindowWidth(window.innerWidth);
    setWindowWidth(window.innerWidth);
    window.addEventListener('scroll', handlerScroll);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('scroll', handlerScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const logo = (
    <Link className="nav-brand" href="/">
      <Image
        src={logoUrl || '/img/logo.svg'}
        width={0}
        height={0}
        sizes="100vw"
        style={{ width: '166px', height: 'auto' }}
        className="logo"
        alt="Rate.vn Logo"
      />
    </Link>
  );

  return (
    <>
      <div
        className={`header header-light ${scroll ? 'header-fixed' : ''} `}
        data-sticky-element=""
      >
        <div className="container-fluid">
          <nav
            id="navigation"
            className={
              windowWidth > 991
                ? 'navigation navigation-landscape'
                : 'navigation navigation-portrait'
            }
          >
            <div className="nav-header">
              {logo}
              <div
                className="nav-toggle"
                role="button"
                tabIndex={0}
                onClick={() => setToggle(!toggle)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setToggle(!toggle);
                }}
              ></div>
              <div className="mobile_nav">
                <ul className="d-flex align-items-center gap-2">
                  <li className="me-1">
                    <LocaleSwitcher isDarkHeader={false} compact={true} />
                  </li>
                  <li>
                    <Link
                      href="/inspect"
                      className="d-flex align-items-center text-danger"
                      aria-label={copy.nav.inspect}
                    >
                      <BsShieldCheck className="me-1" />
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/compare"
                      className="d-flex align-items-center text-dark"
                      aria-label={copy.nav.compare}
                    >
                      <BsArrowLeftRight className="me-1" />
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/watchlist"
                      className="d-flex align-items-center text-primary"
                      aria-label={copy.nav.watchlist}
                    >
                      <BsBellFill className="me-1" />
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/developers"
                      className="d-flex align-items-center text-dark"
                      aria-label={copy.nav.developers}
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
                <Image
                  src={logoUrl || '/img/logo.svg'}
                  width={0}
                  height={0}
                  sizes="100vw"
                  style={{ width: '140px', height: 'auto' }}
                  className="img-fluid lightLogo"
                  alt="Rate.vn Logo"
                />
              </div>
              <span
                className="nav-menus-wrapper-close-button"
                role="button"
                tabIndex={0}
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
                    label: copy.nav.home,
                    href: '/',
                  },
                  {
                    id: 'smartphones',
                    label: copy.nav.smartphones,
                    href: '/smartphones',
                  },
                  {
                    id: 'laptops',
                    label: copy.nav.laptops,
                    href: '/laptops',
                  },
                  {
                    id: 'tablets',
                    label: copy.nav.tablets,
                    href: '/tablets',
                  },
                  {
                    id: 'smartwatches',
                    label: copy.nav.smartwatches,
                    href: '/smartwatches',
                  },
                  {
                    id: 'earbuds',
                    label: copy.nav.earbuds,
                    href: '/earbuds',
                  },
                  {
                    id: 'merchants',
                    label: copy.nav.merchants,
                    href: '/merchants',
                  },
                  {
                    id: 'inspect',
                    label: copy.nav.inspect,
                    href: '/inspect',
                  },
                  {
                    id: 'compare',
                    label: copy.nav.compare,
                    href: '/compare',
                  },
                  {
                    id: 'watchlist',
                    label: copy.nav.watchlist,
                    href: '/watchlist',
                  },
                  {
                    id: 'developers',
                    label: copy.nav.developers,
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
                    {copy.nav.priceWatchCta}
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
