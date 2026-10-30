import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/navigation';
import PageShell from '../components/page-shell';
import ApiPlaygroundClient from '@/components/developers/ApiPlaygroundClient';
import { EMPTY_RATE_PLATFORM_STATS } from '@/lib/rate-api';
import { getCachedRatePlatformStats } from '@/server/rate';
import {
  BsCodeSquare,
  BsCpu,
  BsDatabaseCheck,
  BsGithub,
  BsLayers,
  BsShieldLock,
} from 'react-icons/bs';
import ClientMessages from '@/components/providers/ClientMessages';

// Cached after the first request, refreshed every 5 minutes or when the
// worker revalidates its cache tags (DOS/Rate#491).
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'developers' });
  return {
    title: t('seoTitle'),
    description: t('seoDesc'),
    alternates: {
      canonical: 'https://rate.vn/developers',
    },
  };
}

// Titles: developers.groupTitles.<key> (DOS/Rate#1372).
const TEN_FIELD_GROUPS = [
  {
    order: 1,
    key: 'launch',
    fields: 'announced, status, release_date, model_variants',
  },
  {
    order: 2,
    key: 'body',
    fields:
      'dimensions, weight_g, build_materials, sim_type, ip_rating, colors',
  },
  {
    order: 3,
    key: 'display',
    fields:
      'type, size_inches, resolution, refresh_rate_hz, peak_brightness_nits, protection_glass',
  },
  {
    order: 4,
    key: 'platform',
    fields: 'os, chipset, cpu_cores, gpu, antutu_score, geekbench_score',
  },
  {
    order: 5,
    key: 'memory',
    fields: 'ram_options_gb, storage_options_gb, storage_type, card_slot',
  },
  {
    order: 6,
    key: 'cameras',
    fields:
      'main_camera, second_camera (Ultrawide), third_camera (Telephoto), fourth_camera, front_camera',
  },
  {
    order: 7,
    key: 'audio',
    fields: 'loudspeaker_type, jack_3_5mm, hi_res_audio, spatial_audio',
  },
  {
    order: 8,
    key: 'connectivity',
    fields: 'wlan_wifi, bluetooth, gps_positioning, nfc, usb_type, uwb_support',
  },
  {
    order: 9,
    key: 'battery',
    fields:
      'capacity_mah, wired_charging_w, wireless_charging_w, reverse_charging, battery_life_endurance',
  },
  {
    order: 10,
    key: 'misc',
    fields: 'sensors_list, sar_eu_w_kg, energy_label, price_launch_reference',
  },
] as const;

export default async function DevelopersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [stats, t] = await Promise.all([
    // Counters are decorative here: show zeros rather than an error page.
    getCachedRatePlatformStats().catch(() => EMPTY_RATE_PLATFORM_STATS),
    getTranslations({ locale, namespace: 'developers' }),
  ]);

  const apiEndpointsSpec = [
    {
      method: 'GET',
      path: '/api/v1/rate/products',
      auth: t('authPublic'),
      cache: 's-maxage=60, stale-while-revalidate=300',
      queryParams: t('ep1Params'),
      summary: t('ep1Summary'),
    },
    {
      method: 'GET',
      path: '/api/v1/rate/products/[slug]',
      auth: t('authPublic'),
      cache: 's-maxage=60, stale-while-revalidate=300',
      queryParams: t('ep2Params'),
      summary: t('ep2Summary'),
    },
    {
      method: 'GET',
      path: '/api/v1/rate/compare',
      auth: t('authPublic'),
      cache: 's-maxage=60, stale-while-revalidate=300',
      queryParams: t('ep3Params'),
      summary: t('ep3Summary'),
    },
    {
      method: 'GET',
      path: '/api/v1/rate/versus',
      auth: t('authPublic'),
      cache: 's-maxage=60, stale-while-revalidate=300',
      queryParams: t('ep15Params'),
      summary: t('ep15Summary'),
    },
    {
      method: 'GET',
      path: '/api/v1/rate/watchlist',
      auth: t('authPublic'),
      cache: 's-maxage=30, stale-while-revalidate=120',
      queryParams: t('ep4Params'),
      summary: t('ep4Summary'),
    },
    {
      method: 'GET',
      path: '/api/v1/rate/lookup',
      auth: t('authPublic'),
      cache: 's-maxage=30, stale-while-revalidate=120',
      queryParams: t('ep5Params'),
      summary: t('ep5Summary'),
    },
    {
      method: 'GET',
      path: '/api/v1/rate/inspect',
      auth: t('authPublic'),
      cache: 's-maxage=30, stale-while-revalidate=120',
      queryParams: t('ep6Params'),
      summary: t('ep6Summary'),
    },
    {
      method: 'GET',
      path: '/api/v1/rate/extension/lookup',
      auth: t('authPublic'),
      cache: 's-maxage=30, stale-while-revalidate=120',
      queryParams: t('ep7Params'),
      summary: t('ep7Summary'),
    },
    {
      method: 'POST',
      path: '/api/v1/rate/extension/ingest',
      auth: t('authOptIn'),
      cache: t('cacheNoStoreQueue'),
      queryParams: t('ep8Params'),
      summary: t('ep8Summary'),
    },
    {
      method: 'GET',
      path: '/api/v1/rate/merchants',
      auth: t('authPublic'),
      cache: 's-maxage=60, stale-while-revalidate=300',
      queryParams: t('ep9Params'),
      summary: t('ep9Summary'),
    },
    {
      method: 'GET',
      path: '/api/v1/rate/merchants/[id]',
      auth: t('authPublic'),
      cache: 's-maxage=60, stale-while-revalidate=300',
      queryParams: t('ep10Params'),
      summary: t('ep10Summary'),
    },
    {
      method: 'GET',
      path: '/api/v1/rate/merchants/directory',
      auth: t('authPublic'),
      cache: 's-maxage=60, stale-while-revalidate=300',
      queryParams: t('ep19Params'),
      summary: t('ep19Summary'),
    },
    {
      method: 'GET',
      path: '/api/v1/rate/reviews',
      auth: t('authPublic'),
      cache: 's-maxage=60, stale-while-revalidate=300',
      queryParams: t('ep16Params'),
      summary: t('ep16Summary'),
    },
    {
      method: 'GET',
      path: '/api/v1/rate/leaderboard',
      auth: t('authPublic'),
      cache: 's-maxage=60, stale-while-revalidate=300',
      queryParams: t('ep17Params'),
      summary: t('ep17Summary'),
    },
    {
      method: 'GET',
      path: '/api/v1/rate/deals',
      auth: t('authPublic'),
      cache: 's-maxage=120, stale-while-revalidate=300',
      queryParams: t('ep18Params'),
      summary: t('ep18Summary'),
    },
    {
      method: 'GET',
      path: '/api/v1/rate/stats',
      auth: t('authPublic'),
      cache: 's-maxage=60, stale-while-revalidate=300',
      queryParams: t('ep11Params'),
      summary: t('ep11Summary'),
    },
    {
      method: 'GET',
      path: '/api/v1/rate/openapi.json',
      auth: t('authPublic'),
      cache: 's-maxage=3600, stale-while-revalidate=86400',
      queryParams: t('ep12Params'),
      summary: t('ep12Summary'),
    },
    {
      method: 'POST',
      path: '/api/v1/rate/reviews',
      auth: t('authBearer'),
      cache: t('cacheNoStoreRpc'),
      queryParams: t('ep13Params'),
      summary: t('ep13Summary'),
    },
    {
      method: 'POST',
      path: '/api/reviews/[id]/vote',
      auth: t('authBearer'),
      cache: t('cacheNoStoreTrigger'),
      queryParams: t('ep14Params'),
      summary: t('ep14Summary'),
    },
  ];

  return (
    <ClientMessages scope="developers">
      <PageShell locale={locale}>
        {/* Hero Header */}
        <section className="bg-dark border-bottom border-secondary border-opacity-25 py-5 text-white">
          <div className="container py-3">
            <div className="row align-items-center g-4">
              <div className="col-lg-8">
                <div className="d-inline-flex align-items-center rounded-pill bg-danger bg-opacity-25 border-danger text-light small fw-semibold mb-3 gap-2 border px-3 py-1">
                  <BsCodeSquare className="text-danger" />
                  <span>{t('heroBadge')}</span>
                </div>
                <h1 className="display-6 fw-bold mb-3 text-white">
                  {t('heroTitlePrefix')}{' '}
                  <span className="text-danger">{t('heroTitleHighlight')}</span>
                </h1>
                <p className="lead text-white-50 mb-4">
                  {t('heroDescPrefix')} <code>rate.*</code>.{' '}
                  {t('heroDescSuffix')}
                </p>
                <div className="d-flex flex-wrap gap-2">
                  <a
                    href="#playground"
                    className="btn btn-danger rounded-pill fw-semibold px-4 py-2"
                  >
                    {t('btnPlayground')}
                  </a>
                  <a
                    href="/api/v1/rate/openapi.json"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline-info rounded-pill fw-semibold px-4 py-2"
                  >
                    {t('btnOpenApiSpec')}
                  </a>
                  <a
                    href="https://github.com/DOS/Rate"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline-light rounded-pill fw-medium d-inline-flex align-items-center gap-2 px-4 py-2"
                  >
                    <BsGithub /> {t('btnGithubSource')}
                  </a>
                </div>
              </div>

              <div className="col-lg-4">
                <div className="card rounded-4 bg-opacity-50 border-secondary border-opacity-25 border bg-black p-4 text-white">
                  <div className="small text-uppercase text-white-50 fw-bold mb-3">
                    {t('liveStatsHeader')}
                  </div>
                  <div className="row g-3">
                    <div className="col-6">
                      <div className="small text-white-50">
                        {t('statMasterProducts')}
                      </div>
                      <div className="h4 fw-bold text-warning mb-0">
                        {stats.masterProductsCount}
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="small text-white-50">
                        {t('statPriceObservations')}
                      </div>
                      <div className="h4 fw-bold text-info mb-0">
                        {stats.priceObservationsCount}
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="small text-white-50">
                        {t('statAiFilteredReviews')}
                      </div>
                      <div className="h4 fw-bold text-success mb-0">
                        {stats.totalReviewsCount}
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="small text-white-50">
                        {t('statEcommerceMerchants')}
                      </div>
                      <div className="h4 fw-bold text-light mb-0">
                        {stats.merchantsCount}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Interactive Playground Section */}
        <section className="bg-light py-5" id="playground">
          <div className="container">
            <div className="mb-4">
              <span className="badge bg-primary bg-opacity-10 text-primary rounded-pill fw-semibold mb-2 px-3 py-2">
                {t('playgroundBadge')}
              </span>
              <h2 className="h3 fw-bold mb-1">{t('playgroundTitle')}</h2>
              <p className="text-muted mb-0">{t('playgroundSubtitle')}</p>
            </div>

            <ApiPlaygroundClient />
          </div>
        </section>

        {/* Endpoint Reference Table */}
        <section className="border-top border-bottom bg-white py-5">
          <div className="container">
            <div className="mb-4">
              <span className="badge bg-success bg-opacity-10 text-success rounded-pill fw-semibold mb-2 px-3 py-2">
                {t('endpointsBadge')}
              </span>
              <h2 className="h3 fw-bold mb-1">{t('endpointsTitle')}</h2>
              <p className="text-muted mb-2">{t('endpointsSubtitle')}</p>
              <p className="text-muted small mb-0">
                <a
                  href="/api/v1/rate/openapi.json"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('endpointsFullReference')}
                </a>
              </p>
            </div>

            <div className="table-responsive rounded-4 border shadow-sm">
              <table className="table-hover mb-0 table align-middle">
                <thead className="table-dark">
                  <tr>
                    <th style={{ width: '90px' }}>{t('thMethod')}</th>
                    <th style={{ minWidth: '250px' }}>{t('thPath')}</th>
                    <th style={{ minWidth: '210px' }}>{t('thQueryParams')}</th>
                    <th>{t('thDescription')}</th>
                    <th style={{ minWidth: '180px' }}>
                      {t('thCacheSecurity')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {apiEndpointsSpec.map((ep) => (
                    <tr key={`${ep.method} ${ep.path}`}>
                      <td>
                        <span
                          className={`badge rounded-pill px-3 py-2 ${
                            ep.method === 'GET' ? 'bg-primary' : 'bg-danger'
                          }`}
                        >
                          {ep.method}
                        </span>
                      </td>
                      <td className="font-monospace fw-bold text-dark small">
                        {ep.path}
                      </td>
                      <td className="font-monospace text-muted small">
                        {ep.queryParams}
                      </td>
                      <td className="small text-secondary">{ep.summary}</td>
                      <td>
                        <div className="small fw-semibold text-dark">
                          {ep.auth}
                        </div>
                        <div
                          className="font-monospace text-muted"
                          style={{ fontSize: '0.8125rem' }}
                        >
                          {ep.cache}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* 10 Field Groups Zod Specification Reference */}
        <section className="bg-light py-5">
          <div className="container">
            <div className="row align-items-end g-3 mb-4">
              <div className="col-lg-8">
                <span className="badge bg-info bg-opacity-10 text-info rounded-pill fw-semibold mb-2 px-3 py-2">
                  {t('schemaBadge')}
                </span>
                <h2 className="h3 fw-bold mb-1">{t('schemaTitle')}</h2>
                <p className="text-muted mb-0">
                  {t('schemaDescPrefix')} <code>specifications</code> (JSONB){' '}
                  {t('schemaDescMiddle')} <code>rate.master_products</code>{' '}
                  {t('schemaDescSuffix')}
                </p>
              </div>
              <div className="col-lg-4 text-lg-end">
                <Link
                  href="/compare"
                  className="btn btn-outline-primary rounded-pill fw-medium px-4"
                >
                  {t('btnCompareMatrix')}
                </Link>
              </div>
            </div>

            <div className="row g-3">
              {TEN_FIELD_GROUPS.map((group) => (
                <div key={group.key} className="col-lg-6 col-12">
                  <div className="card rounded-4 h-100 border bg-white p-3 shadow-sm">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <div className="d-flex align-items-center gap-2">
                        <span className="badge bg-dark rounded-pill">
                          {t('groupOrderBadge', { order: group.order })}
                        </span>
                        <span className="fw-bold text-dark">
                          {t(`groupTitles.${group.key}`)}
                        </span>
                      </div>
                      <code className="small text-primary fw-semibold">
                        specifications.{group.key}
                      </code>
                    </div>
                    <div className="small text-muted font-monospace">
                      {t('standardFieldsPrefix')} {group.fields}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 4-Layer Architecture Overview */}
        <section className="border-top bg-white py-5">
          <div className="container">
            <div className="mb-4 text-center">
              <span className="badge bg-primary bg-opacity-10 text-primary rounded-pill fw-semibold mb-2 px-3 py-2">
                {t('layersBadge')}
              </span>
              <h2 className="h3 fw-bold mb-2">{t('layersTitle')}</h2>
            </div>

            <div className="row g-4">
              <div className="col-lg-3 col-md-6">
                <div className="card rounded-4 h-100 border p-4 shadow-sm">
                  <BsLayers className="text-primary fs-2 mb-3" />
                  <h3 className="h5 fw-bold">{t('layer1Title')}</h3>
                  <p className="small text-muted mb-0">
                    {t('layer1DescPrefix')} <code>React.cache()</code>{' '}
                    {t('layer1DescSuffix')}
                  </p>
                </div>
              </div>
              <div className="col-lg-3 col-md-6">
                <div className="card rounded-4 h-100 border p-4 shadow-sm">
                  <BsCpu className="text-success fs-2 mb-3" />
                  <h3 className="h5 fw-bold">{t('layer2Title')}</h3>
                  <p className="small text-muted mb-0">
                    {t('layer2DescPrefix')} <code>ProductNormalizer</code>,{' '}
                    {t('layer2DescMiddle1')} <code>EntityMatcher</code>,{' '}
                    <code>AiSpecEnricher</code> {t('layer2DescMiddle2')}{' '}
                    <code>AiReviewAnalyzer</code> {t('layer2DescSuffix')}
                  </p>
                </div>
              </div>
              <div className="col-lg-3 col-md-6">
                <div className="card rounded-4 h-100 border p-4 shadow-sm">
                  <BsShieldLock className="text-warning fs-2 mb-3" />
                  <h3 className="h5 fw-bold">{t('layer3Title')}</h3>
                  <p className="small text-muted mb-0">
                    {t('layer3DescPrefix')} <code>FOR UPDATE SKIP LOCKED</code>{' '}
                    {t('layer3DescSuffix')}
                  </p>
                </div>
              </div>
              <div className="col-lg-3 col-md-6">
                <div className="card rounded-4 h-100 border p-4 shadow-sm">
                  <BsDatabaseCheck className="text-danger fs-2 mb-3" />
                  <h3 className="h5 fw-bold">{t('layer4Title')}</h3>
                  <p className="small text-muted mb-0">{t('layer4Desc')}</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </PageShell>
    </ClientMessages>
  );
}
