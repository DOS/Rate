import { Link } from '@/lib/navigation';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { FaFacebookF, FaInstagram } from 'react-icons/fa';
import {
  FaLinkedin,
  FaYoutube,
  FaTiktok,
  FaGithub,
  FaDiscord,
  FaXTwitter,
  FaTelegram,
} from 'react-icons/fa6';
import { BsShieldCheck, BsCodeSlash } from 'react-icons/bs';
import RateWordmark from '@/components/brand/RateWordmark';

export interface FooterSectionLink {
  id?: string | number;
  label?: string | null;
  href?: string | null;
  newTab?: boolean | null;
}
export interface FooterSection {
  id?: string | number;
  title?: string | null;
  links?: readonly FooterSectionLink[];
}

export default async function FooterDynamic({
  sections,
  links: _links,
  logoUrl,
  copyRight,
  socialLinks,
  locale = 'vi',
}: {
  readonly sections: readonly FooterSection[];
  readonly links: readonly FooterSectionLink[];
  readonly logoUrl?: string | null;
  readonly copyRight?: string | null;
  readonly socialLinks?: readonly FooterSectionLink[] | null;
  readonly locale?: string;
}) {
  const tFooter = await getTranslations({ locale, namespace: 'rate.footer' });
  const yearText = new Date().getFullYear().toString();
  const copy = (copyRight || tFooter('copyRight', { YEAR: yearText })).replace(
    '{YEAR}',
    yearText
  );

  const fallback1: FooterSection = {
    title: tFooter('col1Title'),
    links: [
      { label: tFooter('links.smartphones'), href: '/smartphones' },
      { label: tFooter('links.laptops'), href: '/laptops' },
      { label: tFooter('links.tablets'), href: '/tablets' },
      {
        label: tFooter('links.smartwatches'),
        href: '/smartwatches',
      },
      {
        label: tFooter('links.earbuds'),
        href: '/earbuds',
      },
    ],
  };

  const fallback2: FooterSection = {
    title: tFooter('col2Title'),
    links: [
      { label: tFooter('links.leaderboard'), href: '/leaderboard' },
      { label: tFooter('links.inspect'), href: '/inspect' },
      { label: tFooter('links.compare'), href: '/compare' },
      { label: tFooter('links.merchants'), href: '/merchants' },
      { label: tFooter('links.watchlist'), href: '/watchlist' },
      { label: tFooter('links.developers'), href: '/developers' },
      {
        label: tFooter('links.apiProducts'),
        href: '/api/v1/rate/products',
        newTab: true,
      },
    ],
  };

  const fallback3: FooterSection = {
    title: tFooter('col3Title'),
    links: [
      { label: tFooter('links.about'), href: '/about-us' },
      { label: tFooter('links.faq'), href: '/faq' },
      { label: tFooter('links.privacy'), href: '/privacy-policy' },
      { label: tFooter('links.contact'), href: '/contact-us' },
      {
        label: tFooter('links.github'),
        href: 'https://github.com/DOS/Rate',
        newTab: true,
      },
    ],
  };

  const [col1, col2, col3] = [
    sections?.[0] ?? fallback1,
    sections?.[1] ?? fallback2,
    sections?.[2] ?? fallback3,
  ];

  // A URL is matched on its hostname (so "fox.com/x.com" is not X); a plain
  // label such as "Facebook" by name.
  const getSocialIcon = (urlOrLabel?: string | null) => {
    const v = (urlOrLabel || '').trim().toLowerCase();
    let host: string | null = null;
    // Scheme-less hrefs ("x.com/rate", "//t.me/rate") are URLs too.
    const candidates = [v];
    if (v.startsWith('//')) candidates.push(`https:${v}`);
    else if (v.includes('.') && !/\s/.test(v)) candidates.push(`https://${v}`);
    for (const candidate of candidates) {
      try {
        host = new URL(candidate).hostname.replace(/^www\./, '') || null;
        if (host) break;
      } catch {
        // Not a URL: try the next form, then match the label by name below.
      }
    }
    const is = (name: string, ...domains: string[]) =>
      host
        ? domains.some((d) => host === d || host!.endsWith(`.${d}`))
        : v.includes(name);
    if (is('facebook', 'facebook.com', 'fb.com')) return <FaFacebookF />;
    if (is('twitter', 'x.com', 'twitter.com')) return <FaXTwitter />;
    if (is('instagram', 'instagram.com')) return <FaInstagram />;
    if (is('linkedin', 'linkedin.com')) return <FaLinkedin />;
    if (is('youtube', 'youtube.com', 'youtu.be')) return <FaYoutube />;
    if (is('tiktok', 'tiktok.com')) return <FaTiktok />;
    if (is('github', 'github.com')) return <FaGithub />;
    if (is('telegram', 't.me', 'telegram.org', 'telegram.me'))
      return <FaTelegram />;
    if (is('discord', 'discord.com', 'discord.gg')) return <FaDiscord />;
    return null;
  };

  return (
    <footer className="footer skin-dark-footer">
      <div className="container-fluid">
        <div className="row">
          {/* Logo + Copy + Social */}
          <div className="col-md-5 col-lg-12 col-xl-4 col-12">
            <div className="footer-widget pe-xl-4 mb-5">
              <div className="footerLogo">
                {logoUrl ? (
                  <Image
                    src={logoUrl}
                    width={0}
                    height={0}
                    sizes="100vw"
                    style={{ width: '160px', height: 'auto' }}
                    className="img-fluid"
                    alt="Rate.vn Logo"
                  />
                ) : (
                  <RateWordmark tone="light" size={30} />
                )}
              </div>
              <div className="footerText">
                <p>{copy}</p>
              </div>
              <div className="footerSocialwrap">
                <ul className="footersocial">
                  {socialLinks && socialLinks.length > 0 ? (
                    socialLinks
                      .filter((s) => s?.href && s?.label)
                      .map((s, i) => (
                        <li key={String(s.id) + i}>
                          <a
                            href={s.href!}
                            target={s.newTab ? '_blank' : undefined}
                            rel="noopener noreferrer"
                            className="social-link"
                          >
                            {getSocialIcon(s.href) ||
                              getSocialIcon(s.label) ||
                              s.label}
                          </a>
                        </li>
                      ))
                  ) : (
                    <>
                      <li>
                        <a
                          href="https://github.com/DOS/Rate"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="social-link"
                          aria-label="GitHub DOS/Rate"
                        >
                          <FaGithub />
                        </a>
                      </li>
                      <li>
                        <Link
                          href="/developers"
                          className="social-link"
                          aria-label="REST API v1"
                        >
                          <BsCodeSlash />
                        </Link>
                      </li>
                      <li>
                        <Link
                          href="/merchants"
                          className="social-link"
                          aria-label="Merchants"
                        >
                          <FaLinkedin />
                        </Link>
                      </li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          </div>

          {/* Column 1 */}
          <div className="col-md-4 offset-md-3 col-lg-3 offset-lg-0 col-xl-2 col-6">
            <div className="footer-widget mb-md-5 mb-lg-0 mb-5">
              {col1?.title ? (
                <h4 className="widget-title text-pri">{col1.title}</h4>
              ) : null}
              <ul className="footer-menu">
                {(col1?.links || [])
                  .filter((l) => l?.href && l?.label)
                  .map((item, index) => (
                    <li key={String(item.id ?? index)}>
                      {item.href!.startsWith('http') ||
                      item.href!.startsWith('/api/') ? (
                        <a
                          href={item.href!}
                          target={item.newTab ? '_blank' : undefined}
                          rel="noopener noreferrer"
                        >
                          {item.label}
                        </a>
                      ) : (
                        <Link href={item.href!}>{item.label}</Link>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          </div>

          {/* Column 2 */}
          <div className="col-md-4 col-lg-3 col-xl-2 col-6">
            <div className="footer-widget mb-md-5 mb-lg-0 mb-5">
              {col2?.title ? (
                <h4 className="widget-title">{col2.title}</h4>
              ) : null}
              <ul className="footer-menu">
                {(col2?.links || [])
                  .filter((l) => l?.href && l?.label)
                  .map((item, index) => (
                    <li key={String(item.id ?? index)}>
                      {item.href!.startsWith('http') ||
                      item.href!.startsWith('/api/') ? (
                        <a
                          href={item.href!}
                          target={item.newTab ? '_blank' : undefined}
                          rel="noopener noreferrer"
                        >
                          {item.label}
                        </a>
                      ) : (
                        <Link href={item.href!}>{item.label}</Link>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          </div>

          {/* Column 3 */}
          <div className="col-md-4 col-lg-3 col-xl-2 col-6">
            <div className="footer-widget">
              {col3?.title ? (
                <h4 className="widget-title">{col3.title}</h4>
              ) : null}
              <ul className="footer-menu">
                {(col3?.links || [])
                  .filter((l) => l?.href && l?.label)
                  .map((item, index) => (
                    <li key={String(item.id ?? index)}>
                      {item.href!.startsWith('http') ||
                      item.href!.startsWith('/api/') ? (
                        <a
                          href={item.href!}
                          target={item.newTab ? '_blank' : undefined}
                          rel="noopener noreferrer"
                        >
                          {item.label}
                        </a>
                      ) : (
                        <Link href={item.href!}>{item.label}</Link>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          </div>

          {/* Open-Core Architecture & Security Status */}
          <div className="col-md-4 col-lg-3 col-xl-2 col-6">
            <div className="footer-widget">
              <h4 className="widget-title">{tFooter('trustTitle')}</h4>
              <div className="contactInfowrap">
                <div className="singleinfo">
                  <div className="icons">
                    <BsShieldCheck />
                  </div>
                  <div className="caps">
                    <h5 className="title">
                      DOSafe &amp; AI Review
                      <br />
                      Dual Risk Score
                    </h5>
                    <p className="subs">{tFooter('antiSeedingSub')}</p>
                  </div>
                </div>
                <div className="singleinfo">
                  <div className="icons">
                    <BsCodeSlash />
                  </div>
                  <div className="caps">
                    <h5 className="title">Open-Core REST v1</h5>
                    <p className="subs">{tFooter('specGroupsSub')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
