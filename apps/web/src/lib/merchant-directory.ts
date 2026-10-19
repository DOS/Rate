import type { MerchantRiskBreakdown, MerchantSummary } from './rate-domain';

/**
 * The merchant fields the /merchants directory renders, filters, sorts and
 * exports. The page serializes every store into its payload, so it passes
 * these instead of whole MerchantSummary objects (DOS/Rate#452).
 */
export type DirectoryMerchant = Omit<
  MerchantSummary,
  'location' | 'risk_score' | 'updated_at' | 'review_risk_breakdown'
> & {
  review_risk_breakdown: Pick<
    MerchantRiskBreakdown,
    | 'total_reviews'
    | 'authentic_count'
    | 'coin_spam_count'
    | 'seeding_fake_count'
  >;
};

export function toDirectoryMerchants(
  merchants: readonly MerchantSummary[]
): DirectoryMerchant[] {
  return merchants.map(
    ({
      location: _location,
      risk_score: _riskScore,
      updated_at: _updatedAt,
      review_risk_breakdown: breakdown,
      ...rest
    }) => ({
      ...rest,
      review_risk_breakdown: {
        total_reviews: breakdown.total_reviews,
        authentic_count: breakdown.authentic_count,
        coin_spam_count: breakdown.coin_spam_count,
        seeding_fake_count: breakdown.seeding_fake_count,
      },
    })
  );
}
