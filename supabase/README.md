# Supabase Migrations for Rate

All production database DDL migrations for the shared Supabase project (`gulptwduchsjcsbndmua`) are centrally managed in the **`DOS-Me`** repository (`D:/Projects/DOS-Me/supabase/migrations/`).

- Initial Schema Migration PR for `rate`: [DOS/DOS.Me#751](https://github.com/DOS/DOS.Me/pull/751)
- Branch in DOS-Me: `feat/init-rate-schema`
- **Rule:** Do NOT apply migrations directly from `Rate`. All DDL must land via PR in `DOS-Me` to preserve drift prevention across the DOS ecosystem.
