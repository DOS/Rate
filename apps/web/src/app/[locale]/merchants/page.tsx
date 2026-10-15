import type { Metadata } from 'next';
import { Link } from '@/lib/navigation';
import { getCachedMerchantsList } from '@/server/rate';
import NavbarDarkDynamic from '../components/navbar/NavbarDarkDynamic';
import FooterTop from '../components/footer-top';
import FooterDynamic from '../components/footer/FooterDynamic';
import BackToTop from '../components/back-to-top';
import CompareTrayBar from '@/components/compare/CompareTrayBar';
import { BsShieldCheck } from 'react-icons/bs';
import MerchantDirectoryExplorer, {
  type MerchantSortOption,
} from '@/components/merchants/MerchantDirectoryExplorer';
import { normalizeRateLocale } from '@/lib/rate-i18n';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const lang = normalizeRateLocale(locale);
  const canonicalUrl =
    lang === 'vi'
      ? 'https://rate.vn/merchants'
      : `https://rate.vn/${lang}/merchants`;

  return {
    title:
      lang === 'en'
        ? 'E-Commerce Merchant Trust Directory (DOSafe + AI Review Risk) | Rate.vn'
        : lang === 'cs'
          ? 'Adresář důvěryhodnosti e-shopů (DOSafe + AI Review Risk) | Rate.vn'
          : 'Hồ Sơ Tín Nhiệm Gian Hàng (DOSafe + AI Review Risk) | Rate.vn',
    description:
      lang === 'en'
        ? 'Verify Shopee, Lazada, and Tiki merchant trustworthiness with our Dual Risk Scoring Engine: DOSafe Threat Intel and AI Review Seeding detection.'
        : lang === 'cs'
          ? 'Ověřte důvěryhodnost obchodů pomocí duálního skóre rizika: DOSafe Threat Intel a AI detekce seedingu recenzí.'
          : 'Tra cứu độ tin cậy gian hàng Shopee, Lazada, Tiki với hệ thống chấm điểm rủi ro kép: dữ liệu chống lừa đảo DOSafe và AI lọc đánh giá Seeding trên Rate.vn.',
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function MerchantsDirectoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const resolvedSearch = searchParams ? await searchParams : {};
  const lang = normalizeRateLocale(locale);
  const merchants = await getCachedMerchantsList();

  const initialQuery =
    typeof resolvedSearch.q === 'string' ? resolvedSearch.q : '';
  const initialPlatform =
    typeof resolvedSearch.platform === 'string'
      ? resolvedSearch.platform
      : 'all';
  const initialOfficialOnly =
    resolvedSearch.official === '1' || resolvedSearch.official === 'true';
  const rawSort =
    typeof resolvedSearch.sort === 'string' ? resolvedSearch.sort : '';
  const initialSort: MerchantSortOption =
    rawSort === 'products_desc' ||
    rawSort === 'seeding_asc' ||
    rawSort === 'followers_desc'
      ? rawSort
      : 'trust_desc';

  const heroTitle =
    lang === 'en'
      ? 'Cross-Platform Merchant Trust Directory'
      : lang === 'cs'
        ? 'Adresář Důvěryhodnosti Obchodů Napříč Tržišti'
        : 'Hồ Sơ Tín Nhiệm Gian Hàng Đa Sàn';
  const heroSubtitle =
    lang === 'en'
      ? 'Cross-check DOSafe cybersecurity threat intelligence, AI Review Seeding ratios, and historical price integrity for every tracked seller'
      : lang === 'cs'
        ? 'Porovnejte kyberbezpečnostní skóre DOSafe, míru AI seedingu recenzí a integritu historie cen jednotlivých prodejců'
        : 'Đối chiếu điểm rủi ro lừa đảo DOSafe, tỷ lệ đánh giá Seeding/Spam xu và lịch sử niêm yết giá của từng gian hàng';

  return (
    <>
      <NavbarDarkDynamic links={[]} />

      <div
        className="image-cover hero-banner bg-primary"
        style={{ backgroundImage: `url(/img/banner-6.jpg)` }}
        data-overlay="6"
      >
        <div className="container">
          <div className="row justify-content-center align-items-center">
            <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
              <div className="position-relative mt-4 text-start">
                <div className="d-flex align-items-center mb-2 flex-wrap gap-2">
                  <span className="badge badge-xs badge-transparent rounded-pill px-3 py-1">
                    🛡️ DOSafe Threat Intel + JReviews AI
                  </span>
                  <span className="badge badge-xs listOpen rounded-pill px-3 py-1">
                    Dual Merchant Risk Score
                  </span>
                </div>
                <h1 className="text-light fw-bold mb-2">{heroTitle}</h1>
                <p className="fs-5 fw-light text-light mb-0 opacity-90">
                  {heroSubtitle}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="py-5">
        <div className="container">
          <nav aria-label="breadcrumb" className="mb-4">
            <ol className="breadcrumb small mb-0">
              <li className="breadcrumb-item">
                <Link href="/" className="text-decoration-none">
                  {lang === 'en'
                    ? 'Home'
                    : lang === 'cs'
                      ? 'Domů'
                      : 'Trang chủ'}
                </Link>
              </li>
              <li className="breadcrumb-item active" aria-current="page">
                {lang === 'en'
                  ? 'Merchants & Trust Profiles'
                  : lang === 'cs'
                    ? 'Obchody a profily důvěryhodnosti'
                    : 'Gian hàng & Hồ sơ tín nhiệm'}
              </li>
            </ol>
          </nav>

          {/* Dual Risk Score Explanation Banner */}
          <div className="card rounded-4 bg-light mb-4 border-0 p-4 shadow-sm">
            <div className="row g-3 align-items-center">
              <div className="col-lg-8">
                <h2 className="h5 fw-bold d-flex align-items-center mb-1 gap-2">
                  <BsShieldCheck className="text-primary" />
                  {lang === 'en'
                    ? 'Dual Risk Scoring Engine (DOSafe + AI Review Audit)'
                    : lang === 'cs'
                      ? 'Systém Duálního Hodnocení Rizik (Dual Risk Scoring Engine)'
                      : 'Cơ chế Chấm Điểm Rủi Ro Kép (Dual Risk Scoring Engine)'}
                </h2>
                <p className="text-muted small mb-0">
                  {lang === 'en' ? (
                    <>
                      Rate.vn separates two independent verification signals:
                      (1) <strong>DOSafe Threat Risk</strong> cross-checking
                      scam &amp; phishing intelligence from{' '}
                      <code>dosafe.threat_intel</code>, and (2){' '}
                      <strong>AI Review Risk</strong> measuring paid seeding,
                      coin-farming spam, and inflated strikethrough pricing.
                    </>
                  ) : lang === 'cs' ? (
                    <>
                      Rate.vn odděluje dva nezávislé signály: (1){' '}
                      <strong>DOSafe Threat Risk</strong> z databáze hrozeb{' '}
                      <code>dosafe.threat_intel</code> a (2){' '}
                      <strong>AI Review Risk</strong> měřící podíl falešného
                      seedingu, spamu za mince a uměle navýšených slev.
                    </>
                  ) : (
                    <>
                      Rate.vn tách bạch hoàn toàn 2 nguồn tín hiệu độc lập: (1){' '}
                      <strong>DOSafe Threat Risk</strong> đối chiếu danh sách
                      cảnh báo lừa đảo từ <code>dosafe.threat_intel</code> và
                      (2) <strong>AI Review Risk</strong> đo lường tỷ lệ đánh
                      giá ảo Seeding, bình luận rác nhận xu và hành vi nâng
                      khống giá gốc trên các sản phẩm của shop.
                    </>
                  )}
                </p>
              </div>
              <div className="col-lg-4 text-lg-end d-flex justify-content-lg-end flex-wrap gap-2">
                <Link
                  href="/inspect"
                  className="btn btn-danger rounded-pill fw-medium btn-sm px-3"
                >
                  🔬{' '}
                  {lang === 'en'
                    ? 'Inspect URL'
                    : lang === 'cs'
                      ? 'Audit URL'
                      : 'Kiểm toán Link'}
                </Link>
                <Link
                  href="/smartphones"
                  className="btn btn-outline-primary rounded-pill fw-medium btn-sm px-3"
                >
                  {lang === 'en'
                    ? 'Browse Products →'
                    : lang === 'cs'
                      ? 'Procházet produkty →'
                      : 'Tra cứu theo Sản phẩm →'}
                </Link>
              </div>
            </div>
          </div>

          <MerchantDirectoryExplorer
            initialMerchants={merchants}
            locale={locale}
            initialQuery={initialQuery}
            initialPlatform={initialPlatform}
            initialOfficialOnly={initialOfficialOnly}
            initialSort={initialSort}
          />
        </div>
      </section>

      <CompareTrayBar />
      <FooterTop />
      <FooterDynamic sections={[]} links={[]} locale={locale} />
      <BackToTop />
    </>
  );
}
