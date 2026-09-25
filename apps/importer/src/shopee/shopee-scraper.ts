import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { ShopeeCaptchaSolver } from './shopee-captcha-solver.js';
import { ProxyManager, ProxyConfig } from './proxy-manager.js';

export interface ShopeeProduct {
  itemId: string;
  shopId: string;
  url: string;
  title: string;
  description?: string;
  priceMin: number;
  priceMax: number;
  priceBeforeDiscount?: number;
  currency: string;
  historicalSold: number;
  stock: number;
  ratingStar: number;
  ratingCount: number;
  ratingScoreDistribution?: number[];
  images: string[];
  models: Array<{
    modelId: string;
    name: string;
    price: number;
    stock: number;
    sku?: string;
  }>;
  attributes: Array<{
    name: string;
    value: string;
  }>;
  shop: {
    shopId: string;
    name: string;
    isMall: boolean;
    ratingStar?: number;
    followerCount?: number;
    location?: string;
  };
  reviews: ShopeeReview[];
}

export interface ShopeeReview {
  reviewId: string;
  author: string;
  authorAvatar?: string;
  ratingStar: number;
  comment: string;
  variation?: string;
  createdAt: string;
  images: string[];
  videos?: string[];
  sellerReply?: string;
}

export interface ShopeeScraperOptions {
  cdpEndpoint?: string; // e.g. 'http://localhost:9222'
  proxy?: Partial<ProxyConfig> | boolean;
  autoRotateOnBlock?: boolean;
  headless?: boolean;
  timeoutMs?: number;
  maxReviews?: number;
}

export class ShopeeScraper {
  private cdpEndpoint: string;
  private timeoutMs: number;
  private maxReviews: number;
  private captchaSolver: ShopeeCaptchaSolver;
  private proxyManager: ProxyManager | null = null;
  private autoRotateOnBlock: boolean;

  constructor(options: ShopeeScraperOptions = {}) {
    this.cdpEndpoint = options.cdpEndpoint || 'http://localhost:9222';
    this.timeoutMs = options.timeoutMs || 30000;
    this.maxReviews = options.maxReviews || 20;
    this.captchaSolver = new ShopeeCaptchaSolver();
    this.autoRotateOnBlock = options.autoRotateOnBlock ?? true;
    if (options.proxy) {
      this.proxyManager = new ProxyManager(typeof options.proxy === 'object' ? options.proxy : {});
    }
  }

  public getProxyManager(): ProxyManager | null {
    return this.proxyManager;
  }

  public async rotateProxyIp(): Promise<{ success: boolean; newIp?: string }> {
    if (this.proxyManager) {
      return await this.proxyManager.rotateIp();
    }
    return { success: false };
  }

  /**
   * Parse shopId and itemId from a Shopee URL
   */
  public parseShopeeUrl(rawUrl: string): { shopId: string; itemId: string } | null {
    try {
      const match = rawUrl.match(/(?:a-)?i\.(\d+)\.(\d+)/);
      if (match) {
        return { shopId: match[1], itemId: match[2] };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Convert Shopee raw price unit (often in 100,000ths) to actual VND
   */
  private normalizePrice(raw: number | string | undefined): number {
    const num = Number(raw || 0);
    if (!num) return 0;
    // Shopee raw prices often have multiplier 100,000 (e.g. 4500000000 -> 45,000 VND)
    if (num > 1e10) return Math.round(num / 100000);
    if (num > 1e9) return Math.round(num / 1000);
    if (num > 1e7) return Math.round(num / 100000);
    return num;
  }

  /**
   * Scrape a Shopee product using Chrome CDP (bypasses Akamai WAF & af-ac-enc-dat tokens)
   */
  public async scrapeProduct(productUrl: string): Promise<ShopeeProduct> {
    console.log(`[ShopeeScraper] Connecting to Chrome via CDP: ${this.cdpEndpoint}`);
    
    let browser: Browser;
    try {
      browser = await chromium.connectOverCDP(this.cdpEndpoint);
    } catch (err: any) {
      throw new Error(
        `Failed to connect to Chrome at ${this.cdpEndpoint}. Make sure Chrome is running with --remote-debugging-port=9222. Details: ${err.message}`
      );
    }

    const contexts = browser.contexts();
    if (contexts.length === 0) {
      throw new Error('No active browser context found in connected Chrome.');
    }
    const context = contexts[0];

    // Set proxy authentication if proxy is configured
    if (this.proxyManager) {
      const creds = this.proxyManager.getCredentials();
      if (creds.username) {
        await context.setHTTPCredentials(creds);
      }
    }

    // Create a new tab for scraping to avoid disturbing user's tabs
    const page = await context.newPage();

    try {
      console.log(`[ShopeeScraper] Navigating to: ${productUrl}`);

      let pdpData: any = null;
      let ratingsData: any[] = [];

      // Hook network responses to capture internal Shopee API payloads natively
      page.on('response', async (res) => {
        const url = res.url();
        try {
          if (url.includes('/api/v4/pdp/get_pc') || url.includes('/api/v4/item/get') || url.includes('/api/v4/item/get_pc')) {
            console.log('[ShopeeScraper] Intercepted PDP API response:', url.slice(0, 100));
            const json = await res.json();
            console.log('[ShopeeScraper] Intercepted PDP JSON payload:', JSON.stringify(json).slice(0, 300));
            if (json && (json.data || json.item)) {
              pdpData = json.data || json;
            }
          }
          if (url.includes('rating') || url.includes('review')) {
            console.log('[ShopeeScraper] Detected rating/review response:', url.slice(0, 100));
            const json = await res.json();
            console.log('[ShopeeScraper] Rating response payload sample:', JSON.stringify(json).slice(0, 300));
            const list = json?.data?.ratings || json?.data?.list || json?.ratings || json?.list;
            if (Array.isArray(list) && list.length > 0) {
              ratingsData.push(...list);
              console.log(`[ShopeeScraper] Intercepted ${list.length} reviews`);
            }
          }
        } catch {
          // Ignore JSON parse errors for non-JSON or aborted requests
        }
      });

      // Navigate to product page
      await page.goto(productUrl, {
        waitUntil: 'domcontentloaded',
        timeout: this.timeoutMs,
      });

      // Auto-detect and solve Captcha if Shopee challenges the session
      if (await this.captchaSolver.detect(page)) {
        console.log('[ShopeeScraper] Captcha challenge detected on page load! Attempting auto-solve...');
        const solved = await this.captchaSolver.solve(page);
        if (solved) {
          console.log('[ShopeeScraper] Captcha solved. Waiting for session to settle...');
          await page.waitForTimeout(2500);
        } else {
          console.warn('[ShopeeScraper] Auto-solve unsuccessful or captcha requires cooldown.');
          if (this.proxyManager && this.autoRotateOnBlock) {
            console.log('[ShopeeScraper] Rotating 4G Proxy IP to bypass Shopee captcha cooldown...');
            await this.proxyManager.rotateIp();
          }
        }
      }

      // Extract ids from canonical URL or current page URL
      let currentUrl = page.url();
      let ids = this.parseShopeeUrl(currentUrl) || this.parseShopeeUrl(productUrl);

      // Scroll incrementally down to trigger rating section lazy-load
      console.log('[ShopeeScraper] Scrolling down to trigger review components...');
      await page.evaluate(async () => {
        for (let i = 0; i < 4; i++) {
          window.scrollBy({ top: 1000, behavior: 'smooth' });
          await new Promise(r => setTimeout(r, 600));
        }
      });
      await page.waitForTimeout(2000);

      // Check if Captcha popped up during scroll
      if (await this.captchaSolver.detect(page)) {
        console.log('[ShopeeScraper] Captcha detected during scroll! Attempting auto-solve...');
        await this.captchaSolver.solve(page);
        await page.waitForTimeout(2000);
      }

      // Fallback: If PDP data was not caught via network interception, query it directly in page context
      if (!pdpData && ids) {
        console.log('[ShopeeScraper] Triggering in-page fetch for PDP data fallback...');
        pdpData = await page.evaluate(async ({ shopId, itemId }) => {
          try {
            const res = await fetch(`/api/v4/pdp/get_pc?item_id=${itemId}&shop_id=${shopId}`, {
              credentials: 'include',
            });
            const json = await res.json();
            return json.data || null;
          } catch {
            return null;
          }
        }, ids);
      }

      // Map raw PDP data to standardized ShopeeProduct entity
      if (!pdpData) {
        await page.waitForTimeout(2500);
      }

      if (!pdpData) {
        throw new Error('Failed to retrieve Shopee product data (neither API response nor in-page fetch was available).');
      }

      const item = pdpData.item || pdpData;
      const shopDetailed = pdpData.shop_detailed || {};

      // Fallback: If ratings were not caught, fetch them via page context
      if (ratingsData.length === 0 && ids) {
        console.log('[ShopeeScraper] Fetching reviews via page context fallback...');
        const fetchedRatings = await page.evaluate(
          async ({ shopId, itemId, maxReviews }) => {
            try {
              const q = `filter=0&flag=1&itemid=${itemId}&shopid=${shopId}&limit=${maxReviews}&offset=0&type=0&exclude_filter=1&filter_size=0&fold_filter=0&relevant_reviews=false&request_source=2`;
              const res = await fetch(`/api/v2/item/get_ratings?${q}`, { credentials: 'include' });
              const json = await res.json();
              return json?.data?.ratings || [];
            } catch {
              return [];
            }
          },
          { shopId: ids.shopId, itemId: ids.itemId, maxReviews: this.maxReviews }
        );
        if (Array.isArray(fetchedRatings)) {
          ratingsData = fetchedRatings;
        }
      }

      // Collect images (support multiple fields: images, image, overlay_image)
      const rawImages: string[] = item.images || (item.image ? [item.image] : []) || [];

      const models = (item.models || []).map((m: any) => ({
        modelId: String(m.model_id || m.modelid || ''),
        name: m.name || '',
        price: this.normalizePrice(m.price),
        stock: m.stock || 0,
        sku: m.sku || '',
      }));

      const attributes = (item.attributes || []).map((a: any) => ({
        name: a.name || '',
        value: a.value || '',
      }));

      const images = rawImages.map((hash: string) =>
        hash.startsWith('http') ? hash : `https://down-vn.img.susercontent.com/file/${hash}`
      );

      const reviews: ShopeeReview[] = ratingsData.slice(0, this.maxReviews).map((r: any) => ({
        reviewId: String(r.cmtid || r.id || ''),
        author: r.author_username || 'Người dùng ẩn danh',
        authorAvatar: r.author_portrait
          ? `https://down-vn.img.susercontent.com/file/${r.author_portrait}`
          : undefined,
        ratingStar: r.rating_star || 5,
        comment: r.comment || '',
        variation: r.product_items?.[0]?.model_name || r.model_name || '',
        createdAt: r.ctime ? new Date(r.ctime * 1000).toISOString() : new Date().toISOString(),
        images: (r.images || []).map((h: string) =>
          h.startsWith('http') ? h : `https://down-vn.img.susercontent.com/file/${h}`
        ),
        sellerReply: r.Item_rating_reply?.comment || undefined,
      }));

      const product: ShopeeProduct = {
        itemId: String(item.item_id || item.itemid || ids?.itemId || ''),
        shopId: String(item.shop_id || item.shopid || ids?.shopId || ''),
        url: currentUrl,
        title: item.title || item.name || '',
        description: item.description || '',
        priceMin: this.normalizePrice(item.price_min || item.price),
        priceMax: this.normalizePrice(item.price_max || item.price),
        priceBeforeDiscount: this.normalizePrice(item.price_before_discount),
        currency: item.currency || 'VND',
        historicalSold: item.historical_sold || item.sold || 0,
        stock: item.stock || 0,
        ratingStar: item.item_rating?.rating_star || 0,
        ratingCount: item.item_rating?.rating_count?.[0] || 0,
        ratingScoreDistribution: item.item_rating?.rating_count || [],
        images,
        models,
        attributes,
        shop: {
          shopId: String(shopDetailed.shopid || item.shop_id || ''),
          name: shopDetailed.name || 'Shopee Seller',
          isMall: Boolean(shopDetailed.is_official_shop || item.show_official_shop_label),
          ratingStar: shopDetailed.rating_star,
          followerCount: shopDetailed.follower_count,
          location: shopDetailed.shop_location,
        },
        reviews,
      };

      return product;
    } finally {
      // Close the ephemeral tab
      await page.close().catch(() => {});
    }
  }
}
