import { chromium, Browser, Page } from 'playwright';

export interface ShopeeSearchItem {
  itemId: string;
  shopId: string;
  title: string;
  priceMin: number;
  priceMax: number;
  priceBeforeDiscount?: number;
  currency: string;
  historicalSold: number;
  ratingStar: number;
  ratingCount: number;
  image: string;
  shopLocation?: string;
  isOfficialShop: boolean;
  rawUrl: string;
}

export interface ShopeeSearchResult {
  keyword: string;
  totalCount: number;
  items: ShopeeSearchItem[];
}

export class ShopeeSearchScraper {
  private cdpEndpoint: string;

  constructor(cdpEndpoint = 'http://localhost:9222') {
    this.cdpEndpoint = cdpEndpoint;
  }

  /**
   * Search Shopee items in batches of up to 60 items per request
   */
  public async search(
    keyword: string,
    options: {
      limit?: number;
      offset?: number;
      sortBy?: 'sales' | 'relevancy' | 'ctime' | 'price';
      order?: 'desc' | 'asc';
    } = {}
  ): Promise<ShopeeSearchResult> {
    const limit = Math.min(options.limit || 60, 60);
    const offset = options.offset || 0;
    const sortBy = options.sortBy || 'sales';
    const order = options.order || 'desc';

    console.log(`[SearchScraper] Searching for "${keyword}" (Limit: ${limit}, Offset: ${offset}, Sort: ${sortBy})...`);

    const browser: Browser = await chromium.connectOverCDP(this.cdpEndpoint);
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error('No browser context found on CDP endpoint.');
    }

    // Reuse existing Shopee tab or open new tab if none
    let page = context.pages().find(p => p.url().includes('shopee.vn'));
    let needClose = false;
    if (!page) {
      page = await context.newPage();
      await page.goto('https://shopee.vn', { waitUntil: 'domcontentloaded' });
      needClose = true;
    }

    try {
      const apiUrl = `/api/v4/search/search_items?by=${sortBy}&keyword=${encodeURIComponent(
        keyword
      )}&limit=${limit}&newest=${offset}&order=${order}&page_type=search&scenario=PAGE_GLOBAL_SEARCH&version=2`;

      console.log(`[SearchScraper] Calling internal search API via page context: ${apiUrl}`);

      const rawResult = await page.evaluate(async (url: string) => {
        const resp = await fetch(url, { credentials: 'include' });
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        }
        return await resp.json();
      }, apiUrl);

      if (!rawResult || !rawResult.items) {
        throw new Error(
          `Shopee Search API returned invalid payload or error: ${JSON.stringify(rawResult).slice(0, 200)}`
        );
      }

      const rawItems = rawResult.items || [];
      const totalCount = rawResult.total_count || rawItems.length;

      const items: ShopeeSearchItem[] = rawItems
        .map((entry: any) => {
          const b = entry.item_basic;
          if (!b || !b.itemid) return null;

          const priceMin = (b.price_min || b.price || 0) / 100000;
          const priceMax = (b.price_max || b.price || 0) / 100000;
          const priceOriginal = (b.price_before_discount || 0) / 100000;

          const imgUrl = b.image
            ? b.image.startsWith('http')
              ? b.image
              : `https://down-vn.img.susercontent.com/file/${b.image}`
            : '';

          return {
            itemId: String(b.itemid),
            shopId: String(b.shopid),
            title: b.name || '',
            priceMin,
            priceMax,
            priceBeforeDiscount: priceOriginal > 0 ? priceOriginal : undefined,
            currency: b.currency || 'VND',
            historicalSold: b.historical_sold || 0,
            ratingStar: b.item_rating?.rating_star || 0,
            ratingCount: b.item_rating?.rating_count ? b.item_rating.rating_count[0] : 0,
            image: imgUrl,
            shopLocation: b.shop_location || undefined,
            isOfficialShop: Boolean(b.is_official_shop || b.show_official_shop_label),
            rawUrl: `https://shopee.vn/product-i.${b.shopid}.${b.itemid}`
          } as ShopeeSearchItem;
        })
        .filter(Boolean);

      console.log(`[SearchScraper] Extracted ${items.length} items successfully.`);
      return {
        keyword,
        totalCount,
        items
      };
    } finally {
      if (needClose && page) {
        await page.close();
      }
    }
  }
}
