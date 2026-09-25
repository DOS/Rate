import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { MasterProduct, ProductSpecifications, KeySpecs } from '@repo/shared-data';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  'https://gulptwduchsjcsbndmua.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1bHB0d2R1Y2hzamNzYm5kbXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1OTI4NzQsImV4cCI6MjA4MjE2ODg3NH0.rRf1P8DhC_iK9KM2TSOU0XnjwoXmlBgZymGuhUdPazs';

let _client: SupabaseClient<any, 'rate'> | null = null;

export function getRateClient(): SupabaseClient<any, 'rate'> {
  if (!_client) {
    const raw = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    _client = (raw as any).schema('rate');
  }
  return _client;
}

export interface MerchantOffer {
  id: string;
  platform: string;
  title: string;
  price_current: number;
  price_original: number | null;
  stock: number;
  rating_star: number;
  rating_count: number;
  url: string;
  merchant: {
    id: string;
    name: string;
    platform: string;
    is_official: boolean;
    rating_star: number | null;
    follower_count: number;
    location: string | null;
    risk_score: number;
  };
}

export interface ReviewItem {
  id: string;
  author_name: string;
  rating_star: number;
  comment: string;
  variation: string | null;
  created_at: string;
}

/**
 * Fetch list of master products with optional filtering
 */
export async function getMasterProducts(params?: {
  brand?: string;
  search?: string;
  limit?: number;
}): Promise<MasterProduct[]> {
  const supabase = getRateClient();
  let query = supabase
    .from('master_products')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false });

  if (params?.brand) {
    query = query.ilike('brand', `%${params.brand}%`);
  }

  if (params?.search) {
    query = query.ilike('name', `%${params.search}%`);
  }

  if (params?.limit) {
    query = query.limit(params.limit);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching master products:', error.message);
    return [];
  }
  return (data as MasterProduct[]) || [];
}

/**
 * Fetch a single master product by its slug
 */
export async function getMasterProductBySlug(slug: string): Promise<MasterProduct | null> {
  const supabase = getRateClient();
  const { data, error } = await supabase
    .from('master_products')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !data) {
    console.error(`Master product not found for slug: ${slug}`, error?.message);
    return null;
  }
  return data as MasterProduct;
}

/**
 * Fetch all merchant listing offers for a master product
 */
export async function getMasterProductOffers(masterId: string): Promise<MerchantOffer[]> {
  const supabase = getRateClient();
  const { data, error } = await supabase
    .from('products')
    .select(`
      id,
      platform,
      title,
      price_current,
      price_original,
      stock,
      rating_star,
      rating_count,
      url,
      merchants (
        id,
        name,
        platform,
        is_official,
        rating_star,
        follower_count,
        location,
        risk_score
      )
    `)
    .eq('cluster_id', masterId)
    .order('price_current', { ascending: true });

  if (error || !data) {
    console.error('Error fetching offers for masterId:', masterId, error?.message);
    return [];
  }

  return data.map((item: any) => ({
    id: item.id,
    platform: item.platform,
    title: item.title,
    price_current: Number(item.price_current),
    price_original: item.price_original ? Number(item.price_original) : null,
    stock: item.stock,
    rating_star: Number(item.rating_star),
    rating_count: item.rating_count,
    url: item.url,
    merchant: {
      id: item.merchants?.id,
      name: item.merchants?.name,
      platform: item.merchants?.platform,
      is_official: Boolean(item.merchants?.is_official),
      rating_star: item.merchants?.rating_star ? Number(item.merchants.rating_star) : null,
      follower_count: item.merchants?.follower_count || 0,
      location: item.merchants?.location || null,
      risk_score: item.merchants?.risk_score || 0,
    },
  }));
}

/**
 * Fetch reviews across listings grouped under a master product
 */
export async function getMasterProductReviews(masterId: string): Promise<ReviewItem[]> {
  const supabase = getRateClient();
  // First find all product IDs for this master
  const { data: prods } = await supabase
    .from('products')
    .select('id')
    .eq('cluster_id', masterId);

  if (!prods || prods.length === 0) return [];

  const productIds = prods.map((p: any) => p.id);
  const { data: reviews, error } = await supabase
    .from('reviews')
    .select('id, author_name, rating_star, comment, variation, created_at')
    .in('product_id', productIds)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error || !reviews) {
    return [];
  }

  return reviews.map((r: any) => ({
    id: r.id,
    author_name: r.author_name || 'Khách hàng',
    rating_star: r.rating_star || 5,
    comment: r.comment || '',
    variation: r.variation || null,
    created_at: r.created_at,
  }));
}

/**
 * Fetch comparison data for multiple master products
 */
export async function compareMasterProducts(slugs: string[]): Promise<MasterProduct[]> {
  if (!slugs || slugs.length === 0) return [];
  const supabase = getRateClient();
  const { data, error } = await supabase
    .from('master_products')
    .select('*')
    .in('slug', slugs);

  if (error || !data) {
    return [];
  }
  return data as MasterProduct[];
}
