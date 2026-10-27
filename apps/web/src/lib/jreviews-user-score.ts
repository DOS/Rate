/** The user-review fields the buyer score reads. */
export interface JReviewsUserScoreReview {
  reviewer_type?: string | null;
  include_in_rating: boolean;
  helpfulness_weight: number;
  rating_star: number;
}

export interface JReviewsUserScores {
  /** Plain weighted mean of the counted buyer reviews ("TB trọng số"). */
  user: number | null;
  /** Bayesian buyer score: the number the product header shows. */
  bayesianUser: number | null;
  bayesianConfidence: number;
  userWeightSum: number;
}

const PRIOR_MEAN = 4.2;
const PRIOR_STRENGTH = 3;

/**
 * Buyer scores of the reviews section. The composite score must start from
 * bayesianUser, the buyer score the header shows, not the raw mean: 9
 * rating-only 5-star reviews are 4.54 in the header and were 5.0 in the
 * composite (DOS/Rate#1144).
 */
export function computeJReviewsUserScores(
  reviews: readonly JReviewsUserScoreReview[],
  userRatingWeighted: number | null | undefined,
  averageRating: number
): JReviewsUserScores {
  const validUserReviews = (Array.isArray(reviews) ? reviews : []).filter(
    (r) =>
      r.reviewer_type !== 'expert' &&
      r.include_in_rating &&
      r.helpfulness_weight > 0
  );

  let user: number | null =
    userRatingWeighted && userRatingWeighted > 0 ? userRatingWeighted : null;
  let userWeightSum = 0;
  let userWeightedStars = 0;
  if (validUserReviews.length > 0) {
    userWeightSum = validUserReviews.reduce(
      (acc, r) => acc + r.helpfulness_weight,
      0
    );
    userWeightedStars = validUserReviews.reduce(
      (acc, r) => acc + r.rating_star * r.helpfulness_weight,
      0
    );
    if (userWeightSum > 0) {
      user = Number((userWeightedStars / userWeightSum).toFixed(2));
    }
  } else if (user == null && averageRating > 0) {
    user = Number(Number(averageRating).toFixed(2));
  }

  const bayesianUser =
    userWeightSum > 0
      ? Number(
          (
            (PRIOR_STRENGTH * PRIOR_MEAN + userWeightedStars) /
            (PRIOR_STRENGTH + userWeightSum)
          ).toFixed(2)
        )
      : user;
  const bayesianConfidence = Number(
    (userWeightSum / (userWeightSum + PRIOR_STRENGTH)).toFixed(2)
  );

  return { user, bayesianUser, bayesianConfidence, userWeightSum };
}
