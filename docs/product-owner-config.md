# Product Owner config: DOS/Rate

Values for the cc-po plugin's `product-owner` and `task-claim` skills in
this repository (used by the Qwen Code PO; the Claude Code PO runs Rate's own
`.claude/skills/product-owner` skill). `AGENTS.md` and the documents it
routes to win over the plugin wherever they differ. Check this file with the
plugin's `check-config.mjs`.

This file lives at `docs/product-owner-config.md` (lower-case `docs`), the
one path cc-po reads, although Rate's documentation folder is `Docs/`. On a
case-sensitive checkout (Linux, CI) it is a separate `docs/` folder holding
only this file; on macOS it shows up inside `Docs/`. Keep it at this path and
put nothing else under `docs/`. On macOS, `git add` of a new file at this path
can record it under `Docs/` (the existing casing), where cc-po does not find it:
stage a re-created file with `git -c core.ignorecase=false add docs/product-owner-config.md`
and check `git ls-files` shows `docs/`.

This config covers Rate Core (DOS/Rate). Rate Services issues
(DOS/Rate-Services) follow "Rate Services differences" in
`.claude/skills/product-owner/SKILL.md`: no `dev` branch, no `task-claim`
check, PRs into `main`.

The PO's own state file follows `AGENTS.md` section 6, which wins over the
plugin's check-in and handoff file names: `po-state.qwen.md` (or
`po-state.claude.md`) in that PO's own notes folder, outside the repository.

## Owner and reporting

- owner_name: JOY
- owner_profile: the owner of DOS/Rate; decides product and risk, not code.
  Bring JOY material decisions in plain words, one at a time. A document JOY
  reads to decide (proposal, plan, report, audit) is a self-contained
  dark-theme HTML file in the repository, in Vietnamese (`AGENTS.md` 0.3).
- report_language: Vietnamese (full diacritics, technical terms in English)

## Board

- project_url: https://github.com/orgs/DOS/projects/9
- project_owner: DOS
- project_number: 9
- project_id: PVT_kwDOA388Vc4Bm5Ml
- product_line_field: none
- priority_field: none
- bot_owned_fields: none
- issue_notes: every issue the PO creates or hands out is on Project #9 with
  Size set, plus an `area:*` label where one fits;
  `node scripts/ops/board.mjs` sets Status and
  Agent ("Board fields" in `.claude/skills/product-owner/SKILL.md`)

## Lines

Rate tags no line: the line is the repository, and "Lines and names" in
`.claude/skills/product-owner/SKILL.md` forbids a Product Line field and
`line:*` labels. The label below exists only because the plugin's Lines table
needs one; do not create it, add it to issues or PRs, or filter on it. Every
open DOS/Rate issue belongs to Rate Core: triage reads them from the issue
side as "Triage" in that skill says.

| Line      | Label            | Product Line option id | PO session                |
| --------- | ---------------- | ---------------------- | ------------------------- |
| Rate Core | `line:rate-core` | none                   | `Rate Core Product Owner` |

## Rule documents

- agent_instructions: `AGENTS.md`
- tracking_doc: `AGENTS.md` section 1 and section 6, and "Claims" in
  `.claude/skills/product-owner/SKILL.md`
- review_rules: `AGENTS.md` section 5
- roadmap_sources: `Docs/Resources/ROADMAP.md`
- decision_log: none

## Branches, environments and gates

- integration_branch: dev
- integration_merge: squash
- default_branch: dev
- production_branch: main
- production_merge: merge commit
- production_effect: Vercel's Git integration builds `main` as the rate.vn
  Production deployment and assigns the domain when the build is ready
  (`Docs/Resources/RELEASE.md`); no GitHub workflow deploys and no database
  migration runs (schema changes ship from DOS-Me). The release step after it
  is `node scripts/ops/verify-live.mjs --wait 900`.
- test_environment: Vercel builds `dev` as a Preview deployment; check it there
  before a promotion (`Docs/Resources/RELEASE.md`). Previews have no database
  env.
- promotion_notes: `Docs/Resources/RELEASE.md`; promotions run
  `node scripts/ops/promote.mjs`, then `node scripts/ops/verify-live.mjs`.

## Checks and review

- required_checks: `Typecheck & Build Monorepo`, `E2E (Playwright)`,
  `Secret scan (gitleaks)` and `task-claim` (GitHub Actions, app id 15368),
  from rulesets `dev-main-light` and `dev-task-claim` (`AGENTS.md` sections 1
  and 5)
- claim_gate: the required `task-claim` check (`.github/workflows/task-claim.yml`,
  ruleset `dev-task-claim`), re-run by
  `.github/workflows/task-claim-revalidate.yml`
- local_reviews: as "Review gate" in `.claude/skills/product-owner/SKILL.md`
  says: a fresh-context subagent review of the diff (`AGENTS.md` sections 0.2
  and 5), then a Codex review where Codex is available; a PR without one
  says so
- agent_model: sonnet

## Claim lock and parallel POs

- claim_command: `node scripts/ops/board.mjs <n> --status <status> --agent <nick> --claimant <claimant>`;
  add `--repo DOS/Rate-Services` for a Rate Services issue, run from the
  DOS/Rate checkout. Never set `RATE_CLAIMANT` in a shell profile or an
  environment other sessions (sub-sessions included) inherit.
- pr_issue_keyword: Closes
- po_labels: claude: po:claude, qwen: po:qwen
- promotion_po: claude

## Sessions

- gatekeeper_model: haiku
