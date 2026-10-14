import React from 'react';
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
  const isVi = locale === 'vi';
  const yearText = new Date().getFullYear().toString();
  const copy = (
    copyRight ||
    (isVi
      ? `© {YEAR} Rate.vn (DOS Ecosystem). Nền tảng Đối chiếu Thông số 10 Nhóm, Lịch sử Giá thật & Kiểm toán Đánh giá Đa sàn.`
      : `© {YEAR} Rate.vn (DOS Ecosystem). Open-Core Product Spec Intelligence, True Price History & AI Review Auditing.`)
  ).replace('{YEAR}', yearText);

  const fallback1: FooterSection = isVi
    ? {
        title: 'Danh mục Công nghệ',
        links: [
          { label: 'Điện thoại thông minh', href: '/smartphones' },
          { label: 'Laptop & Ultrabook', href: '/laptops' },
          { label: 'Máy tính bảng (Tablet)', href: '/tablets' },
          { label: 'Đồng hồ thông minh', href: '/smartphones?category=smartwatches' },
          { label: 'Tai nghe chống ồn ANC', href: '/smartphones?category=earbuds' },
        ],
      }
    : {
        title: 'Tech Categories',
        links: [
          { label: 'Smartphones', href: '/smartphones' },
          { label: 'Laptops & Ultrabooks', href: '/laptops' },
          { label: 'Tablets', href: '/tablets' },
          { label: 'Smartwatches', href: '/smartphones?category=smartwatches' },
          { label: 'Wireless Earbuds', href: '/smartphones?category=earbuds' },
        ],
      };

  const fallback2: FooterSection = isVi
    ? {
        title: 'Công cụ Bảo vệ Người mua',
        links: [
          { label: 'So sánh 10 nhóm thông số', href: '/compare' },
          { label: 'Hồ sơ Tín nhiệm Gian hàng', href: '/merchants' },
          { label: 'Danh sách Canh giá thật', href: '/watchlist' },
          { label: 'REST API v1 (Products)', href: '/api/v1/rate/products', newTab: true },
          { label: 'REST API v1 (Merchants)', href: '/api/v1/rate/merchants', newTab: true },
        ],
      }
    : {
        title: 'Buyer Protection Tools',
        links: [
          { label: '10-Group Spec Comparison', href: '/compare' },
          { label: 'Merchant Trust Directory', href: '/merchants' },
          { label: 'Price Drop Watchlist', href: '/watchlist' },
          { label: 'REST API v1 (Products)', href: '/api/v1/rate/products', newTab: true },
          { label: 'REST API v1 (Merchants)', href: '/api/v1/rate/merchants', newTab: true },
        ],
      };

  const fallback3: FooterSection = isVi
    ? {
        title: 'Nền tảng & Minh bạch',
        links: [
          { label: 'Về Rate.vn', href: '/about-us' },
          { label: 'Câu hỏi thường gặp (FAQ)', href: '/faq' },
          { label: 'Chính sách bảo mật', href: '/privacy-policy' },
          { label: 'Liên hệ & Báo cáo gian hàng', href: '/contact-us' },
          { label: 'Mã nguồn mở DOS/Rate', href: 'https://github.com/DOS/Rate', newTab: true },
        ],
      }
    : {
        title: 'Platform & Transparency',
        links: [
          { label: 'About Rate.vn', href: '/about-us' },
          { label: 'FAQ', href: '/faq' },
          { label: 'Privacy Policy', href: '/privacy-policy' },
          { label: 'Contact & Report Shop', href: '/contact-us' },
          { label: 'Open-Core GitHub (DOS/Rate)', href: 'https://github.com/DOS/Rate', newTab: true },
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
          <div className="col-12 col-md-5 col-lg-12 col-xl-4">
            <div className="footer-widget pe-xl-4 mb-5">
              <div className="footerLogo">
                <Image
                  src={logoUrl || '/img/logo-light.svg'}
                  width={0}
                  height={0}
                  sizes="100vw"
                  style={{ width: '160px', height: 'auto' }}
                  className="img-fluid"
                  alt="Rate.vn Logo"
                />
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
                        <Link href="/smartphones" className="social-link" aria-label="Smartphones">
                          <FaFacebookF />
                        </Link>
                      </li>
                      <li>
                        <Link href="/merchants" className="social-link" aria-label="Merchants">
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
          <div className="col-6 col-md-4 offset-md-3 col-lg-3 offset-lg-0 col-xl-2">
            <div className="footer-widget mb-5 mb-md-5 mb-lg-0">
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
          <div className="col-6 col-md-4 col-lg-3 col-xl-2">
            <div className="footer-widget mb-5 mb-md-5 mb-lg-0">
              {col2?.title ? <h4 className="widget-title">{col2.title}</h4> : null}
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
          <div className="col-6 col-md-4 col-lg-3 col-xl-2">
            <div className="footer-widget">
              {col3?.title ? <h4 className="widget-title">{col3.title}</h4> : null}
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
          <div className="col-6 col-md-4 col-lg-3 col-xl-2">
            <div className="footer-widget">
              <h4 className="widget-title">
                {isVi ? 'Chuẩn Minh Bạch' : 'Open-Core Trust'}
              </h4>
              <div className="contactInfowrap">
                <div className="singleinfo">
                  <div className="icons">
                    <BsShieldCheck />
                  </div>
                  <div className="caps">
                    <h5 className="title">
                      {isVi ? (
                        <>
                          DOSafe &amp; AI Review
                          <br />
                          Dual Risk Score
                        </>
                      ) : (
                        <>
                          DOSafe &amp; AI Review
                          <br />
                          Dual Risk Score
                        </>
                      )}
                    </h5>
                    <p className="subs">
                      {isVi ? 'Chống Seeding & Giá Ảo' : 'Anti-Seeding & Fake Sale'}
                    </p>
                  </div>
                </div>
                <div className="singleinfo">
                  <div className="icons">
                    <BsCodeSlash />
                  </div>
                  <div className="caps">
                    <h5 className="title">Open-Core REST v1</h5>
                    <p className="subs">
                      {isVi
                        ? '10 Nhóm Thông Số Chuẩn Hóa'
                        : '10 Standardized Spec Groups'}
                    </p>
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
