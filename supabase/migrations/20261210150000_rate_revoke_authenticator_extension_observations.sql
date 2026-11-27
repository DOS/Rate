-- =============================================================================
-- Migration: 20261210150000_rate_revoke_authenticator_extension_observations.sql
-- Purpose (DOS/DOS.Me#1994): revoke pre-existing `authenticator` default ACL
-- grants on `rate.extension_ingest_secret`, `rate.extension_submitters`,
-- `rate.extension_observations`, the `extension_observations.id` identity
-- sequence, and the four extension observation RPCs, and remove
-- `authenticator` from `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA rate`
-- so Production matches Beta (`V11 = 0`).
--
-- Why this happened on Production (`gulptwduchsjcsbndmua`):
--   Production carried pre-existing `pg_default_acl` entries for role
--   `postgres` in schema `rate` granting `ALL` to `authenticator`. When
--   `20261106160000_rate_extension_observations.sql` ran, its `REVOKE ALL`
--   statements targeted `PUBLIC, anon, authenticated, rate_worker` and did not
--   include `authenticator`, leaving `authenticator=arwdDxtm/postgres` on
--   `rate.extension_ingest_secret` (`V11` returned `8` on Production, `0` on
--   Beta).
--
-- Monotonic timestamp: 20261210150000 (> 20261210140000 on dev and > 20261209100000 on main).
--
-- Verify:
--   1. `scripts/ops/rate-extension-observations-verify.sql`: `V1` to `V12`
--      all return `0` (specifically `V11 = 0`).
--   2. `scripts/migration/test-rate-schema-replay.mjs` (Docker PostgreSQL 17).
--   3. Direct ACL check on `rate.extension_ingest_secret` and `pg_default_acl`:
--      no `authenticator` entry in `pg_class.relacl`, `pg_proc.proacl`, or
--      `pg_default_acl` for role `postgres` in schema `rate`.
--
-- Rollback (only via a reviewed migration if a verified legacy dependency
-- explicitly requires a specific privilege):
--   Verify the exact failing object and caller path first, then grant ONLY
--   the minimum required privilege on that named object to `authenticator`.
--   Do NOT grant `ALL` on `rate.extension_ingest_secret` (would break V11),
--   and do NOT reinstate `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA
--   rate ... TO authenticator` (Beta never carried those defaults).
--   Note: `authenticator` is PostgREST's `NOINHERIT` connection role and
--   switches to `anon`/`authenticated`/`service_role`/`rate_worker` per
--   request; no runtime path requires direct `authenticator` ACLs here.
--
-- Idempotent: guarded role/object checks, `REVOKE` statements, and
-- `ALTER DEFAULT PRIVILEGES ... REVOKE ALL ... FROM authenticator` are safe
-- to replay repeatedly and do not alter `USAGE ON SCHEMA rate`, `anon`,
-- `authenticated`, `service_role`, `rate_worker`, or RLS policies.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  v_auth_oid oid := pg_catalog.to_regrole('authenticator');
  v_pg_oid oid := pg_catalog.to_regrole('postgres');
  v_rate_oid oid := pg_catalog.to_regnamespace('rate');
  v_tbl text;
  v_tbl_oid regclass;
  v_seq text;
  v_seq_oid regclass;
  v_proc text;
  v_proc_oid regprocedure;
  v_has_table_acl boolean;
BEGIN
  IF v_auth_oid IS NULL THEN
    RETURN;
  END IF;

  FOREACH v_tbl IN ARRAY ARRAY[
    'rate.extension_ingest_secret',
    'rate.extension_submitters',
    'rate.extension_observations'
  ] LOOP
    v_tbl_oid := pg_catalog.to_regclass(v_tbl);
    IF v_tbl_oid IS NOT NULL THEN
      SELECT (
        EXISTS (
          SELECT 1
          FROM pg_catalog.pg_class c
          CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
          WHERE c.oid = v_tbl_oid
            AND a.grantee = v_auth_oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_catalog.pg_attribute attr
          CROSS JOIN LATERAL pg_catalog.aclexplode(attr.attacl) a
          WHERE attr.attrelid = v_tbl_oid
            AND NOT attr.attisdropped
            AND attr.attacl IS NOT NULL
            AND a.grantee = v_auth_oid
        )
      ) INTO v_has_table_acl;

      IF v_has_table_acl THEN
        EXECUTE pg_catalog.format('REVOKE ALL ON TABLE %s FROM authenticator', v_tbl);
        SELECT (
          EXISTS (
            SELECT 1
            FROM pg_catalog.pg_class c
            CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
            WHERE c.oid = v_tbl_oid
              AND a.grantee = v_auth_oid
          )
          OR EXISTS (
            SELECT 1
            FROM pg_catalog.pg_attribute attr
            CROSS JOIN LATERAL pg_catalog.aclexplode(attr.attacl) a
            WHERE attr.attrelid = v_tbl_oid
              AND NOT attr.attisdropped
              AND attr.attacl IS NOT NULL
              AND a.grantee = v_auth_oid
          )
        ) INTO v_has_table_acl;

        IF v_has_table_acl THEN
          RAISE EXCEPTION 'authenticator privileges remain on table % (current_user=%)', v_tbl, current_user;
        END IF;
      END IF;
    END IF;
  END LOOP;

  IF pg_catalog.to_regclass('rate.extension_observations') IS NOT NULL THEN
    v_seq := pg_catalog.pg_get_serial_sequence('rate.extension_observations', 'id');
    v_seq_oid := CASE WHEN v_seq IS NOT NULL THEN pg_catalog.to_regclass(v_seq) END;
    IF v_seq_oid IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM pg_catalog.pg_class c
         CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('S', c.relowner))) a
         WHERE c.oid = v_seq_oid
           AND a.grantee = v_auth_oid
       ) THEN
      EXECUTE pg_catalog.format('REVOKE ALL ON SEQUENCE %s FROM authenticator', v_seq);
      IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class c
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('S', c.relowner))) a
        WHERE c.oid = v_seq_oid
          AND a.grantee = v_auth_oid
      ) THEN
        RAISE EXCEPTION 'authenticator privileges remain on sequence % (current_user=%)', v_seq, current_user;
      END IF;
    END IF;
  END IF;

  FOREACH v_proc IN ARRAY ARRAY[
    'rate.register_extension_submitter(text, text)',
    'rate.submit_extension_observation(text, uuid, jsonb, text)',
    'rate.delete_extension_submitter(uuid)',
    'rate.purge_extension_observations(integer, integer, integer)'
  ] LOOP
    v_proc_oid := pg_catalog.to_regprocedure(v_proc);
    IF v_proc_oid IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM pg_catalog.pg_proc p
         CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
         WHERE p.oid = v_proc_oid
           AND a.grantee = v_auth_oid
       ) THEN
      EXECUTE pg_catalog.format('REVOKE EXECUTE ON FUNCTION %s FROM authenticator', v_proc);
      IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc p
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
        WHERE p.oid = v_proc_oid
          AND a.grantee = v_auth_oid
      ) THEN
        RAISE EXCEPTION 'authenticator EXECUTE privilege remains on function % (current_user=%)', v_proc, current_user;
      END IF;
    END IF;
  END LOOP;

  IF v_rate_oid IS NOT NULL AND v_pg_oid IS NOT NULL THEN
    IF pg_catalog.pg_has_role(current_user, 'postgres', 'USAGE') THEN
      EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA rate REVOKE ALL ON TABLES FROM authenticator';
      EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA rate REVOKE ALL ON SEQUENCES FROM authenticator';
      EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA rate REVOKE ALL ON FUNCTIONS FROM authenticator';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_default_acl d
      CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a
      WHERE d.defaclrole = v_pg_oid
        AND d.defaclnamespace = v_rate_oid
        AND d.defaclobjtype IN ('r', 'S', 'f')
        AND a.grantee = v_auth_oid
    ) THEN
      RAISE EXCEPTION
        'authenticator default privileges remain for role postgres in schema rate (current_user=%)',
        current_user;
    END IF;
  END IF;
END $$;

COMMIT;
