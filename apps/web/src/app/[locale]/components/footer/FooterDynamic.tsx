import { Link } from '@/lib/navigation';
import Image from 'next/image';
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
import { getRateCopy } from '@/lib/rate-i18n';
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

export default function FooterDynamic({
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
  const copyDict = getRateCopy(locale);
  const yearText = new Date().getFullYear().toString();
  const copy = (copyRight || copyDict.footer.copyRight).replace(
    '{YEAR}',
    yearText
  );

  const fallback1: FooterSection = {
    title: copyDict.footer.col1Title,
    links: [
      { label: copyDict.footer.links.smartphones, href: '/smartphones' },
      { label: copyDict.footer.links.laptops, href: '/laptops' },
      { label: copyDict.footer.links.tablets, href: '/tablets' },
      {
        label: copyDict.footer.links.smartwatches,
        href: '/smartwatches',
      },
      {
        label: copyDict.footer.links.earbuds,
        href: '/earbuds',
      },
    ],
  };

  const fallback2: FooterSection = {
    title: copyDict.footer.col2Title,
    links: [
      { label: copyDict.footer.links.leaderboard, href: '/leaderboard' },
      { label: copyDict.footer.links.inspect, href: '/inspect' },
      { label: copyDict.footer.links.compare, href: '/compare' },
      { label: copyDict.footer.links.merchants, href: '/merchants' },
      { label: copyDict.footer.links.watchlist, href: '/watchlist' },
      { label: copyDict.footer.links.developers, href: '/developers' },
      {
        label: copyDict.footer.links.apiProducts,
        href: '/api/v1/rate/products',
        newTab: true,
      },
    ],
  };

  const fallback3: FooterSection = {
    title: copyDict.footer.col3Title,
    links: [
      { label: copyDict.footer.links.about, href: '/about-us' },
      { label: copyDict.footer.links.faq, href: '/faq' },
      { label: copyDict.footer.links.privacy, href: '/privacy-policy' },
      { label: copyDict.footer.links.contact, href: '/contact-us' },
      {
        label: copyDict.footer.links.github,
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

  const getSocialIcon = (urlOrLabel?: string | null) => {
    const v = (urlOrLabel || '').toLowerCase();
    if (v.includes('facebook') || v.includes('fb.com')) return <FaFacebookF />;
    if (v.includes('x.com') || v.includes('twitter')) return <FaXTwitter />;
    if (v.includes('instagram')) return <FaInstagram />;
    if (v.includes('linkedin')) return <FaLinkedin />;
    if (v.includes('youtube')) return <FaYoutube />;
    if (v.includes('tiktok')) return <FaTiktok />;
    if (v.includes('github')) return <FaGithub />;
    if (v.includes('telegram')) return <FaTelegram />;
    if (v.includes('discord')) return <FaDiscord />;
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
              <h4 className="widget-title">{copyDict.footer.trustTitle}</h4>
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
                    <p className="subs">{copyDict.footer.antiSeedingSub}</p>
                  </div>
                </div>
                <div className="singleinfo">
                  <div className="icons">
                    <BsCodeSlash />
                  </div>
                  <div className="caps">
                    <h5 className="title">Open-Core REST v1</h5>
                    <p className="subs">{copyDict.footer.specGroupsSub}</p>
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
