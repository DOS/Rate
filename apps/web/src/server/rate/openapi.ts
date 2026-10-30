import 'server-only';
import {
  EXTENSION_CAPABILITY_MATRIX,
  EXTENSION_PRICE_VERDICTS,
} from './extension';
import { isItemModelOn } from './item-model';

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
  responses: Record<string, OpenApiResponse>;
}

export interface OpenApiResponse {
  description: string;
  headers?: Record<
    string,
    { description: string; schema: { type: string; example?: string | number } }
  >;
  content?: {
    'application/json': {
      schema: Record<string, unknown>;
    };
  };
}

const API_ERROR_REF = { $ref: '#/components/schemas/ApiError' } as const;
const RADAR_REF = {
  $ref: '#/components/schemas/ProductDealRadarSignal',
} as const;
const RADAR_DETAIL_REF = {
  $ref: '#/components/schemas/ProductDealRadarSignalDetail',
} as const;
const MERCHANT_REF = {
  $ref: '#/components/schemas/MerchantSummary',
} as const;

/** A 4xx answer: every error body is an `ApiError` (DOS/Rate#1359). */
function errorResponse(description: string): OpenApiResponse {
  return {
    description,
    content: { 'application/json': { schema: { ...API_ERROR_REF } } },
  };
}

/**
 * A rate limit's 429: `code: RATE_LIMIT_EXCEEDED` and `Retry-After`, the
 * limit's window in seconds (DOS/Rate#1307, #1377, #1400).
 */
function rateLimitedResponse(
  description: string,
  retryAfterSeconds = 60
): OpenApiResponse {
  return {
    ...errorResponse(
      `${description} The body has \`code: "RATE_LIMIT_EXCEEDED"\`.`
    ),
    headers: {
      'Retry-After': {
        description: 'Seconds to wait before retrying.',
        schema: { type: 'integer', example: retryAfterSeconds },
      },
    },
  };
}

/**
 * The 429 of the inspection routes (`/lookup`, `/inspect`): 30 requests per
 * minute per client IP, counted on each server instance (DOS/Rate#1307).
 */
function inspectRateLimitedResponse(): OpenApiResponse {
  return rateLimitedResponse(
    'More than 30 requests per minute from this client IP (shared by `/lookup` and `/inspect`, counted on each server instance).'
  );
}

const LEADERBOARD_ENTRY = {
  type: 'object',
  additionalProperties: true,
  properties: {
    slug: { type: 'string' },
    deal_radar: RADAR_REF,
    radar_signal: RADAR_REF,
  },
} as const;

/** The `/leaderboard` payload under `data` (DOS/Rate#1377). */
const LEADERBOARD_PAYLOAD_PROPERTIES: Record<
  string,
  Record<string, unknown>
> = {
  directory: { type: 'string', example: 'tech_electronics' },
  category: { type: 'string' },
  criterion: { type: 'string' },
  price_segment: { type: 'string' },
  brand: { type: 'string' },
  total_matched: { type: 'integer' },
  returned_count: { type: 'integer' },
  compare_top_3_url: { type: ['string', 'null'] },
  podium_top_3: { type: 'array', items: LEADERBOARD_ENTRY },
  items: { type: 'array', items: LEADERBOARD_ENTRY },
};

/**
 * The same payload repeated at the top level for older clients, each field
 * deprecated in favour of `data` (DOS/Rate#1377).
 */
function leaderboardTopLevelMirror(): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(LEADERBOARD_PAYLOAD_PROPERTIES).map(([key, schema]) => [
      key,
      {
        ...schema,
        deprecated: true,
        description: `The same as \`data.${key}\`, kept for older clients.`,
      },
    ])
  );
}

function jsonBody(schema: Record<string, unknown>) {
  return { 'application/json': { schema } } as const;
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
  if (typeof rawBaseUrl !== 'string') return 'https://rate.vn';
  const trimmed = rawBaseUrl.trim();
  if (!trimmed || trimmed.length > 256 || /[\s\p{Cc}]/u.test(trimmed)) {
    return 'https://rate.vn';
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'https://rate.vn';
    }
    if (parsed.username || parsed.password) {
      return 'https://rate.vn';
    }
    const host = parsed.hostname.toLowerCase();
    if (
      !host ||
      host.startsWith('.') ||
      host.endsWith('.') ||
      host.includes('..')
    ) {
      return 'https://rate.vn';
    }
    const isLoopback =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '[::1]' ||
      host === '::1';
    if (
      !isLoopback &&
      parsed.port !== '' &&
      parsed.port !== '80' &&
      parsed.port !== '443'
    ) {
      return 'https://rate.vn';
    }
    if (
      !isLoopback &&
      (!host.includes('.') ||
        host.startsWith('[') ||
        host.endsWith('.localhost') ||
        host.endsWith('.local') ||
        host.endsWith('.internal') ||
        /^\d+(?:\.\d+){3}$/.test(host))
    ) {
      return 'https://rate.vn';
    }
    if (!parsed.origin || parsed.origin === 'null') {
      return 'https://rate.vn';
    }
    return parsed.origin;
  } catch {
    return 'https://rate.vn';
  }
}

function buildBaseRateOpenApiSpec(
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
      version: '1.8.0',
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
          'Real-time URL/SKU canonicalization, 10-platform hybrid lookup, evidence-based price verdict, and zero-trust quarantine ingestion.',
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
            'Queries `rate.master_products` with multi-dimensional filtering across category, brand, price range, RAM/storage options, refresh rate, 5G, IP rating, charging wattage, and JReviews weighted score. Each product carries its category spec view (earbuds have no screen, RAM or storage; watches show no 5G). A spec filter the category does not have, such as `has5g` on `smartwatches` or `ramGb` and `compactScreen` on `earbuds`, returns 400. On `all` such a filter keeps only products whose own category has it (`has5g=1` returns 5G phones, tablets and laptops, never watches or earbuds).',
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
              description:
                'Minimum display refresh rate in Hz (clamped to 30-1000; `highRefresh=true` means 120)',
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
              description:
                'Minimum battery capacity in mAh (clamped to 100-100000; `bigBattery=true` means 5000)',
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
                'Paginated list of standardized master products with optional facet counts. Each product carries its Deal Radar signal as `deal_radar`.',
              content: jsonBody({
                type: 'object',
                properties: {
                  ok: { type: 'boolean', example: true },
                  category: { type: 'string', example: 'smartphones' },
                  count: { type: 'integer' },
                  offset: { type: 'integer' },
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: true,
                      properties: {
                        slug: { type: 'string' },
                        deal_radar: RADAR_REF,
                        sale_state: {
                          $ref: '#/components/schemas/ProductSaleState',
                        },
                      },
                    },
                  },
                  facets: {
                    type: 'object',
                    description: 'Present only with `facets=true`.',
                  },
                },
              }),
            },
            '400': errorResponse(
              'Invalid category or price range, or a spec filter the category does not have.'
            ),
          },
        },
      },
      '/api/v1/rate/products/{slug}': {
        get: {
          operationId: 'getMasterProductBySlug',
          summary:
            'Get full master product detail, 10-group specs, offers, price history & AI reviews',
          description:
            'Returns the canonical master product record, full 10-group specification JSONB, cross-marketplace merchant offers (`rate.products`), price history series (`rate.price_history`), fake-sale discount analysis, the Deal Radar signal (`data.radarSignal`), and AI-audited user reviews.',
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
                'Full product detail payload with 10-group specs, offers, price history, review summary, AI-audited reviews and the Deal Radar signal (`data.radarSignal`).',
              content: jsonBody({
                type: 'object',
                properties: {
                  ok: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    additionalProperties: true,
                    properties: {
                      product: {
                        type: 'object',
                        additionalProperties: true,
                        properties: {
                          sale_state: {
                            $ref: '#/components/schemas/ProductSaleState',
                          },
                        },
                      },
                      offers: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/MerchantOffer' },
                      },
                      priceHistory: { type: ['object', 'null'] },
                      reviewSummary: {
                        anyOf: [
                          {
                            $ref: '#/components/schemas/ReviewAnalysisSummary',
                          },
                          { type: 'null' },
                        ],
                      },
                      reviews: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/ReviewItem' },
                      },
                      radarSignal: RADAR_DETAIL_REF,
                    },
                  },
                },
              }),
            },
            '400': errorResponse('Invalid product slug.'),
            '404': errorResponse(
              'Master product not found (`code: "NOT_FOUND"`).'
            ),
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
                'Side-by-side comparison matrix for up to 4 same-category models. Each product in `data` carries its Deal Radar signal as `deal_radar`.',
              content: jsonBody({
                type: 'object',
                properties: {
                  ok: { type: 'boolean', example: true },
                  count: { type: 'integer' },
                  locked_category: { type: ['string', 'null'] },
                  requested_slugs: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'The slugs read from `slugs`.',
                  },
                  excluded_cross_category_slugs: {
                    type: 'array',
                    items: { type: 'string' },
                    description:
                      'Published products left out by the Same-Category Comparison Lock (another category than the first product found).',
                  },
                  not_found_slugs: {
                    type: 'array',
                    items: { type: 'string' },
                    description:
                      'Requested slugs that match no published product.',
                  },
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: true,
                      properties: {
                        slug: { type: 'string' },
                        canonical_href: { type: 'string' },
                        deal_radar: RADAR_REF,
                        sale_state: {
                          $ref: '#/components/schemas/ProductSaleState',
                        },
                      },
                    },
                  },
                },
              }),
            },
            '400': errorResponse(
              'Missing or invalid `slugs` (give 1 to 4 comma-separated master product slugs).'
            ),
          },
        },
      },
      '/api/v1/rate/versus': {
        get: {
          operationId: 'getHeadToHeadVersusVerdict',
          summary:
            'Get programmatic 1v1 Head-to-Head JReviews verdict, 5-criteria scoreboard & price delta',
          description:
            'Evaluates two same-category master products (`?pair=<slugA>-vs-<slugB>` or `?slugA=...&slugB=...`) with optional persona/custom 5-criteria weights (`persona`, `w_screen`, `w_performance`, `w_camera`, `w_battery`, `w_value`) and returns the overall winner (with `is_tie` true when both scores are level at two decimals; `overall_winner` is then only the price or side-A tie-break), per-criterion head-to-head breakdown, price delta, Deal Radar signals (`deal_radar`), and 10-group specs.',
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
              content: jsonBody({
                type: 'object',
                additionalProperties: true,
                properties: {
                  ok: { type: 'boolean', example: true },
                  category: { type: 'string' },
                  versus_pair: { type: 'string' },
                  is_tie: { type: 'boolean' },
                  overall_winner: { type: 'object' },
                  price_comparison: { type: 'object' },
                  criteria_head_to_head: { type: 'array' },
                  deal_radar: {
                    type: 'object',
                    properties: {
                      productA: RADAR_REF,
                      productB: RADAR_REF,
                    },
                  },
                  product_a: {
                    type: 'object',
                    additionalProperties: true,
                    properties: {
                      slug: { type: 'string' },
                      deal_radar: RADAR_REF,
                      radar_signal: RADAR_REF,
                    },
                  },
                  product_b: {
                    type: 'object',
                    additionalProperties: true,
                    properties: {
                      slug: { type: 'string' },
                      deal_radar: RADAR_REF,
                      radar_signal: RADAR_REF,
                    },
                  },
                },
              }),
            },
            '400': errorResponse('Missing or invalid 1v1 pair parameters.'),
            '404': errorResponse(
              'Products not found or violated Same-Category Comparison Lock. The body adds `requested_pair` (the two slugs asked for).'
            ),
          },
        },
      },
      '/api/v1/rate/watchlist': {
        get: {
          operationId: 'getWatchlistProducts',
          summary:
            'Fetch real-time price, Deal Radar signal & fake-sale verdict status for watched products',
          description:
            'Batch-fetches current lowest prices, best offer, store coverage and the Deal Radar signal (`deal_radar` export fields and the full `radar_signal`) for up to 20 watched product slugs. `items` is an object keyed by the slug asked for; a slug that matches no product is left out. Without `slugs` the answer is `{ ok: true, count: 0, items: {} }`.',
          tags: ['Comparison & Watchlist'],
          parameters: [
            {
              name: 'slugs',
              in: 'query',
              description:
                'Comma-separated list of up to 20 watched product slugs (none: an empty `items`)',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description:
                'Live watchlist status keyed by slug, each item with `deal_radar` and `radar_signal`.',
              content: jsonBody({
                type: 'object',
                properties: {
                  ok: { type: 'boolean', example: true },
                  count: { type: 'integer' },
                  items: {
                    type: 'object',
                    description: 'Watchlist items keyed by the requested slug.',
                    additionalProperties: {
                      $ref: '#/components/schemas/WatchlistItem',
                    },
                  },
                },
              }),
            },
          },
        },
        post: {
          operationId: 'registerWatchlistPriceAlert',
          summary:
            'Register a target price alert for a canonical master product (`rate.upsert_price_alert`)',
          description:
            "Upserts the signed-in user's price alert threshold in VND (`targetPrice`) for a watched master product and returns the latest `data.deal_radar` and `data.radar_signal` snapshot. Requires a Supabase access token; alerts are keyed to the account and notify the account's own email. `persistedInCloud: false` means `rate.upsert_price_alert` is not deployed in this environment and nothing was stored.",
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
                'Registered price alert confirmation with the current product `data.deal_radar` and `data.radar_signal`.',
              content: jsonBody({
                type: 'object',
                properties: {
                  ok: { type: 'boolean', example: true },
                  persistedInCloud: { type: 'boolean' },
                  data: {
                    type: 'object',
                    additionalProperties: true,
                    properties: {
                      best_offer: { type: ['object', 'null'] },
                      offer_platforms: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                      deal_radar: RADAR_REF,
                      radar_signal: RADAR_DETAIL_REF,
                    },
                  },
                },
              }),
            },
            '400': errorResponse('Invalid body (`code: "INVALID_BODY"`).'),
            '401': errorResponse('Missing or invalid access token.'),
            '403': errorResponse(
              'Guest (anonymous) sign-ins and cross-site cookie requests cannot save alerts.'
            ),
            '404': errorResponse('Master product not found.'),
            '422': errorResponse(
              'An Item slug with several sizes (`code: "SIZE_REQUIRED"`), or an account without a confirmed email (`code: "EMAIL_NOT_VERIFIED"`).'
            ),
            '429': errorResponse(
              'More than 100 active alerts (`code: "RATE_LIMITED"`).'
            ),
            '502': errorResponse(
              'The alert could not be stored (database error); nothing was saved.'
            ),
          },
        },
      },
      '/api/v1/rate/lookup': {
        get: {
          operationId: 'lookupEcommerceUrlOrQuery',
          summary:
            'Parse e-commerce URL or model query and match against master products & merchants',
          description:
            'Extracts platform, shopId, itemId, or model keywords from an e-commerce URL or query string and returns the matched master product, merchant trust profile, and the product-level Deal Radar signal (`data.radarSignal`, null when no product matched). One of `q` or `url` is required. Limited to 30 requests per minute per client IP (shared with `/inspect`, counted on each server instance); past it the answer is 429 with `Retry-After`.',
          tags: ['URL Inspector & Extension MV3'],
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: false,
              description:
                'E-commerce product URL or model search query (e.g. https://shopee.vn/product/88201679/27110898667). One of `q` or `url` is required.',
              schema: { type: 'string' },
            },
            {
              name: 'url',
              in: 'query',
              required: false,
              description:
                'Alternative to `q`: an e-commerce product or shop URL. Read only when `q` is absent.',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description:
                'Parsed URL metadata, matched master product, offers, merchant audit summary, and `data.radarSignal`.',
              content: jsonBody({
                type: 'object',
                properties: {
                  ok: { type: 'boolean', example: true },
                  data: { $ref: '#/components/schemas/InspectionResult' },
                },
              }),
            },
            '400': errorResponse('Neither `q` nor `url` was given.'),
            '429': inspectRateLimitedResponse(),
          },
        },
      },
      '/api/v1/rate/inspect': {
        get: {
          operationId: 'inspectProductUrlAndVerdict',
          summary:
            'Full Web Product & URL Inspector with price verdict and price history chart',
          description:
            'Runs the complete hybrid lookup pipeline for the `/inspect` web portal: canonicalizes 10 supported e-commerce/retailer platforms, blocks non-hardware accessories, resolves SKU variant capacity, computes the price verdict (`PriceVerdictLevel`), and returns full product detail with the Deal Radar signal (`data.radarSignal`, null when no product matched). One of `q` or `url` is required. Limited to 30 requests per minute per client IP (shared with `/lookup`, counted on each server instance); past it the answer is 429 with `Retry-After`.',
          tags: ['URL Inspector & Extension MV3'],
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: false,
              description:
                'E-commerce URL or product model name to inspect. One of `q` or `url` is required.',
              schema: { type: 'string' },
            },
            {
              name: 'url',
              in: 'query',
              required: false,
              description:
                'Alternative to `q`: an e-commerce product or shop URL. Read only when `q` is absent.',
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
                'Complete inspection payload: the lookup result plus `canonicalUrl`, the accessory `gatekeeper`, the `priceVerdict` (`PriceVerdictLevel`) and `radarSignal`, all under `data`.',
              content: jsonBody({
                type: 'object',
                properties: {
                  ok: { type: 'boolean', example: true },
                  data: {
                    allOf: [
                      { $ref: '#/components/schemas/InspectionResult' },
                      {
                        type: 'object',
                        properties: {
                          canonicalUrl: { type: ['string', 'null'] },
                          gatekeeper: {
                            type: 'object',
                            properties: {
                              isAccessory: { type: 'boolean' },
                              reason: { type: ['string', 'null'] },
                            },
                          },
                          priceVerdict: {
                            type: 'object',
                            additionalProperties: true,
                            properties: {
                              verdict: {
                                $ref: '#/components/schemas/PriceVerdictLevel',
                              },
                            },
                          },
                          radarSignal: {
                            anyOf: [RADAR_DETAIL_REF, { type: 'null' }],
                          },
                        },
                      },
                    ],
                  },
                },
              }),
            },
            '400': errorResponse('Neither `q` nor `url` was given.'),
            '429': inspectRateLimitedResponse(),
          },
        },
      },
      '/api/v1/rate/extension/lookup': {
        get: {
          operationId: 'extensionHybridLookup',
          summary:
            'Low-latency Hybrid Lookup for Rate Browser Extension Manifest V3',
          description:
            'Dedicated read-only lookup endpoint for the Rate Browser Extension MV3 across 10 platforms (`shopee`, `lazada`, `tiki`, `tiktok`, `cellphones`, `tgdd`, `fptshop`, `hoangha`, `didongviet`, `phongvu`). Performs deterministic `platform_item_id` lookup, canonical model fallback, accessory gatekeeping, price verdict calculation (`PriceVerdictLevel`), and returns the Deal Radar signal as `data.radarSignal`.',
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
                'Extension lookup verdict, matched master product, `data.radarSignal`, cross-marketplace offers, and merchant trust summary.',
              content: jsonBody({
                type: 'object',
                properties: {
                  ok: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    additionalProperties: true,
                    properties: {
                      matchStatus: { type: 'string' },
                      platform: { type: ['string', 'null'] },
                      canonicalUrl: { type: ['string', 'null'] },
                      priceAssessment: { type: 'object' },
                      masterProduct: { type: ['object', 'null'] },
                      allOffers: { type: 'array', items: { type: 'object' } },
                      merchantProfile: {
                        anyOf: [MERCHANT_REF, { type: 'null' }],
                      },
                      radarSignal: {
                        anyOf: [RADAR_DETAIL_REF, { type: 'null' }],
                      },
                      data: {
                        type: 'object',
                        properties: {
                          priceAssessment: {
                            type: 'object',
                            description:
                              'Price verdict. `badgeLabel` and `explanation` are Vietnamese; `messageKey` and `messageParams` let a client show the same text in its own language (DOS/Rate#1326).',
                            properties: {
                              verdict: {
                                $ref: '#/components/schemas/PriceVerdictLevel',
                              },
                              badgeLabel: { type: 'string' },
                              explanation: { type: 'string' },
                              messageKey: {
                                type: 'string',
                                description:
                                  'Absent when an accessory reason is free text.',
                                enum: [
                                  'accessory',
                                  'accessory_keyword',
                                  'accessory_price_floor',
                                  'ambiguous_variant',
                                  'implausibly_low',
                                  'insufficient_history',
                                  'fake_discount',
                                  'genuine_deal',
                                  'above_market',
                                  'fair_market',
                                ],
                              },
                              messageParams: {
                                type: 'object',
                                description:
                                  'The values the text interpolates: prices in VND and percentages as numbers, plus `keyword` (string) for `accessory_keyword`.',
                                additionalProperties: {
                                  oneOf: [
                                    { type: 'number' },
                                    { type: 'string' },
                                  ],
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              }),
            },
            '400': errorResponse(
              'None of `url`, `title` or `externalId` was given. The body adds `capabilities` (the platform capability matrix).'
            ),
            '429': rateLimitedResponse(
              'Per-IP sliding-window rate limit exceeded (max 60 requests/min, counted on each server instance).'
            ),
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
            '400': errorResponse(
              'Rejected by Zero-Trust Quarantine Validator. The body adds `details` (the validation issues).'
            ),
            '429': rateLimitedResponse(
              'Rate limit exceeded: a best-effort per-IP limit of 15 signals/min, counted separately on each server instance. The global cap of 120 crowd jobs/min is reported as a 200 with `jobState: "queue_error"`.'
            ),
          },
        },
      },
      '/api/v1/rate/merchants': {
        get: {
          operationId: 'listMerchants',
          summary:
            'List e-commerce merchants with Dual Risk Score (DOSafe + AI Seeding Risk)',
          description:
            'Returns verified merchants (`rate.merchants`) with filter support for platform, Official Mall status, minimum trust score, search query, and sorting. `risk_score` is the combined risk; `review_risk_score` is only the part measured on reviews, null for a store with no analysed review.',
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
              content: jsonBody({
                type: 'object',
                properties: {
                  ok: { type: 'boolean', example: true },
                  count: { type: 'integer' },
                  data: { type: 'array', items: MERCHANT_REF },
                },
              }),
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
            'Returns one page (`items`, `matched`, `offset`) of the `/merchants` directory filtered by search query, platform, Official Mall status, trust risk tier (`safe`, `moderate`, `warning`), AI seeding tier (`low`, `elevated`), and sort order. `risk_score` is the combined risk; `review_risk_score` is only the part measured on reviews, null for a store with no analysed review.',
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
                'AI seeding risk tier (`all`, `low` <= 15, `elevated` > 15). Stores with no analysed reviews match neither tier.',
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
              content: jsonBody({
                type: 'object',
                properties: {
                  ok: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      items: { type: 'array', items: MERCHANT_REF },
                      matched: {
                        type: 'integer',
                        description: 'Stores matching the filters.',
                      },
                      offset: { type: 'integer' },
                    },
                  },
                },
              }),
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
            'Fetches a single merchant by UUID, slug, or `platform_shop_id` along with its active marketplace listings and AI review seeding distribution. `risk_score` is the combined risk; `review_risk_score` is only the part measured on reviews, null for a store with no analysed review.',
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
              content: jsonBody({
                type: 'object',
                properties: {
                  ok: { type: 'boolean', example: true },
                  data: {
                    allOf: [
                      MERCHANT_REF,
                      {
                        type: 'object',
                        properties: {
                          listings: {
                            type: 'array',
                            items: { type: 'object' },
                          },
                          recent_reviews: {
                            type: 'array',
                            items: { type: 'object' },
                          },
                        },
                      },
                    ],
                  },
                },
              }),
            },
            '400': errorResponse('Invalid merchant identifier.'),
            '404': errorResponse('Merchant not found (`code: "NOT_FOUND"`).'),
          },
        },
      },
      '/api/v1/rate/reviews': {
        get: {
          operationId: 'listProductReviews',
          summary: 'List AI-audited reviews for a master product',
          description:
            'Returns user and marketplace reviews for a given `masterProductId` or `slug` (one of them is required), with the AI audit of each review (`verdict`, `fake_probability`, `flag_category`) and the product review summary.',
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
              content: jsonBody({
                type: 'object',
                properties: {
                  ok: { type: 'boolean', example: true },
                  masterProductId: { type: 'string', format: 'uuid' },
                  count: {
                    type: 'integer',
                    description:
                      'Reviews in `data` (after `hideFake` and `limit`).',
                  },
                  totalCount: {
                    type: 'integer',
                    description:
                      'Reviews read for the product before `hideFake` and `limit`: the newest, at most 50.',
                  },
                  summary: {
                    anyOf: [
                      { $ref: '#/components/schemas/ReviewAnalysisSummary' },
                      { type: 'null' },
                    ],
                  },
                  data: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/ReviewItem' },
                  },
                },
              }),
            },
            '400': errorResponse(
              'Neither `slug` nor a valid `masterProductId` was given.'
            ),
            '404': errorResponse(
              'Product not found, or not published (`code: "NOT_FOUND"`).'
            ),
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
            '400': errorResponse('Invalid body or rejected by the RPC.'),
            '401': errorResponse('Missing or invalid access token.'),
            '403': errorResponse(
              'Guest (anonymous) sign-ins and cross-site cookie requests cannot submit reviews.'
            ),
            '409': errorResponse('This user already reviewed the product.'),
            '429': rateLimitedResponse(
              'More than 5 reviews by this user in 24 hours.',
              86_400
            ),
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
            '400': errorResponse(
              'Invalid review id or body, or the database rejected the vote (`code: "VOTE_REJECTED"`).'
            ),
            '401': errorResponse('Missing or invalid bearer token.'),
            '403': errorResponse(
              'Voter account is ineligible (< 7 days old or unverified contact).'
            ),
            '429': rateLimitedResponse(
              'Rate limit exceeded (maximum 60 vote actions per hour).',
              3600
            ),
            '404': errorResponse('Review not found.'),
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
                'Canonical category slug (`smartphones`, `tablets`, `laptops`, `smartwatches`, `earbuds`, or `all`). `cat` is accepted as an alias.',
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
              name: 'q',
              in: 'query',
              description:
                'Case-insensitive text filter on the ranked products (name, brand, model, slug, model key, chip, screen), up to 160 characters.',
              schema: { type: 'string' },
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
                '4-Tier JReviews Leaderboard ranking with Top 3 Podium, per-item `deal_radar` and `radar_signal` (both the four export fields) under `data.items`, and Same-Category compare URL. The same payload is also repeated at the top level (`items`, `category`, ...) for older clients; read it from `data` (DOS/Rate#1377).',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean', example: true },
                      ...leaderboardTopLevelMirror(),
                      data: {
                        type: 'object',
                        properties: LEADERBOARD_PAYLOAD_PROPERTIES,
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
            '400': errorResponse(
              'Malformed JSON or empty revalidation target lists.'
            ),
            '401': errorResponse(
              'Missing or invalid `RATE_REVALIDATE_SECRET` token.'
            ),
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
            'Returns service metadata (`status`, `service: "rate-web"`, `version`, ISO-8601 `timestamp`, `commit`: the Git SHA the deployment was built from, or null outside Vercel) and `checks.database`, the result of a small read with the app\'s own database client (3 s timeout, reused for up to 15 s per instance), with `Cache-Control: no-store, max-age=0` for load balancers and uptime monitors.',
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
          // The values the answers carry (DOS/Rate#1377).
          enum: [...EXTENSION_PRICE_VERDICTS],
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
        ProductSaleState: {
          type: 'string',
          enum: [
            'on_sale',
            'sold_out',
            'discontinued',
            'coming_soon',
            'not_listed',
            'no_stock',
          ],
          description:
            'Whether the model can be bought in Vietnam now: `on_sale` (an in-stock price), `discontinued` / `coming_soon` (curated, or from the launch status when no store has stock), `sold_out` (stores list it, none in stock), `not_listed` (no store lists it), `no_stock` (no in-stock store; whether any store lists it is not known, as in list bodies).',
        },
        ProductDealRadarSignal: {
          type: 'object',
          required: ['verdict', 'savingsPct', 'fakeMarkupPct', 'spreadPct'],
          description:
            'Product-level Deal Radar signal: the four export fields. Carried as `deal_radar` on list, compare, versus, leaderboard and watchlist items (and as `radar_signal` on leaderboard items and the versus products). The detail, lookup, inspect and extension lookup answers carry the fuller `ProductDealRadarSignalDetail` as `data.radarSignal`.',
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
        ProductDealRadarSignalDetail: {
          description:
            'The full Deal Radar signal: the four export fields plus the radar entries behind them, each null when the product is not on that list.',
          allOf: [
            RADAR_REF,
            {
              type: 'object',
              required: ['genuineDeal', 'fakeSaleTrap', 'priceSpread'],
              properties: {
                genuineDeal: {
                  type: ['object', 'null'],
                  description:
                    'The genuine-deal entry (cheapest store below the cross-retailer median).',
                },
                fakeSaleTrap: {
                  type: ['object', 'null'],
                  description:
                    'The fake-sale-trap entry (inflated original price).',
                },
                priceSpread: {
                  type: ['object', 'null'],
                  description: 'The cross-store price spread entry.',
                },
              },
            },
          ],
        },
        ApiError: {
          type: 'object',
          required: ['ok', 'error'],
          additionalProperties: true,
          description:
            'Every 4xx body. Some answers add fields: `/versus` 404 adds `requested_pair`, `/extension/lookup` 400 adds `capabilities`, `/extension/ingest` 400 adds `details`.',
          properties: {
            ok: { type: 'boolean', const: false, example: false },
            error: {
              type: 'string',
              example: 'Product not found',
            },
            code: {
              type: 'string',
              description:
                'Machine-readable cause when there is one, e.g. `NOT_FOUND` on 404s and `RATE_LIMIT_EXCEEDED` on the `/lookup`, `/inspect`, `/extension/lookup` and `/extension/ingest` 429.',
              example: 'NOT_FOUND',
            },
          },
        },
        MerchantOffer: {
          type: 'object',
          additionalProperties: true,
          description:
            'A marketplace listing of the product (`rate.products`) with its seller.',
          properties: {
            id: { type: 'string' },
            platform: { type: 'string' },
            title: { type: 'string' },
            price_current: { type: 'number' },
            price_original: { type: ['number', 'null'] },
            url: { type: 'string' },
            merchant: {
              type: ['object', 'null'],
              additionalProperties: true,
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                is_official: { type: 'boolean' },
                risk_score: { type: 'number', minimum: 0, maximum: 100 },
                dosafe_risk_score: {
                  type: ['number', 'null'],
                  minimum: 0,
                  maximum: 100,
                },
                review_risk_score: {
                  type: ['integer', 'null'],
                  minimum: 0,
                  maximum: 100,
                  description:
                    'Risk measured on the seller reviews only; null for a seller with no analysed review, as the merchant endpoints answer (DOS/Rate#1376).',
                },
              },
            },
          },
        },
        MerchantSummary: {
          type: 'object',
          additionalProperties: true,
          description:
            'A merchant trust profile, as `/merchants`, `/merchants/directory`, `/merchants/{id}` and the lookup `merchantProfile` carry it.',
          properties: {
            id: { type: 'string', format: 'uuid' },
            platform: { type: 'string' },
            platform_shop_id: { type: 'string' },
            name: { type: 'string' },
            slug: { type: ['string', 'null'] },
            url: { type: ['string', 'null'] },
            is_official: { type: 'boolean' },
            rating_star: { type: ['number', 'null'] },
            follower_count: { type: 'integer' },
            location: { type: ['string', 'null'] },
            dosafe_risk_score: {
              type: ['number', 'null'],
              minimum: 0,
              maximum: 100,
              description:
                'DOSafe scam risk; null for a seller with no DOSafe score (DOS/Rate#1465).',
            },
            review_risk_score: {
              type: ['integer', 'null'],
              minimum: 0,
              maximum: 100,
              description:
                'Risk measured on the store reviews only; null for a store with no analysed review.',
            },
            risk_score: {
              type: ['number', 'null'],
              minimum: 0,
              maximum: 100,
              description:
                'Combined risk from the known signals (DOSafe score, analysed reviews); may carry decimals. Null when neither is known (DOS/Rate#1484).',
            },
            trust_score: {
              type: ['number', 'null'],
              minimum: 0,
              maximum: 100,
              description:
                '100 minus `risk_score`. Null for a store with neither a DOSafe score nor analysed reviews; such stores sort last by trust and count in no risk tier (DOS/Rate#1484).',
            },
            product_count: { type: 'integer' },
            min_price: { type: ['number', 'null'] },
            max_price: { type: ['number', 'null'] },
            review_risk_breakdown: { type: ['object', 'null'] },
            updated_at: { type: ['string', 'null'], format: 'date-time' },
          },
        },
        WatchlistItem: {
          type: 'object',
          additionalProperties: true,
          properties: {
            master_product_id: { type: 'string', format: 'uuid' },
            slug: { type: 'string' },
            product_href: {
              type: 'string',
              description:
                'The product page in its own category (e.g. `/laptops/<slug>`), for a link that never takes a 308 hop.',
            },
            name: { type: 'string' },
            brand: { type: 'string' },
            current_min_price: { type: 'number' },
            current_max_price: { type: 'number' },
            merchant_count: { type: 'integer' },
            platform_count: { type: 'integer' },
            offer_platforms: { type: 'array', items: { type: 'string' } },
            best_offer: { type: ['object', 'null'] },
            deal_radar: RADAR_REF,
            radar_signal: RADAR_DETAIL_REF,
            size_required: {
              type: 'boolean',
              description:
                'Present (true) when an Item slug with several sizes is watched at its default size.',
            },
          },
        },
        InspectionResult: {
          type: 'object',
          additionalProperties: true,
          description:
            'What `/lookup` answers under `data`, and the base of the `/inspect` answer.',
          properties: {
            query: { type: 'string' },
            matchedType: {
              type: 'string',
              enum: [
                'product_listing',
                'master_product',
                'merchant',
                'search_suggestions',
                'not_found',
              ],
            },
            parsedUrl: { type: 'object' },
            masterProduct: { type: ['object', 'null'] },
            matchedOffer: { type: ['object', 'null'] },
            allOffers: { type: 'array', items: { type: 'object' } },
            discountAnalysis: { type: ['object', 'null'] },
            priceHistory: { type: ['object', 'null'] },
            reviewSummary: {
              anyOf: [
                { $ref: '#/components/schemas/ReviewAnalysisSummary' },
                { type: 'null' },
              ],
            },
            merchantProfile: { anyOf: [MERCHANT_REF, { type: 'null' }] },
            suggestions: { type: 'array', items: { type: 'object' } },
            radarSignal: { anyOf: [RADAR_DETAIL_REF, { type: 'null' }] },
          },
        },
        ReviewAnalysisSummary: {
          type: 'object',
          additionalProperties: true,
          properties: {
            total_analyzed: { type: 'integer' },
            authentic_pct: { type: 'number' },
            suspicious_pct: { type: 'number' },
            fake_pct: { type: 'number' },
            pros: { type: 'array', items: { type: 'string' } },
            cons: { type: 'array', items: { type: 'string' } },
            ai_summary: { type: ['string', 'null'] },
          },
        },
        ReviewItem: {
          type: 'object',
          additionalProperties: true,
          properties: {
            id: { type: 'string', format: 'uuid' },
            author_name: { type: 'string' },
            rating_star: { type: 'number' },
            comment: { type: 'string' },
            variation: { type: ['string', 'null'] },
            created_at: { type: 'string', format: 'date-time' },
            reviewer_type: { type: 'string', enum: ['user', 'expert'] },
            upvotes: { type: 'integer' },
            downvotes: { type: 'integer' },
            report_count: { type: 'integer' },
            include_in_rating: { type: 'boolean' },
            criteria_ratings: {
              type: 'object',
              additionalProperties: { type: 'number' },
            },
            verdict: {
              type: ['string', 'null'],
              enum: ['authentic', 'suspicious', 'fake', 'unanalyzed', null],
            },
            fake_probability: { type: ['number', 'null'] },
            flag_category: {
              type: 'string',
              enum: [
                'authentic',
                'low_value_coin_spam',
                'seeding_fake',
                'competitor_sabotage',
                'review_bombing',
              ],
            },
            reason: { type: ['string', 'null'] },
          },
        },
      },
    },
  };
}

/**
 * The OpenAPI document. The Item model's parameters, fields and schemas are
 * documented only while `RATE_ITEM_MODEL` is on, so with the flag off the
 * document is exactly as before (DOS/Rate#1158).
 */
export function buildRateOpenApiSpec(
  ...args: Parameters<typeof buildBaseRateOpenApiSpec>
): RateOpenApiDocument {
  const spec = buildBaseRateOpenApiSpec(...args);
  return isItemModelOn() ? withItemModelDocs(spec) : spec;
}

type JsonObject = Record<string, unknown>;

const responseSchema = (op: OpenApiOperation | undefined): JsonObject | null =>
  (op?.responses['200']?.content?.['application/json']?.schema as
    JsonObject | undefined) ?? null;

const propertiesOf = (schema: JsonObject | null): JsonObject | null =>
  schema && typeof schema.properties === 'object' && schema.properties
    ? (schema.properties as JsonObject)
    : null;

/** Adds the Item model's API v1 surface to the document (design doc 5.2). */
export function withItemModelDocs(
  spec: RateOpenApiDocument
): RateOpenApiDocument {
  const list = spec.paths['/api/v1/rate/products']?.get;
  if (list) {
    const params = list.parameters ?? [];
    const at = params.findIndex((p) => p.name === 'sort');
    params.splice(at < 0 ? params.length : at, 0, {
      name: 'group',
      in: 'query',
      description:
        'Set to `item` to list Items (one row per product line, with its size variants) instead of variants. Takes `category`, `brands`, `q`, `minPrice`, `maxPrice` (on the Item "from" price) and the price, merchant and newest sorts; spec filters and `rating_desc` answer 400. The default stays `variant`.',
      schema: { type: 'string', enum: ['variant', 'item'], default: 'variant' },
    });
    list.parameters = params;
    const ok = list.responses['200'];
    if (ok) {
      ok.description = `${ok.description} With \`group=item\`: \`group\` is \`item\` and \`data\` holds \`RateItem\` rows, each with \`variants\` (\`RateItemVariant[]\`).`;
    }
  }

  const detail = spec.paths['/api/v1/rate/products/{slug}']?.get;
  if (detail) {
    const slug = detail.parameters?.find((p) => p.name === 'slug');
    if (slug) {
      slug.description =
        'Product slug (e.g. apple-iphone-16-128gb) or Item slug (e.g. apple-iphone-16).';
    }
    detail.parameters = [
      ...(detail.parameters ?? []),
      {
        name: 'v',
        in: 'query',
        description:
          'The variant key to answer with (e.g. `256gb`). Without it, an old variant slug answers its own size and an Item slug its default variant.',
        schema: { type: 'string' },
      },
    ];
    const data = propertiesOf(
      (propertiesOf(responseSchema(detail))?.data as JsonObject) ?? null
    );
    if (data) {
      const product = data.product as JsonObject | undefined;
      if (product) {
        product.description =
          "The selected variant (`?v=`, the slug's own size, else the Item's default).";
      }
      data.item = { $ref: '#/components/schemas/RateItem' };
      data.variants = {
        type: 'array',
        description: 'Every published size of the Item.',
        items: { $ref: '#/components/schemas/RateItemVariant' },
      };
      data.selected_variant = {
        type: 'string',
        description: 'The variant key `product` is.',
      };
      data.unknown_variant_offers = {
        type: 'array',
        description:
          'Offers of the Item whose listing states no size, in the same shape as `offers`. They never feed a variant price.',
        items: { $ref: '#/components/schemas/MerchantOffer' },
      };
    }
  }

  const lookup = spec.paths['/api/v1/rate/extension/lookup']?.get;
  // The lookup fields sit under `data`, as the route answers them.
  const lookupProps = propertiesOf(
    (propertiesOf(responseSchema(lookup))?.data as JsonObject) ?? null
  );
  if (lookupProps) {
    lookupProps.item = { $ref: '#/components/schemas/RateItem' };
    lookupProps.selectedVariant = {
      type: ['string', 'null'],
      description:
        "The variant key of the size the listing or page states, or of the Item's only variant; null when it is not known (`matchStatus` is then `ambiguous_variant` when the Item has several sizes). `variantCandidates` lists the Item's sized variants, empty for a category without storage.",
    };
  }

  spec.components.schemas.RateItem = {
    type: 'object',
    description:
      'A product line across its sizes. Prices are "from" prices over its published variants; counts include listings with no stated size.',
    properties: {
      id: { type: 'string', format: 'uuid' },
      item_key: { type: 'string', example: 'apple:iphone-16' },
      slug: { type: 'string', example: 'apple-iphone-16' },
      name: { type: 'string' },
      brand: { type: 'string' },
      model: { type: 'string' },
      category_id: { type: ['string', 'null'], format: 'uuid' },
      min_price: { type: 'number' },
      max_price: { type: 'number' },
      price_variant_count: { type: 'integer' },
      merchant_count: { type: 'integer' },
      listing_count: { type: 'integer' },
      unknown_variant_listing_count: { type: 'integer' },
    },
  };
  spec.components.schemas.RateItemVariant = {
    type: 'object',
    description: 'One size of an Item.',
    properties: {
      id: { type: 'string', format: 'uuid' },
      slug: { type: 'string', example: 'apple-iphone-16-256gb' },
      name: { type: 'string' },
      variant_key: { type: 'string', example: '256gb' },
      variant_name: { type: ['string', 'null'] },
      storage_gb: { type: ['integer', 'null'] },
      min_price: { type: 'number' },
      max_price: { type: 'number' },
      merchant_count: { type: 'integer' },
    },
  };
  return spec;
}
