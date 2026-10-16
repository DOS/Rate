export type SupportedRateLocale = 'vi' | 'en' | 'cs';
export type RateLocale = SupportedRateLocale;

export function normalizeRateLocale(
  locale?: string | null
): SupportedRateLocale {
  if (locale === 'en' || locale === 'cs') {
    return locale;
  }
  return 'vi';
}

export interface RateLocaleCopy {
  locale: SupportedRateLocale;
  seo: {
    siteTitle: string;
    siteDescription: string;
  };
  nav: {
    home: string;
    smartphones: string;
    laptops: string;
    tablets: string;
    smartwatches: string;
    earbuds: string;
    leaderboard: string;
    merchants: string;
    inspect: string;
    compare: string;
    watchlist: string;
    developers: string;
    priceWatchCta: string;
  };
  footer: {
    copyRight: string;
    col1Title: string;
    col2Title: string;
    col3Title: string;
    trustTitle: string;
    antiSeedingSub: string;
    specGroupsSub: string;
    links: {
      smartphones: string;
      laptops: string;
      tablets: string;
      smartwatches: string;
      earbuds: string;
      leaderboard: string;
      inspect: string;
      compare: string;
      merchants: string;
      watchlist: string;
      developers: string;
      apiProducts: string;
      about: string;
      faq: string;
      privacy: string;
      contact: string;
      github: string;
    };
    bannerTitle: string;
    bannerDesc: string;
    bannerCta: string;
    bannerCompareCta: string;
  };
  home: {
    heroBadge: string;
    heroTitlePrefix: string;
    heroTitleHighlight: string;
    heroTitleSuffix: string;
    heroSubtitle: string;
    statProducts: string;
    statPricePoints: string;
    statReviews: string;
    statMerchants: string;
    catBadge: string;
    catTitlePrefix: string;
    catTitleHighlight: string;
    catSubtitle: string;
    catReadySuffix: string;
    catExpanding: string;
    featuredBadge: string;
    featuredTitlePrefix: string;
    featuredTitleHighlight: string;
    featuredSubtitle: string;
    viewAllCatalog: string;
    compareSpecsBtn: string;
    viewSpecAndPriceBtn: string;
    merchantBadge: string;
    merchantTitlePrefix: string;
    merchantTitleHighlight: string;
    merchantSubtitle: string;
    viewAllMerchants: string;
    viewMerchantAuditBtn: string;
    reviewsBadge: string;
    reviewsTitlePrefix: string;
    reviewsTitleHighlight: string;
    reviewsSubtitle: string;
    whyBadge: string;
    whyTitlePrefix: string;
    whyTitleHighlight: string;
    whySubtitle: string;
  };
}

const RATE_COPY_DICTIONARY: Record<SupportedRateLocale, RateLocaleCopy> = {
  vi: {
    locale: 'vi',
    seo: {
      siteTitle:
        'Rate.vn - Nền tảng Đối chiếu Thông số 10 Nhóm, Lịch sử Giá thật & Kiểm toán Đánh giá AI',
      siteDescription:
        'Tra cứu thông số kỹ thuật chuẩn GSMArena & PhoneArena, phát hiện nâng khống giá gốc và lọc bình luận Seeding bằng AI trên Shopee, Lazada, Tiki tại Rate.vn.',
    },
    nav: {
      home: 'Trang chủ',
      smartphones: 'Điện thoại',
      laptops: 'Laptop',
      tablets: 'Máy tính bảng',
      smartwatches: 'Đồng hồ',
      earbuds: 'Tai nghe',
      leaderboard: 'Xếp hạng',
      merchants: 'Gian hàng',
      inspect: 'Kiểm toán Link',
      compare: 'So sánh',
      watchlist: 'Canh giá',
      developers: 'API',
      priceWatchCta: 'Canh giá thật',
    },
    footer: {
      copyRight:
        '© {YEAR} Rate.vn (DOS Ecosystem). Nền tảng Đối chiếu Thông số 10 Nhóm, Lịch sử Giá thật & Kiểm toán Đánh giá Đa sàn.',
      col1Title: 'Danh mục Công nghệ',
      col2Title: 'Công cụ Bảo vệ Người mua',
      col3Title: 'Nền tảng & Minh bạch',
      trustTitle: 'Chuẩn Minh Bạch',
      antiSeedingSub: 'Chống Seeding & Giá Ảo',
      specGroupsSub: '10 Nhóm Thông Số Chuẩn Hóa',
      links: {
        smartphones: 'Điện thoại thông minh',
        laptops: 'Laptop & Ultrabook',
        tablets: 'Máy tính bảng (Tablet)',
        smartwatches: 'Đồng hồ thông minh',
        earbuds: 'Tai nghe chống ồn ANC',
        leaderboard: 'Bảng xếp hạng Điểm Kép (/leaderboard)',
        inspect: 'Kiểm toán sâu Link TMĐT (/inspect)',
        compare: 'So sánh 10 nhóm thông số',
        merchants: 'Hồ sơ Tín nhiệm Gian hàng',
        watchlist: 'Danh sách Canh giá thật',
        developers: 'Tài liệu Open-Core API v1',
        apiProducts: 'JSON Endpoint (/api/v1/rate/products)',
        about: 'Về kiến trúc Rate.vn',
        faq: 'Câu hỏi thường gặp (FAQ)',
        privacy: 'Chính sách bảo mật & Dữ liệu',
        contact: 'Liên hệ & Báo cáo gian hàng',
        github: 'Mã nguồn mở DOS/Rate',
      },
      bannerTitle: 'Tra cứu Giá Thật & Kiểm Toán Seeding Trước Khi Đặt Mua',
      bannerDesc:
        'Dán link sản phẩm Shopee, Lazada, Tiki hoặc đặt mức giá mục tiêu để không bao giờ mua nhầm khuyến mãi ảo.',
      bannerCta: 'Mở Danh Sách Canh Giá',
      bannerCompareCta: 'Bàn Cân 10 Nhóm Thông Số',
    },
    home: {
      heroBadge:
        'Nền Tảng Đối Chiếu Thông Số, Lịch Sử Giá Thật & Kiểm Toán Đánh Giá Đa Sàn',
      heroTitlePrefix: 'Tra Cứu',
      heroTitleHighlight: 'Giá Thật & Điểm Tín Nhiệm',
      heroTitleSuffix: 'Trước Khi Mua',
      heroSubtitle:
        'Chuẩn hóa 10 nhóm thông số GSMArena & PhoneArena, phát hiện nâng khống giá gốc và lọc bình luận Seeding bằng AI.',
      statProducts: 'Sản phẩm chuẩn hóa 10 nhóm',
      statPricePoints: 'Điểm đối chiếu lịch sử giá',
      statReviews: 'Đánh giá đã kiểm duyệt AI',
      statMerchants: 'Gian hàng chấm điểm rủi ro kép',
      catBadge: '🗂️ Danh Mục Thiết Bị Công Nghệ Đa Sàn',
      catTitlePrefix: 'Khám Phá Theo',
      catTitleHighlight: 'Ngành Hàng Chuẩn Hóa',
      catSubtitle:
        'Mọi danh mục đều hỗ trợ bộ lọc chuyên sâu theo 10 nhóm thông số kỹ thuật và đối chiếu giá theo thời gian thực',
      catReadySuffix: 'mẫu sẵn sàng',
      catExpanding: 'Đang mở rộng',
      featuredBadge: '⚡ Chuẩn Hóa 10 Nhóm Thông Số GSMArena & PhoneArena',
      featuredTitlePrefix: 'Sản Phẩm',
      featuredTitleHighlight: 'Đã Kiểm Chứng Thông Số & Lịch Sử Giá',
      featuredSubtitle:
        'Dữ liệu chuẩn hóa từ hệ thống rate.master_products trên Supabase Cloud, kèm kiểm toán giá thật và đánh giá JReviews',
      viewAllCatalog: 'Xem toàn bộ danh mục',
      compareSpecsBtn: '⚖️ So sánh thông số',
      viewSpecAndPriceBtn: 'Xem 10 nhóm thông số & lịch sử giá →',
      merchantBadge: '🛡️ Hệ Thống Chấm Điểm Tín Nhiệm Kép (Dual Risk Score)',
      merchantTitlePrefix: 'Hồ Sơ Tín Nhiệm',
      merchantTitleHighlight: 'Gian Hàng TMĐT',
      merchantSubtitle:
        'Tách bạch rõ ràng điểm rủi ro an ninh mạng (DOSafe Threat Intel) và điểm rủi ro gian lận đánh giá (AI Review Seeding Risk)',
      viewAllMerchants: 'Tra cứu tất cả gian hàng',
      viewMerchantAuditBtn: 'Xem hồ sơ kiểm toán chi tiết →',
      reviewsBadge: '🤖 Kiểm Duyệt Bởi AI Review Analyzer (5 Tầng Phân Loại)',
      reviewsTitlePrefix: 'Đánh Giá Thực Tế',
      reviewsTitleHighlight: 'Đã Qua Sàng Lọc Seeding',
      reviewsSubtitle:
        'Mỗi đánh giá từ sàn TMĐT đều được AI chấm điểm độ tin cậy, tự động tách biệt bình luận rác cày xu (low_value_coin_spam) và bình luận ảo (seeding_fake)',
      whyBadge: '🔬 Kiến Trúc Minh Bạch Open-Core 2026',
      whyTitlePrefix: 'Vì Sao Người Mua Tin Dùng',
      whyTitleHighlight: 'Rate.vn',
      whySubtitle:
        'Ba lớp bảo vệ độc lập giúp bạn không bao giờ mua nhầm hàng nâng giá ảo hoặc tin nhầm bình luận Seeding',
    },
  },
  en: {
    locale: 'en',
    seo: {
      siteTitle:
        'Rate.vn - 10-Group Spec Intelligence, True Price History & AI Review Auditing',
      siteDescription:
        'Compare standardized 10-group technical specifications, detect inflated fake discounts, and filter AI seeding reviews across Shopee, Lazada, and Tiki on Rate.vn.',
    },
    nav: {
      home: 'Home',
      smartphones: 'Smartphones',
      laptops: 'Laptops',
      tablets: 'Tablets',
      smartwatches: 'Watches',
      earbuds: 'Earbuds',
      leaderboard: 'Leaderboard',
      merchants: 'Merchants',
      inspect: 'Inspect URL',
      compare: 'Compare',
      watchlist: 'Watchlist',
      developers: 'API',
      priceWatchCta: 'Price Watch',
    },
    footer: {
      copyRight:
        '© {YEAR} Rate.vn (DOS Ecosystem). Open-Core Product Spec Intelligence, True Price History & AI Review Auditing.',
      col1Title: 'Tech Categories',
      col2Title: 'Buyer Protection Tools',
      col3Title: 'Platform & Transparency',
      trustTitle: 'Open-Core Trust',
      antiSeedingSub: 'Anti-Seeding & Fake Sale',
      specGroupsSub: '10 Standardized Spec Groups',
      links: {
        smartphones: 'Smartphones',
        laptops: 'Laptops & Ultrabooks',
        tablets: 'Tablets',
        smartwatches: 'Smartwatches',
        earbuds: 'ANC Wireless Earbuds',
        leaderboard: 'Dual-Rating Leaderboard (/leaderboard)',
        inspect: 'Deep Link Inspector (/inspect)',
        compare: '10-Group Spec Comparison',
        merchants: 'Merchant Trust Directory',
        watchlist: 'Price Drop Watchlist',
        developers: 'Open-Core REST API v1 Docs',
        apiProducts: 'JSON Endpoint (/api/v1/rate/products)',
        about: 'About Rate.vn Architecture',
        faq: 'Frequently Asked Questions',
        privacy: 'Privacy & Data Governance',
        contact: 'Contact & Report Merchant',
        github: 'Open-Core GitHub (DOS/Rate)',
      },
      bannerTitle:
        'Verify True Historical Price & AI Review Trust Before Buying',
      bannerDesc:
        'Paste any Shopee, Lazada, or Tiki listing link or set a target price alert to avoid inflated fake sales.',
      bannerCta: 'Open Price Watchlist',
      bannerCompareCta: 'Compare 10 Spec Groups',
    },
    home: {
      heroBadge:
        'Cross-Platform Spec Intelligence, True Price History & AI Review Auditing',
      heroTitlePrefix: 'Verify',
      heroTitleHighlight: 'True Price & Shop Trust',
      heroTitleSuffix: 'Before Buying',
      heroSubtitle:
        'Standardized 10-group technical specs (GSMArena + PhoneArena), fake discount detection, and AI review seeding protection.',
      statProducts: '10-Group Standardized Products',
      statPricePoints: 'Historical Price Observations',
      statReviews: 'AI-Audited Buyer Reviews',
      statMerchants: 'Dual-Risk Audited Merchants',
      catBadge: '🗂️ Multi-Platform Tech Device Directory',
      catTitlePrefix: 'Explore By',
      catTitleHighlight: 'Standardized Category',
      catSubtitle:
        'Every category supports deep 10-group technical specification filtering and real-time cross-merchant price verification',
      catReadySuffix: 'models tracked',
      catExpanding: 'Expanding',
      featuredBadge: '⚡ 10-Group Standardized Specs (GSMArena & PhoneArena)',
      featuredTitlePrefix: 'Products With',
      featuredTitleHighlight: 'Verified Specs & True Price History',
      featuredSubtitle:
        'Canonical catalog records from rate.master_products on Supabase Cloud with fake-discount auditing and JReviews weights',
      viewAllCatalog: 'View full catalog',
      compareSpecsBtn: '⚖️ Compare specs',
      viewSpecAndPriceBtn: 'View 10 spec groups & price history →',
      merchantBadge: '🛡️ Dual Risk Scoring Engine (DOSafe + AI Review Risk)',
      merchantTitlePrefix: 'E-Commerce Merchant',
      merchantTitleHighlight: 'Trust Profiles',
      merchantSubtitle:
        'Separates cybersecurity threat intelligence (DOSafe Threat Intel) from review manipulation metrics (AI Review Seeding Risk)',
      viewAllMerchants: 'Browse all merchants',
      viewMerchantAuditBtn: 'View detailed audit profile →',
      reviewsBadge: '🤖 Audited By AI Review Analyzer (5-Category Taxonomy)',
      reviewsTitlePrefix: 'Verified Buyer Reviews',
      reviewsTitleHighlight: 'Filtered for Seeding & Spam',
      reviewsSubtitle:
        'Every marketplace review is scored for authenticity, isolating coin-farming spam (low_value_coin_spam) and paid seeding (seeding_fake)',
      whyBadge: '🔬 Open-Core Transparency Architecture 2026',
      whyTitlePrefix: 'Why Shoppers Trust',
      whyTitleHighlight: 'Rate.vn',
      whySubtitle:
        'Three independent verification layers protect you from inflated strikethrough prices and manipulated marketplace ratings',
    },
  },
  cs: {
    locale: 'cs',
    seo: {
      siteTitle:
        'Rate.vn - Srovnání 10 skupin parametrů, historie skutečných cen a AI audit recenzí',
      siteDescription:
        'Ověřte si technické specifikace podle standardu GSMArena a PhoneArena, odhalte falešné slevy a filtrujte AI seeding recenze na Rate.vn.',
    },
    nav: {
      home: 'Domů',
      smartphones: 'Telefony',
      laptops: 'Notebooky',
      tablets: 'Tablety',
      smartwatches: 'Hodinky',
      earbuds: 'Sluchátka',
      leaderboard: 'Žebříček',
      merchants: 'Obchody',
      inspect: 'Audit URL',
      compare: 'Porovnat',
      watchlist: 'Hlídání cen',
      developers: 'API',
      priceWatchCta: 'Hlídání cen',
    },
    footer: {
      copyRight:
        '© {YEAR} Rate.vn (DOS Ecosystem). Open-Core platforma pro analýzu specifikací, historii skutečných cen a AI audit recenzí.',
      col1Title: 'Kategorie technologií',
      col2Title: 'Nástroje ochrany kupujících',
      col3Title: 'Platforma a transparentnost',
      trustTitle: 'Open-Core Důvěra',
      antiSeedingSub: 'Proti seedingu a falešným slevám',
      specGroupsSub: '10 standardizovaných skupin parametrů',
      links: {
        smartphones: 'Chytré telefony',
        laptops: 'Notebooky a ultrabooky',
        tablets: 'Tablety',
        smartwatches: 'Chytré hodinky',
        earbuds: 'Bezdrátová sluchátka ANC',
        leaderboard: 'Žebříček hodnocení (/leaderboard)',
        inspect: 'Hloubkový audit odkazu (/inspect)',
        compare: 'Porovnání 10 skupin parametrů',
        merchants: 'Adresář důvěryhodnosti obchodů',
        watchlist: 'Seznam hlídaných cen',
        developers: 'Dokumentace Open-Core REST API v1',
        apiProducts: 'JSON Endpoint (/api/v1/rate/products)',
        about: 'O architektuře Rate.vn',
        faq: 'Často kladené otázky (FAQ)',
        privacy: 'Ochrana soukromí a dat',
        contact: 'Kontakt a nahlášení obchodu',
        github: 'Open-Core GitHub (DOS/Rate)',
      },
      bannerTitle: 'Ověřte skutečnou historii cen a důvěryhodnost před nákupem',
      bannerDesc:
        'Vložte odkaz na produkt nebo si nastavte cílovou cenu a vyhněte se uměle navýšeným slevám.',
      bannerCta: 'Otevřít hlídání cen',
      bannerCompareCta: 'Porovnat 10 skupin parametrů',
    },
    home: {
      heroBadge:
        'Analýza parametrů napříč tržišti, historie skutečných cen a AI audit recenzí',
      heroTitlePrefix: 'Ověřte',
      heroTitleHighlight: 'Skutečnou Cenu a Důvěru',
      heroTitleSuffix: 'Před Nákupem',
      heroSubtitle:
        'Standardizovaných 10 skupin technických parametrů, detekce falešných slev a ochrana proti AI seedingu recenzí.',
      statProducts: 'Standardizovaných produktů',
      statPricePoints: 'Bodů historie cen',
      statReviews: 'AI ověřených recenzí',
      statMerchants: 'Obchodů s duálním skóre rizika',
      catBadge: '🗂️ Katalog technologických zařízení',
      catTitlePrefix: 'Prozkoumat podle',
      catTitleHighlight: 'Standardizované Kategorie',
      catSubtitle:
        'Každá kategorie podporuje hloubkové filtrování podle 10 skupin parametrů a ověření cen v reálném čase',
      catReadySuffix: 'modelů',
      catExpanding: 'Rozšiřujeme',
      featuredBadge: '⚡ 10 skupin parametrů (GSMArena & PhoneArena)',
      featuredTitlePrefix: 'Produkty s',
      featuredTitleHighlight: 'Ověřenými Parametry a Historií Cen',
      featuredSubtitle:
        'Kanonická data z rate.master_products na Supabase Cloud s auditem slev a váženým hodnocením JReviews',
      viewAllCatalog: 'Zobrazit celý katalog',
      compareSpecsBtn: '⚖️ Porovnat parametry',
      viewSpecAndPriceBtn: 'Zobrazit 10 skupin parametrů a historii cen →',
      merchantBadge: '🛡️ Duální skóre rizika (DOSafe + AI Review Risk)',
      merchantTitlePrefix: 'Profily důvěryhodnosti',
      merchantTitleHighlight: 'E-shopů a Tržišť',
      merchantSubtitle:
        'Odděluje kyberbezpečnostní rizika (DOSafe Threat Intel) od manipulace s recenzemi (AI Review Seeding Risk)',
      viewAllMerchants: 'Zobrazit všechny obchody',
      viewMerchantAuditBtn: 'Zobrazit detailní audit obchodu →',
      reviewsBadge: '🤖 Ověřeno pomocí AI Review Analyzer (5 kategorií)',
      reviewsTitlePrefix: 'Skutečné recenze kupujících',
      reviewsTitleHighlight: 'Očištěné od Seedingu a Spamu',
      reviewsSubtitle:
        'Každá recenze je hodnocena umělou inteligencí, která odfiltruje spam za mince (low_value_coin_spam) a falešný seeding (seeding_fake)',
      whyBadge: '🔬 Transparentní Open-Core Architektura 2026',
      whyTitlePrefix: 'Proč kupující věří',
      whyTitleHighlight: 'Rate.vn',
      whySubtitle:
        'Tři nezávislé vrstvy ochrany vás chrání před falešnými slevami a zmanipulovaným hodnocením',
    },
  },
};

export function getRateCopy(locale?: string | null): RateLocaleCopy {
  const normalized = normalizeRateLocale(locale);
  return RATE_COPY_DICTIONARY[normalized];
}
