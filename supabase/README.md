# Supabase Migrations for Rate

`supabase/migrations/` here is a **reference copy** of the `rate` schema history. The only deployable ledger for the shared Supabase project (`gulptwduchsjcsbndmua`) is **`DOS/DOS.Me` `supabase/migrations/`**, which CI promotes preview -> beta -> prod. A file that exists only here is never applied to any environment.

- **Rule:** never apply migrations from this repo (no `supabase db push`, MCP `apply_migration`/`execute_sql` DDL or Dashboard SQL). Add the file here and in a DOS-Me PR.
- `pnpm test:migrations` replays every file here twice on a throwaway PostgreSQL 17 container shaped like the shared project (`pg_trgm` in schema `sign`, Supabase API roles) and calls the RPCs the web app and workers use. CI runs it on every PR.
- `pnpm check:migrations` compares this copy with the DOS-Me ledger (`gh` needs read access to `DOS/DOS.Me`; `--ledger <path>` reads a local checkout instead) and fails on files that are missing there or differ. Run it before merging a migration change and after syncing one.
