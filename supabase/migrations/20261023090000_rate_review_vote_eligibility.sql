-- DOS/Rate#613: enforce review-vote eligibility in the database.
--
-- rate.review_votes grants INSERT/UPDATE to `authenticated`, and RLS only
-- checks voter_id = auth.uid(). The `rate` schema is exposed through
-- PostgREST (rate.vn writes votes with the user's JWT), so an account could
-- insert a vote directly and skip the Review Trust Model's voter rules: no
-- anonymous session, a confirmed email or phone, and an account at least 7
-- days old. The Next.js route (apps/web/src/app/api/reviews/[id]/vote/route.ts,
-- evaluateVoterEligibility) checks a subset of them.
--
-- The guard trigger now applies these rules to user callers: the `anon` and
-- `authenticated` roles, and SECURITY DEFINER functions they call (detected
-- through the JWT role claim). service_role (importer, admin tooling) and
-- migrations are not affected. DELETE (clearing one's own vote) stays
-- allowed. Idempotent.

CREATE OR REPLACE FUNCTION rate.current_user_can_vote_reviews()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = (SELECT auth.uid())
      AND COALESCE(u.is_anonymous, false) = false
      AND (u.email_confirmed_at IS NOT NULL OR u.phone_confirmed_at IS NOT NULL)
      AND u.created_at <= now() - interval '7 days'
  );
$$;

COMMENT ON FUNCTION rate.current_user_can_vote_reviews() IS
  'True when the calling user may vote on or report reviews: not anonymous, confirmed email or phone, account at least 7 days old (DOS/Rate#613). Reads only the caller''s own auth.users row.';

REVOKE ALL ON FUNCTION rate.current_user_can_vote_reviews() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rate.current_user_can_vote_reviews() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION rate.review_votes_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_recent INTEGER;
BEGIN
  -- Review Trust Model voter rules (DOS/Rate#613). User callers are checked,
  -- including through a SECURITY DEFINER function, where current_user is its
  -- owner but the JWT role claim is still the user's. service_role and the
  -- migration owner write on users' behalf and are not checked. PostgREST
  -- always sets request.jwt.claims to a JSON object; a non-JSON value fails
  -- closed with a cast error.
  IF (current_user IN ('anon', 'authenticated')
      OR COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
         IN ('anon', 'authenticated'))
     AND NOT rate.current_user_can_vote_reviews() THEN
    RAISE EXCEPTION 'review_votes: account is not eligible to vote on reviews'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.review_id <> OLD.review_id OR NEW.voter_id <> OLD.voter_id THEN
      RAISE EXCEPTION 'review_votes: review_id and voter_id are immutable';
    END IF;
    NEW.updated_at := now();
  END IF;

  -- Enforce 60 vote/report actions per hour across both INSERT and UPDATE (Audit T3)
  SELECT count(*) INTO v_recent
  FROM rate.review_votes
  WHERE voter_id = NEW.voter_id
    AND updated_at > now() - interval '1 hour';

  IF v_recent >= 60 THEN
    RAISE EXCEPTION 'review_votes: rate limit exceeded (60 vote actions per hour)'
      USING ERRCODE = '54000';
  END IF;

  RETURN NEW;
END;
$$;
