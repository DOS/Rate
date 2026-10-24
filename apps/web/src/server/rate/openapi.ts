import 'server-only';
import { EXTENSION_CAPABILITY_MATRIX } from './extension';

export interface OpenApiParameter {
  name: string;
  in: 'query' | 'path' | 'header';
  required?: boolean;
  description: string;
  schema: {
    type: string;
    format?: string;
    enum?: string[];
    default?: string | number | boolean;
  };
}

export interface OpenApiOperation {
  operationId: string;
  summary: string;
  description: string;
  tags: string[];
  security?: Array<Record<string, string[]>>;
  parameters?: OpenApiParameter[];
  requestBody?: {
    required: boolean;
    content: {
      'application/json': {
        schema: Record<string, unknown>;
      };
    };
  };
  responses: Record<
    string,
    {
      description: string;
      content?: {
        'application/json': {
          schema: Record<string, unknown>;
        };
      };
    }
  >;
}

export interface RateOpenApiDocument {
  openapi: '3.1.0';
  info: {
    title: string;
    version: string;
    summary: string;
    description: string;
    license: {
      name: string;
      url: string;
    };
    contact: {
      name: string;
      url: string;
    };
  };
  servers: Array<{
    url: string;
    description: string;
  }>;
  tags: Array<{
    name: string;
    description: string;
  }>;
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: {
    securitySchemes?: Record<string, Record<string, unknown>>;
    schemas: Record<string, Record<string, unknown>>;
  };
}

export function normalizeOpenApiServerOrigin(
  rawBaseUrl?: string | null
): string {
  const trimmed = (rawBaseUrl ?? '').trim();
  if (!trimmed || trimmed.length > 256) return 'https://rate.vn';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'https://rate.vn';
    }
    return parsed.origin;
  } catch {
    return 'https://rate.vn';
  }
}

export function buildRateOpenApiSpec(
  baseUrl = 'https://rate.vn'
): RateOpenApiDocument {
  const safeBaseUrl = normalizeOpenApiServerOrigin(baseUrl);
  const categorySlugs = [
    'smartphones',
    'tablets',
    'laptops',
    'smartwatches',
    'earbuds',
  ];
  const supportedPlatforms = Object.keys(EXTENSION_CAPABILITY_MATRIX);

  return {
    openapi: '3.1.0',
    info: {
      title: 'Rate.vn Open-Core Intelligence REST API v1',
      version: '1.7.0',
      summary:
        'Standardized 10-Group Tech Specs, Price History, Product Deal Radar & AI Review Auditing API',
      description:
        'OpenAPI 3.1 specification for the Rate.vn REST API v1. The website, the Rate browser extension (10 Vietnamese marketplaces and retailers) and open e-commerce research all use these endpoints.',
      license: {
        name: 'MIT Open-Core License',
        url: 'https://github.com/DOS/Rate',
      },
      contact: {
        name: 'DOS Ecosystem & Rate.vn Architecture Team',
        url: 'https://rate.vn/developers',
      },
    },
    servers: [
      {
        url: safeBaseUrl,
        description: 'Rate.vn Production / Active Origin',
      },
    ],
    tags: [
      {
        name: 'Products & Specs',
        description:
          'Standardized master products (`rate.master_products`) with 10-group technical specifications and JReviews logarithmic scores.',
      },
      {
        name: 'Comparison & Watchlist',
        description:
          'Cross-model 10-group specification comparison and multi-product price alert tracking.',
      },
      {
        name: 'URL Inspector & Extension MV3',
        description:
          'Real-time URL/SKU canonicalization, 10-platform hybrid lookup, 5-level price verdict, and zero-trust quarantine ingestion.',
      },
      {
        name: 'Merchants & Dual Risk Score',
        description:
          'Merchant directory (`rate.merchants`) combining DOSafe Threat Intel Risk and AI Review Seeding Risk.',
      },
      {
        name: 'Community Reviews & Voting',
        description:
          'AI-audited product reviews (`rate.reviews`) and SHA-256 voter-hashed helpful/report votes (`rate.review_votes`).',
      },
      {
        name: 'Platform Telemetry',
        description:
          'Live database telemetry and OpenAPI 3.1 discovery endpoints.',
      },
    ],
    paths: {
      '/api/v1/rate/products': {
        get: {
          operationId: 'listMasterProducts',
          summary:
            'List standardized master products with 10-group spec filters',
          description:
            'Queries `rate.master_products` with multi-dimensional filtering across category, brand, price range, RAM/storage options, refresh rate, 5G, IP rating, charging wattage, and JReviews weighted score.',
          tags: ['Products & Specs'],
          parameters: [
            {
              name: 'category',
              in: 'query',
              description: 'Canonical hardware category slug',
              schema: {
                type: 'string',
                enum: categorySlugs,
              },
            },
            {
              name: 'brand',
              in: 'query',
              description: 'Brand filter (e.g. Apple, Samsung, Xiaomi, ASUS)',
              schema: { type: 'string' },
            },
            {
              name: 'q',
              in: 'query',
              description: 'Full-text search query across model name and slug',
              schema: { type: 'string' },
            },
            {
              name: 'minPrice',
              in: 'query',
              description: 'Minimum current price in VND',
              schema: { type: 'number' },
            },
            {
              name: 'maxPrice',
              in: 'query',
              description: 'Maximum current price in VND',
              schema: { type: 'number' },
            },
            {
              name: 'ramGb',
              in: 'query',
              description: 'RAM capacity filter in GB (e.g. 8, 12, 16)',
              schema: { type: 'number' },
            },
            {
              name: 'storageGb',
              in: 'query',
              description: 'Storage capacity filter in GB (e.g. 128, 256, 512)',
              schema: { type: 'number' },
            },
            {
              name: 'minRefreshHz',
              in: 'query',
              description: 'Minimum display refresh rate in Hz (1-500)',
              schema: { type: 'number' },
            },
            {
              name: 'has5g',
              in: 'query',
              description: 'Filter by 5G connectivity support',
              schema: { type: 'boolean' },
            },
            {
              name: 'minBatteryMah',
              in: 'query',
              description: 'Minimum battery capacity in mAh (1-100000)',
              schema: { type: 'number' },
            },
            {
              name: 'minFastChargeW',
              in: 'query',
              description:
                'Minimum wired fast-charging power in Watts (1-500); alias `charge` is also accepted',
              schema: { type: 'number' },
            },
            {
              name: 'hasNfc',
              in: 'query',
              description:
                'Filter by NFC support; alias `nfc` is also accepted',
              schema: { type: 'boolean' },
            },
            {
              name: 'minRating',
              in: 'query',
              description:
                'Minimum effective product rating (0-5 star scale); alias `rating` is also accepted',
              schema: { type: 'number' },
            },
            {
              name: 'compactScreen',
              in: 'query',
              description:
                'Maximum screen size in inches (or `true`/`1` for <= 6.2 inch compact devices); alias `compact` is also accepted',
              schema: { type: 'string' },
            },
            {
              name: 'facets',
              in: 'query',
              description:
                'Set to `true` or `1` to include category directory facets (brand counts, RAM/ROM options, price bounds)',
              schema: { type: 'boolean' },
            },
            {
              name: 'sort',
              in: 'query',
              description: 'Sort order for returned master products',
              schema: {
                type: 'string',
                enum: [
                  'default',
                  'rating_desc',
                  'price_asc',
                  'price_desc',
                  'merchants_desc',
                  'newest',
                ],
                default: 'default',
              },
            },
            {
              name: 'limit',
              in: 'query',
              description: 'Maximum number of products to return (1-100)',
              schema: { type: 'number', default: 24 },
            },
            {
              name: 'offset',
              in: 'query',
              description: 'Pagination offset (0-100000)',
              schema: { type: 'number', default: 0 },
            },
          ],
          responses: {
            '200': {
              description:
                'Paginated list of standardized master products with facet counts and per-product `deal_radar` / `radar_signal`.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean', example: true },
                      data: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            radar_signal: {
                              $ref: '#/components/schemas/ProductDealRadarSignal',
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/rate/products/{slug}': {
        get: {
          operationId: 'getMasterProductBySlug',
          summary:
            'Get full master product detail, 10-group specs, offers, price history & AI reviews',
          description:
            'Returns the canonical master product record, full 10-group specification JSONB, cross-marketplace merchant offers (`rate.products`), price history series (`rate.price_history`), fake-sale discount analysis, canonical `deal_radar` / `radar_signal`, and AI-audited user reviews.',
          tags: ['Products & Specs'],
          parameters: [
            {
              name: 'slug',
              in: 'path',
              required: true,
              description:
                'Canonical product slug or model_key (e.g. apple-iphone-16-128gb)',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description:
                'Full product detail payload with 10-group specs, price history, `radar_signal`, and AI-audited reviews.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean', example: true },
                      radar_signal: {
                        $ref: '#/components/schemas/ProductDealRadarSignal',
                      },
                    },
                  },
                },
              },
            },
            '404': {
              description: 'Master product not found.',
            },
          },
        },
      },
      '/api/v1/rate/compare': {
        get: {
          operationId: 'compareMasterProducts',
          summary:
            'Compare up to 4 master products side-by-side across all 10 spec groups',
          description:
            'Fetches up to 4 standardized master products and aligns their 10-group specifications (GSMArena + PhoneArena split camera schema), JReviews scores, and lowest verified prices.',
          tags: ['Comparison & Watchlist'],
          parameters: [
            {
              name: 'slugs',
              in: 'query',
              required: true,
              description:
                'Comma-separated list of up to 4 canonical product slugs',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description:
                'Side-by-side comparison matrix for up to 4 models including per-product `deal_radar` and `radar_signal`.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean', example: true },
                      data: { type: 'array', items: { type: 'object' } },
                      deal_radar: {
                        type: 'object',
                        additionalProperties: {
                          $ref: '#/components/schemas/ProductDealRadarSignal',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/rate/versus': {
        get: {
          operationId: 'getHeadToHeadVersusVerdict',
          summary:
            'Get programmatic 1v1 Head-to-Head JReviews verdict, 5-criteria scoreboard & price delta',
          description:
            'Evaluates two same-category master products (`?pair=<slugA>-vs-<slugB>` or `?slugA=...&slugB=...`) with optional persona/custom 5-criteria weights (`persona`, `w_screen`, `w_performance`, `w_camera`, `w_battery`, `w_value`) and returns the overall winner, per-criterion head-to-head breakdown, price delta, Deal Radar signals (`deal_radar`), and 10-group specs.',
          tags: ['Comparison & Watchlist'],
          parameters: [
            {
              name: 'pair',
              in: 'query',
              required: false,
              description:
                'Canonical 1v1 pair slug in the format `<slugA>-vs-<slugB>` (e.g. `apple-iphone-16-pro-max-256gb-vs-samsung-galaxy-s25-ultra-256gb`).',
              schema: { type: 'string' },
            },
            {
              name: 'slugA',
              in: 'query',
              required: false,
              description: 'First product slug if `pair` is not provided.',
              schema: { type: 'string' },
            },
            {
              name: 'slugB',
              in: 'query',
              required: false,
              description: 'Second product slug if `pair` is not provided.',
              schema: { type: 'string' },
            },
            {
              name: 'persona',
              in: 'query',
              required: false,
              description:
                'Optional use-case persona preset (`balanced`, `default`, `creator`, `photography`, `gamer`, `gaming`, `traveler`, `endurance`, `business`, `budget`, `value_hunter`).',
              schema: {
                type: 'string',
                enum: [
                  'balanced',
                  'default',
                  'creator',
                  'photography',
                  'gamer',
                  'gaming',
                  'traveler',
                  'endurance',
                  'business',
                  'budget',
                  'value_hunter',
                ],
                default: 'balanced',
              },
            },
            {
              name: 'w_screen',
              in: 'query',
              required: false,
              description: 'Optional custom screen criterion weight (0..100).',
              schema: { type: 'number' },
            },
            {
              name: 'w_performance',
              in: 'query',
              required: false,
              description:
                'Optional custom performance criterion weight (0..100).',
              schema: { type: 'number' },
            },
            {
              name: 'w_camera',
              in: 'query',
              required: false,
              description: 'Optional custom camera criterion weight (0..100).',
              schema: { type: 'number' },
            },
            {
              name: 'w_battery',
              in: 'query',
              required: false,
              description: 'Optional custom battery criterion weight (0..100).',
              schema: { type: 'number' },
            },
            {
              name: 'w_value',
              in: 'query',
              required: false,
              description: 'Optional custom value criterion weight (0..100).',
              schema: { type: 'number' },
            },
          ],
          responses: {
            '200': {
              description:
                '1v1 head-to-head JReviews verdict, 5-criteria breakdown, Deal Radar signals (`deal_radar`), and price comparison.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean', example: true },
                      deal_radar: {
                        type: 'object',
                        properties: {
                          productA: {
                            $ref: '#/components/schemas/ProductDealRadarSignal',
                          },
                          productB: {
                            $ref: '#/components/schemas/ProductDealRadarSignal',
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': {
              description: 'Missing or invalid 1v1 pair parameters.',
            },
            '404': {
              description:
                'Products not found or violated Same-Category Comparison Lock.',
            },
          },
        },
      },
      '/api/v1/rate/watchlist': {
        get: {
          operationId: 'getWatchlistProducts',
          summary:
            'Fetch real-time price, Deal Radar signal & fake-sale verdict status for watched products',
          description:
            'Batch-fetches current lowest prices, historical median prices, fake-sale discount analysis, and canonical `deal_radar` / `radar_signal` telemetry for up to 20 watched product slugs.',
          tags: ['Comparison & Watchlist'],
          parameters: [
            {
              name: 'slugs',
              in: 'query',
              required: true,
              description: 'Comma-separated list of watched product slugs',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description:
                'Live watchlist product status array with per-item `deal_radar` and `radar_signal`.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean', example: true },
                      data: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            radar_signal: {
                              $ref: '#/components/schemas/ProductDealRadarSignal',
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          operationId: 'registerWatchlistPriceAlert',
          summary:
            'Register a target price alert for a canonical master product (`rate.upsert_price_alert`)',
          description:
            "Upserts the signed-in user's price alert threshold in VND (`targetPrice`) for a watched master product and returns the latest `deal_radar` and `radar_signal` snapshot. Requires a Supabase access token; alerts are keyed to the account and notify the account's own email. `persistedInCloud: false` means `rate.upsert_price_alert` is not deployed in this environment and nothing was stored.",
          tags: ['Comparison & Watchlist'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['slug', 'targetPrice'],
                  properties: {
                    slug: {
                      type: 'string',
                      example: 'apple-iphone-16-pro-max-256gb',
                    },
                    targetPrice: {
                      type: 'number',
                      example: 28990000,
                    },
                    locale: {
                      type: 'string',
                      enum: ['vi', 'en', 'cs'],
                      default: 'vi',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description:
                'Registered price alert confirmation with current product `deal_radar` and `radar_signal`.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean', example: true },
                      radar_signal: {
                        $ref: '#/components/schemas/ProductDealRadarSignal',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/rate/lookup': {
        get: {
          operationId: 'lookupEcommerceUrlOrQuery',
          summary:
            'Parse e-commerce URL or model query and match against master products & merchants',
          description:
            'Extracts platform, shopId, itemId, or model keywords from an e-commerce URL or query string and returns matching master products, merchant trust profiles, and product-level `deal_radar` / `radar_signal`.',
          tags: ['URL Inspector & Extension MV3'],
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: true,
              description:
                'E-commerce product URL or model search query (e.g. https://shopee.vn/product/88201679/27110898667)',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description:
                'Parsed URL metadata, matched master products, merchant audit summary, and `radar_signal`.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean', example: true },
                      radar_signal: {
                        $ref: '#/components/schemas/ProductDealRadarSignal',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/rate/inspect': {
        get: {
          operationId: 'inspectProductUrlAndVerdict',
          summary:
            'Full Web Product & URL Inspector with 5-level price verdict and price history chart',
          description:
            'Runs the complete hybrid lookup pipeline for the `/inspect` web portal: canonicalizes 10 supported e-commerce/retailer platforms, blocks non-hardware accessories, resolves SKU variant capacity, computes the 5-level price verdict, and returns full product detail with `deal_radar` and `radar_signal`.',
          tags: ['URL Inspector & Extension MV3'],
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: true,
              description: 'E-commerce URL or product model name to inspect',
              schema: { type: 'string' },
            },
            {
              name: 'price',
              in: 'query',
              description:
                'Optional observed live listing price in VND to test against the historical median',
              schema: { type: 'number' },
            },
            {
              name: 'originalPrice',
              in: 'query',
              description:
                'Optional observed strikethrough original price in VND to test for fake-sale markup',
              schema: { type: 'number' },
            },
          ],
          responses: {
            '200': {
              description:
                'Complete inspection payload including extension lookup verdict, product detail, `radar_signal`, and capability matrix.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean', example: true },
                      radar_signal: {
                        $ref: '#/components/schemas/ProductDealRadarSignal',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/rate/extension/lookup': {
        get: {
          operationId: 'extensionHybridLookup',
          summary:
            'Low-latency Hybrid Lookup for Rate Browser Extension Manifest V3',
          description:
            'Dedicated read-only lookup endpoint for the Rate Browser Extension MV3 across 10 platforms (`shopee`, `lazada`, `tiki`, `tiktok`, `cellphones`, `tgdd`, `fptshop`, `hoangha`, `didongviet`, `phongvu`). Performs deterministic `platform_item_id` lookup, canonical model fallback, accessory gatekeeping, 5-level price verdict calculation, and returns `deal_radar` / `radarSignal`.',
          tags: ['URL Inspector & Extension MV3'],
          parameters: [
            {
              name: 'platform',
              in: 'query',
              description: 'Marketplace or authorized retailer platform slug',
              schema: {
                type: 'string',
                enum: supportedPlatforms,
              },
            },
            {
              name: 'externalId',
              in: 'query',
              description: 'Platform item ID or shopId_itemId',
              schema: { type: 'string' },
            },
            {
              name: 'shopId',
              in: 'query',
              description: 'Platform shop ID',
              schema: { type: 'string' },
            },
            {
              name: 'url',
              in: 'query',
              required: false,
              description:
                'Active tab URL (at least one of `url`, `title`, or `externalId` is required)',
              schema: { type: 'string' },
            },
            {
              name: 'title',
              in: 'query',
              description: 'DOM-extracted product title from active tab',
              schema: { type: 'string' },
            },
            {
              name: 'selectedVariant',
              in: 'query',
              description:
                'Selected SKU variant text on DOM (e.g. 256GB Titan Tu Nhien); alias `skuText` is also accepted',
              schema: { type: 'string' },
            },
            {
              name: 'skuText',
              in: 'query',
              description:
                'Alias for `selectedVariant` (selected SKU variant text)',
              schema: { type: 'string' },
            },
            {
              name: 'price',
              in: 'query',
              description: 'DOM-extracted current price in VND',
              schema: { type: 'number' },
            },
            {
              name: 'originalPrice',
              in: 'query',
              description: 'DOM-extracted strikethrough original price in VND',
              schema: { type: 'number' },
            },
            {
              name: 'mode',
              in: 'query',
              description:
                'Response payload mode (`pill` for lightweight Shadow DOM badge or `full` for Side Panel)',
              schema: {
                type: 'string',
                enum: ['pill', 'full'],
                default: 'full',
              },
            },
          ],
          responses: {
            '200': {
              description:
                'Extension lookup verdict, matched master product, `radar_signal`, cross-marketplace offers, and merchant trust summary.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean', example: true },
                      radar_signal: {
                        $ref: '#/components/schemas/ProductDealRadarSignal',
                      },
                    },
                  },
                },
              },
            },
            '429': {
              description:
                'Per-IP sliding-window rate limit exceeded (max 60 requests/min).',
            },
          },
        },
      },
      '/api/v1/rate/extension/ingest': {
        post: {
          operationId: 'extensionQuarantineIngest',
          summary:
            'Zero-Trust Quarantine Ingestion for crowd-contributed extension snapshots',
          description:
            'Validates opt-in Browser Extension MV3 product snapshots (`userConsentOptIn === true`), strips PII/tracking query params, verifies URL hostname matches declared `platform`, blocks accessories, checks price sanity bounds, and enqueues unindexed listings into `rate.crawl_jobs` via `enqueue_crowd_verify_signal` without directly mutating `rate.master_products`.',
          tags: ['URL Inspector & Extension MV3'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ExtensionQuarantineIngestPayload',
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Quarantine validation and enqueue status.',
            },
            '400': {
              description: 'Rejected by Zero-Trust Quarantine Validator.',
            },
            '429': {
              description:
                'Per-IP sliding-window rate limit exceeded (max 15 signals/min).',
            },
          },
        },
      },
      '/api/v1/rate/merchants': {
        get: {
          operationId: 'listMerchants',
          summary:
            'List e-commerce merchants with Dual Risk Score (DOSafe + AI Seeding Risk)',
          description:
            'Returns verified merchants (`rate.merchants`) with filter support for platform, Official Mall status, minimum trust score, search query, and sorting.',
          tags: ['Merchants & Dual Risk Score'],
          parameters: [
            {
              name: 'platform',
              in: 'query',
              description: 'Filter by marketplace platform',
              schema: {
                type: 'string',
                enum: supportedPlatforms,
              },
            },
            {
              name: 'officialOnly',
              in: 'query',
              description:
                'Set to true (or `official=1`) to return only Official Mall stores',
              schema: { type: 'boolean' },
            },
            {
              name: 'min_trust',
              in: 'query',
              description:
                'Minimum merchant trust score (0-100); alias `minTrust` is also accepted',
              schema: { type: 'number' },
            },
            {
              name: 'q',
              in: 'query',
              description: 'Search merchant name or shop slug',
              schema: { type: 'string' },
            },
            {
              name: 'sort',
              in: 'query',
              description: 'Sort order for returned merchants',
              schema: {
                type: 'string',
                enum: [
                  'trust_desc',
                  'products_desc',
                  'seeding_asc',
                  'followers_desc',
                ],
                default: 'trust_desc',
              },
            },
            {
              name: 'limit',
              in: 'query',
              description: 'Maximum number of merchants to return (1-100)',
              schema: { type: 'number', default: 50 },
            },
          ],
          responses: {
            '200': {
              description: 'Array of merchant trust profiles.',
            },
          },
        },
      },
      '/api/v1/rate/merchants/directory': {
        get: {
          operationId: 'getMerchantDirectoryPage',
          summary:
            'Paginated merchant directory with risk tier, seeding tier & platform filters',
          description:
            'Returns one page (`items`, `matched`, `offset`) of the `/merchants` directory filtered by search query, platform, Official Mall status, trust risk tier (`safe`, `moderate`, `warning`), AI seeding tier (`low`, `elevated`), and sort order.',
          tags: ['Merchants & Dual Risk Score'],
          parameters: [
            {
              name: 'q',
              in: 'query',
              description: 'Search merchant name, shop ID, or slug',
              schema: { type: 'string' },
            },
            {
              name: 'platform',
              in: 'query',
              description: 'Filter by marketplace platform or `all`',
              schema: {
                type: 'string',
                enum: [...supportedPlatforms, 'all'],
                default: 'all',
              },
            },
            {
              name: 'official',
              in: 'query',
              description:
                'Set to `true` or `1` to return only Official Mall stores (`officialOnly` alias is also accepted)',
              schema: { type: 'boolean' },
            },
            {
              name: 'risk',
              in: 'query',
              description:
                'Trust score tier (`all`, `safe` >= 80, `moderate` 60-79, `warning` < 60)',
              schema: {
                type: 'string',
                enum: ['all', 'safe', 'moderate', 'warning'],
                default: 'all',
              },
            },
            {
              name: 'seeding',
              in: 'query',
              description:
                'AI seeding risk tier (`all`, `low` <= 15, `elevated` > 15)',
              schema: {
                type: 'string',
                enum: ['all', 'low', 'elevated'],
                default: 'all',
              },
            },
            {
              name: 'sort',
              in: 'query',
              description: 'Sort order for directory entries',
              schema: {
                type: 'string',
                enum: [
                  'trust_desc',
                  'products_desc',
                  'seeding_asc',
                  'followers_desc',
                ],
                default: 'trust_desc',
              },
            },
            {
              name: 'offset',
              in: 'query',
              description: 'Pagination offset (0-100000)',
              schema: { type: 'number', default: 0 },
            },
            {
              name: 'limit',
              in: 'query',
              description: 'Page size (1-500)',
              schema: { type: 'number', default: 48 },
            },
          ],
          responses: {
            '200': {
              description:
                'Paginated merchant directory slice with total matched count.',
            },
          },
        },
      },
      '/api/v1/rate/merchants/{id}': {
        get: {
          operationId: 'getMerchantById',
          summary:
            'Get detailed merchant audit profile, seeding breakdown & active listings',
          description:
            'Fetches a single merchant by UUID, slug, or `platform_shop_id` along with its active marketplace listings and AI review seeding distribution.',
          tags: ['Merchants & Dual Risk Score'],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: 'Merchant UUID, shop_slug, or platform_shop_id',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Detailed merchant audit profile.',
            },
            '404': {
              description: 'Merchant not found.',
            },
          },
        },
      },
      '/api/v1/rate/reviews': {
        get: {
          operationId: 'listProductReviews',
          summary: 'List AI-audited reviews for a master product',
          description:
            'Returns user and marketplace reviews for a given `masterProductId` or `slug`, including AI seeding audit flags (`seeding_score`, `is_flagged_fake`).',
          tags: ['Community Reviews & Voting'],
          parameters: [
            {
              name: 'masterProductId',
              in: 'query',
              description:
                'Canonical master product UUID (`rate.master_products.id`); alias `productId` is also accepted',
              schema: { type: 'string', format: 'uuid' },
            },
            {
              name: 'slug',
              in: 'query',
              description: 'Master product slug',
              schema: { type: 'string' },
            },
            {
              name: 'hideFake',
              in: 'query',
              description: 'Filter out reviews flagged as AI seeding/fake',
              schema: { type: 'boolean' },
            },
            {
              name: 'limit',
              in: 'query',
              description: 'Maximum number of reviews to return (1-200)',
              schema: { type: 'number', default: 50 },
            },
          ],
          responses: {
            '200': {
              description: 'List of audited reviews.',
            },
          },
        },
        post: {
          operationId: 'submitCommunityReview',
          summary:
            'Submit a 5-criteria JReviews community review with automated anti-seeding check',
          description:
            'Submits a community review for the signed-in user via `rate.submit_community_review`. The review is stored unanalyzed and does not change product scores until it is analyzed; keyword spam is flagged at once. Requires a Supabase access token. The reviewer type is decided by the database; the request cannot claim `expert`. Any failure to store the review is returned as an error.',
          tags: ['Community Reviews & Voting'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['masterProductId', 'comment'],
                  properties: {
                    masterProductId: { type: 'string', format: 'uuid' },
                    authorName: { type: 'string', maxLength: 80 },
                    ratingStar: { type: 'integer', minimum: 1, maximum: 5 },
                    comment: { type: 'string', minLength: 15, maxLength: 3000 },
                    variation: { type: 'string', maxLength: 120 },
                    criteriaRatings: {
                      type: 'object',
                      description:
                        'Scores 1-5 for screen, performance, camera, battery, value',
                      additionalProperties: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description:
                'Community review stored with verdict `unanalyzed` and excluded from the rating until it is analyzed.',
            },
            '400': { description: 'Invalid body or rejected by the RPC.' },
            '401': { description: 'Missing or invalid access token.' },
            '403': {
              description:
                'Guest (anonymous) sign-ins and cross-site cookie requests cannot submit reviews.',
            },
            '409': { description: 'This user already reviewed the product.' },
            '429': {
              description: 'More than 5 reviews by this user in 24 hours.',
            },
            '502': { description: 'The review could not be stored.' },
            '503': { description: 'Review submission is not deployed here.' },
          },
        },
      },
      '/api/reviews/{id}/vote': {
        post: {
          operationId: 'voteOnReview',
          summary:
            'Cast an authenticated Helpful/Downvote/Report vote on a review (`rate.review_votes`)',
          description:
            'Records an authenticated voter action (`up`, `down`, `report`, or `clear`) for a review after verifying voter account eligibility (>= 7 days old and confirmed email/phone) and triggers the PostgreSQL `SECURITY DEFINER` function to update review counters.',
          tags: ['Community Reviews & Voting'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: 'Review UUID (`rate.reviews.id`)',
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    voteType: {
                      type: 'string',
                      enum: ['up', 'down', 'report', 'clear'],
                      default: 'up',
                    },
                    helpful: {
                      type: 'boolean',
                      description:
                        'Optional shorthand (`true` -> `up`, `false` -> `down`) when `voteType` is omitted.',
                    },
                    reportReason: {
                      type: 'string',
                      enum: ['spam', 'fake', 'offensive', 'off_topic', 'other'],
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Updated helpful/report counters for the review.',
            },
            '401': {
              description: 'Missing or invalid bearer token.',
            },
            '403': {
              description:
                'Voter account is ineligible (< 7 days old or unverified contact).',
            },
            '429': {
              description:
                'Rate limit exceeded (maximum 60 vote actions per hour).',
            },
          },
        },
      },
      '/api/v1/rate/stats': {
        get: {
          operationId: 'getPlatformStats',
          summary:
            'Get real-time platform statistics and 5-category model counts',
          description:
            'Returns live counts of standardized master products, recorded price observations, audited reviews, genuine review percentage, verified merchants, and per-category product counts.',
          tags: ['Platform Telemetry'],
          responses: {
            '200': {
              description: 'Live platform telemetry object.',
            },
          },
        },
      },
      '/api/v1/rate/leaderboard': {
        get: {
          operationId: 'getJReviewsLeaderboard',
          summary:
            'Get 4-Tier JReviews Dual-Rating & 5-Criteria Leaderboard rankings',
          description:
            'Ranks standardized master products within a category (or across all 5 categories) by Combined 10.0 score, Verified User score, Lab Expert score, or any of the 5 JReviews sub-criteria (screen, performance, camera, battery, value) with zero affiliate weight.',
          tags: ['Products & Specs'],
          parameters: [
            {
              name: 'category',
              in: 'query',
              description:
                'Canonical category slug (`smartphones`, `tablets`, `laptops`, `smartwatches`, `earbuds`, or `all`).',
              schema: {
                type: 'string',
                enum: [...categorySlugs, 'all'],
                default: 'smartphones',
              },
            },
            {
              name: 'criterion',
              in: 'query',
              description:
                'JReviews ranking criterion (`combined`, `user`, `expert`, `screen`, `performance`, `camera`, `battery`, `value`).',
              schema: {
                type: 'string',
                enum: [
                  'combined',
                  'user',
                  'expert',
                  'screen',
                  'performance',
                  'camera',
                  'battery',
                  'value',
                ],
                default: 'combined',
              },
            },
            {
              name: 'price',
              in: 'query',
              description:
                'Price segment filter (`all`, `under15m`, `15to25m`, `over25m`).',
              schema: {
                type: 'string',
                enum: ['all', 'under15m', '15to25m', 'over25m'],
                default: 'all',
              },
            },
            {
              name: 'brand',
              in: 'query',
              description: 'Optional brand filter (e.g. `Apple`, `Samsung`).',
              schema: {
                type: 'string',
                default: 'all',
              },
            },
            {
              name: 'limit',
              in: 'query',
              description: 'Max ranked items to return (1..50).',
              schema: {
                type: 'number',
                default: 20,
              },
            },
          ],
          responses: {
            '200': {
              description:
                '4-Tier JReviews Leaderboard ranking with Top 3 Podium, per-item `deal_radar` / `radar_signal`, and Same-Category compare URL.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean', example: true },
                      data: {
                        type: 'object',
                        properties: {
                          items: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                radar_signal: {
                                  $ref: '#/components/schemas/ProductDealRadarSignal',
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/rate/deals': {
        get: {
          operationId: 'getCrossPlatformDealRadar',
          summary:
            'Cross-Platform Deal Radar & Fake-Sale Trap Feed across 10 platforms',
          description:
            'Returns real-time genuine cross-platform deals (`genuineDeals`, current offers below the cross-retailer median) and inflated fake-sale traps (`fakeSaleTraps`) audited against cross-retailer median prices.',
          tags: ['Products & Specs'],
          parameters: [
            {
              name: 'category',
              in: 'query',
              description:
                'Canonical category slug (`smartphones`, `tablets`, `laptops`, `smartwatches`, `earbuds`, or `all`).',
              schema: {
                type: 'string',
                enum: [...categorySlugs, 'all'],
                default: 'all',
              },
            },
            {
              name: 'platform',
              in: 'query',
              description: 'Optional retailer filter.',
              schema: {
                type: 'string',
                enum: [...supportedPlatforms, 'all'],
                default: 'all',
              },
            },
            {
              name: 'limit',
              in: 'query',
              description: 'Max items per list (1..50).',
              schema: {
                type: 'number',
                default: 12,
              },
            },
          ],
          responses: {
            '200': {
              description:
                'Genuine deal radar and fake-sale trap list across 10 retailers.',
            },
          },
        },
      },
      '/api/v1/rate/openapi': {
        get: {
          operationId: 'getOpenApiSpecification',
          summary: 'Retrieve this OpenAPI 3.1.0 machine-readable specification',
          description:
            'Returns the complete OpenAPI 3.1.0 JSON schema for all Rate.vn REST API v1 endpoints.',
          tags: ['Platform Telemetry'],
          responses: {
            '200': {
              description: 'OpenAPI 3.1.0 JSON document.',
            },
          },
        },
      },
      '/api/v1/rate/openapi.json': {
        get: {
          operationId: 'getOpenApiSpecificationJson',
          summary:
            'Retrieve this OpenAPI 3.1.0 machine-readable specification (JSON)',
          description:
            'Returns the complete OpenAPI 3.1.0 JSON schema for all Rate.vn REST API v1 endpoints.',
          tags: ['Platform Telemetry'],
          responses: {
            '200': {
              description: 'OpenAPI 3.1.0 JSON document.',
            },
          },
        },
      },
      '/api/v1/rate/revalidate': {
        post: {
          operationId: 'revalidateRateDataCache',
          summary:
            'On-demand Next.js Data Cache & ISR tag/path revalidation webhook',
          description:
            'Surgically invalidates deterministic Next.js Data Cache tags (`rate:products`, `rate:product:<slug>`, `rate:merchants`, `rate:deals`, etc.) or route paths after crawler queue workers or database triggers update master products, offers, or reviews. Requires `Authorization: Bearer <RATE_REVALIDATE_SECRET>` or `X-Rate-Revalidate-Token`.',
          tags: ['Platform Telemetry'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    tags: {
                      type: 'array',
                      items: { type: 'string' },
                      example: ['rate:products', 'rate:deals'],
                    },
                    slugs: {
                      type: 'array',
                      items: { type: 'string' },
                      example: ['apple-iphone-16-pro-max'],
                    },
                    categories: {
                      type: 'array',
                      items: { type: 'string' },
                      example: ['smartphones'],
                    },
                    merchants: {
                      type: 'array',
                      items: { type: 'string' },
                      example: ['shopee-88201679'],
                    },
                    paths: {
                      type: 'array',
                      items: { type: 'string' },
                      example: ['/smartphones/apple-iphone-16-pro-max'],
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description:
                'Successfully invalidated requested cache tags and paths.',
            },
            '400': {
              description: 'Malformed JSON or empty revalidation target lists.',
            },
            '401': {
              description: 'Missing or invalid `RATE_REVALIDATE_SECRET` token.',
            },
            '503': {
              description:
                'Revalidation is not configured on this deployment (`RATE_REVALIDATE_SECRET` unset).',
            },
          },
        },
      },
      '/api/health': {
        get: {
          operationId: 'getHealthStatus',
          summary: 'Liveness & readiness health check probe',
          description:
            'Returns service metadata (`status`, `service: "rate-web"`, `version`, ISO-8601 `timestamp`) and `checks.database`, the result of a small read with the app\'s own database client (3 s timeout, reused for up to 15 s per instance), with `Cache-Control: no-store, max-age=0` for load balancers and uptime monitors.',
          tags: ['Platform Telemetry'],
          responses: {
            '200': {
              description:
                'Service is healthy: `status: "ok"`, `checks.database: "ok"`.',
            },
            '503': {
              description:
                'The database cannot be read: `status: "degraded"`, `checks.database: "error"`. The cause is logged server-side, not returned.',
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Supabase Auth access token of the signed-in user.',
        },
      },
      schemas: {
        SupportedEcommercePlatform: {
          type: 'string',
          enum: supportedPlatforms,
          description:
            '10 supported Vietnamese e-commerce marketplaces and authorized electronics retailers.',
        },
        CanonicalRateCategorySlug: {
          type: 'string',
          enum: categorySlugs,
          description: '5 canonical hardware categories on Rate.vn.',
        },
        PriceVerdictLevel: {
          type: 'string',
          enum: [
            'genuine_deal',
            'fair_market',
            'above_market',
            'inflated_fake_sale',
            'insufficient_data',
            'ambiguous_variant',
            'skipped_accessory',
          ],
          description:
            'Evidence-based price verdict comparing observed listing price and claimed original price against the historical median and cross-retailer floor.',
        },
        ExtensionQuarantineIngestPayload: {
          type: 'object',
          required: ['url', 'title', 'price', 'userConsentOptIn'],
          properties: {
            platform: {
              $ref: '#/components/schemas/SupportedEcommercePlatform',
              description:
                'Optional; derived from `url` when omitted. When given it must match the URL.',
            },
            externalItemId: {
              type: 'string',
              minLength: 1,
              maxLength: 120,
              example: '29512841920',
              description: 'Optional; derived from `url` when omitted.',
            },
            externalShopId: {
              type: 'string',
              maxLength: 120,
              nullable: true,
              example: '88201679',
            },
            url: {
              type: 'string',
              format: 'uri',
              maxLength: 1024,
              example: 'https://shopee.vn/product/88201679/29512841920',
            },
            title: {
              type: 'string',
              minLength: 3,
              maxLength: 320,
              example: 'Apple iPhone 16 Pro Max 256GB Chính Hãng VN/A',
            },
            selectedVariant: {
              type: 'string',
              maxLength: 160,
              nullable: true,
              example: '256GB Titan Tự Nhiên',
            },
            price: {
              type: 'integer',
              minimum: 1,
              maximum: 500000000,
              example: 28990000,
            },
            originalPrice: {
              type: 'integer',
              minimum: 1,
              maximum: 500000000,
              nullable: true,
              example: 34990000,
            },
            ratingStar: {
              type: 'number',
              minimum: 0,
              maximum: 5,
              nullable: true,
              example: 4.9,
            },
            ratingCount: {
              type: 'integer',
              minimum: 0,
              maximum: 10000000,
              nullable: true,
              example: 120,
            },
            userConsentOptIn: {
              type: 'boolean',
              description:
                'Must be explicitly true (user opt-in required before any crowd signal is queued for verification).',
              example: true,
            },
          },
        },
        ProductDealRadarSignal: {
          type: 'object',
          required: ['verdict', 'savingsPct', 'fakeMarkupPct', 'spreadPct'],
          description:
            'Unified product-level Deal Radar signal embedded across product, leaderboard, comparison, inspection, and extension lookup endpoints.',
          properties: {
            verdict: {
              type: 'string',
              enum: ['genuine_deal', 'fake_sale_trap', 'none'],
              example: 'genuine_deal',
            },
            savingsPct: {
              type: 'number',
              example: 8.5,
            },
            fakeMarkupPct: {
              type: 'number',
              example: 0,
            },
            spreadPct: {
              type: 'number',
              example: 12.4,
            },
          },
        },
      },
    },
  };
}
