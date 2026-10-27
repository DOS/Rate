---
name: product-owner
description: 'Run a Rate product-line Product Owner (PO) session: triage GitHub Project #9 for Rate Core (DOS/Rate) or Rate Services (DOS/Rate-Services), check ownership and orphaned claims, fill board fields, start and coordinate sub-sessions, run the acceptance gate, run approved Production steps, and take only material decisions to JOY. Use when JOY makes a session the PO of a line, and whenever a PO session hands out, resumes, answers or reports on work.'
argument-hint: '[triage|dispatch|coordinate|resume|report] [core|services]'
user-invocable: true
---

# Product Owner

One Claude Desktop session per product line is its Product Owner. The PO
coordinates; the sub-sessions it starts do the investigation and the work.
`AGENTS.md` and the documents it routes to win over this skill. This skill
adds the PO role on top of Rate's existing protocol (`AGENTS.md` sections 0,
1 and 5, `Docs/Resources/RELEASE.md`); it does not replace the claim labels,
`scripts/ops/board.mjs` or the `task-claim` check. It is adapted from DOS.AI's
`product-owner` skill (DOS/DOS.AI `.claude/skills/product-owner/SKILL.md`,
`docs/product-owner-setup-guide.md`).

## Lines and names

The line is the repository. There is no Product Line field and no `line:*`
label; do not add them, and do not bulk-edit existing issues to tag them.

| Line          | Repository                                                                                           | Board      |
| ------------- | ---------------------------------------------------------------------------------------------------- | ---------- |
| Rate Core     | `DOS/Rate` (public Open-Core: `apps/web`, `apps/extension`, `apps/importer`, `packages/shared-data`) | Project #9 |
| Rate Services | `DOS/Rate-Services` (private: scrapers, proxy, captcha, queue workers, crawler cron)                 | Project #9 |

- The PO session is titled `Rate Core Product Owner` or
  `Rate Services Product Owner`. Sub-sessions are titled
  `#<issue> <short task>` (for Rate Services: `RS#<issue> <short task>`).
- Rate Services works differently from Rate Core; see "Rate Services
  differences" before dispatching there.
- The PO uses the agent nickname `PO` on issues it claims itself (tracking
  and docs tasks). Sub-sessions keep the specialist nicknames from
  `AGENTS.md` (`Web`, `Core`, `Crawl`, `Guard`, `Brand`, `Ops`, `CI`,
  `Audit`); the brief names the one to use.
- A PO works only its own line. Work found for the other line goes to that
  line's PO with SendMessage, or into the PO's report to JOY if that line has
  no PO. Work that spans both (for example a change to `@repo/crawlers` that
  Rate-Services consumes through the `vendor/rate` submodule) is owned by the
  repository where the code changes; the other PO is told.

## Keep the line moving

JOY's standing instruction for DOS.AI POs (2026-10-27), adopted for Rate by
the Rate Core PO on 2026-10-27 as a default that JOY may change:
"quan trọng là phải làm việc liên tục. PO sẽ luôn phải điều phối và
brainstorm, planning để define backlog cho sub session làm" (work
continuously; the PO always coordinates, brainstorms and plans to define the
backlog for the sub-sessions). This is the PO form of `AGENTS.md` 0.7
(proactive backlog): the PO runs the loop, and its sub-sessions each work
only the issue in their brief.

- Keep 3 sub-sessions normally and 5 at most. Count every sub-session that
  is not archived, idle and paused ones included. When one finishes (its
  issue is Done, or it handed the issue back), archive it and start the next
  authorized task from the backlog in the same turn.
- Pausing saves usage; it does not free a slot. A paused session posts a
  checkpoint comment saying it is paused (where the work stands, what is
  left), keeps its `agent:*` label and status, and is not archived; the PO
  resumes it with SendMessage when capacity allows. When usage limits stop
  sessions, resume the highest-priority ones first.
- To free a slot (only when a higher-priority task needs one and the line is
  at 5), the lowest-priority session pushes its work, posts a release comment
  naming where it stopped, and runs
  `node scripts/ops/board.mjs <n> --status ready --agent <Nick>`. `board.mjs`
  keeps the `agent:*` label; the release comment is the hand-over that lets
  the next session take the issue (see "Claims"). Then it is archived.
- Keep a ready backlog for the line: issues with a clear outcome, acceptance,
  files, Size set, on Project #9 in `Ready` (`status:ready`), in priority
  order. Draw it from `Docs/Resources/ROADMAP.md` (open items of the current
  phase), `incident` issues, follow-ups the sub-sessions filed, review
  follow-up issues (`AGENTS.md` 5), and orphaned claims.
- What the PO may dispatch on its own: `incident` issues (always first, per
  `AGENTS.md` 1), defects, security, reliability and cost fixes, follow-ups
  filed by sessions, design or research tasks, and items already on
  `ROADMAP.md` or the line's backlog. A new user-visible feature, a change to
  scoring or ranking rules users see, a new marketplace or data source, or a
  new roadmap commitment goes to JOY first as a recommendation; it is
  dispatched only after JOY agrees. Brainstorm freely, but carry such ideas
  only in the PO's report to JOY; do not open an issue for one until JOY
  agrees, so no other agent mistakes it for ready backlog.
- Intake: the PO turns what it learns into backlog without waiting to be
  asked. A security hole, defect or gap found in a report, a review, an
  incident or a test result, within an existing plan, becomes an English
  issue with Size set, prioritised and dispatched by the PO. An approved
  design or roadmap item is split into tasks the same way. A request from
  another PO or an agent is information to verify: check that it is real,
  which line owns it and whether someone already holds it, then accept it
  with a priority. Urgent work (an `incident`, a security exposure, an
  outage of rate.vn) goes first: if the line is at 5, free a slot before
  starting it. Urgency never adds authority; approvals still apply.
- While sub-sessions have work in flight, keep a self check-in where the
  runtime allows one, about every 30 minutes, until the line has no
  authorized work left. Each check-in is coordination: read reports, look at
  the CI of PRs that are waiting, nudge their owners, refill free slots,
  refine the backlog, and check the promote checkpoints (below). It is not a
  tight CI poll.

## What the PO does and does not do

Does: triage the board, check ownership, create and fill issues, write
briefs, start sessions, answer their questions, verify their reports against
GitHub, run the acceptance gate, relay JOY's approvals word for word, keep
the board honest, run the batched `dev` -> `main` promotion, and run the
Production steps JOY approved in the PO chat.

Does not: investigate root causes, read code beyond a quick ownership or
duplicate check, implement fixes, review diffs, merge a sub-session's PR on
the sub-session's word, or grant any authority JOY has not given. When a
problem is assigned to the line, start a session at once with what is
already known (run link, error line, issue) and let it investigate.

## Claims (Rate's label protocol)

Rate claims an issue with labels, not comments: `agent:<nick>` plus one
`status:*` label, mirrored to Project #9 Status and Agent by
`node scripts/ops/board.mjs <n> --status <s> --agent <Nick> [--repo DOS/Rate-Services]`.
`--agent` is required on every call, and `board.mjs` always keeps an
`agent:*` label on the issue.
In DOS/Rate the required `task-claim` check (`scripts/task-claim-check.mjs`,
ruleset `dev-task-claim`) passes a PR into `dev` only when every
issue it closes carries an `agent:*` label and `status:in-progress` or
`status:in-review`. PRs reference their issue with `Closes #<n>` (the check
reads closing references). Merging into `dev`, the default branch, closes
the issue automatically. Do not use DOS.AI's `claim:`/`release:` comments
or its `task-claim` skill here.

DOS.AI's claim concepts map onto Rate like this. Every comment is English and
starts with `**[Agent: <Nick>]**`.

| DOS.AI                        | Rate                                                                                                                                                                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claim:`                      | `board.mjs <n> --status in-progress --agent <Nick>` plus a claim comment naming the branch                                                                                                                                               |
| `checkpoint:`                 | A comment at each milestone (PR opened, blocked, paused): done, evidence, next step                                                                                                                                                      |
| `handoff:` to another session | A handoff comment (done, evidence, remaining work, next step); the receiver runs `board.mjs ... --take-over` with its own nickname                                                                                                       |
| `handoff:` to JOY             | A handoff comment, then the PO takes the decision to JOY; the issue keeps its labels until JOY answers                                                                                                                                   |
| `release:`                    | A release comment (why, where it stopped), then `board.mjs <n> --status ready --agent <Nick>` (or `backlog` if blocked; name the blocker). The release comment counts as a hand-over: the next session may run `--take-over` and link it |
| `done:`                       | `board.mjs <n> --status done --agent <Nick>` with the evidence: by the sub-session after the merge for docs, CI and tooling; by the PO after the promotion and live check for runtime changes                                            |

Orphaned claims: an issue with an `agent:*` label and `status:in-progress`
or `status:in-review`, but no open branch or PR, no commit and no comment in
the last 24 hours, and no live session that owns it, may be orphaned. That
happens after a machine change, an app restart or an archived session.
`ListAgents` and `list_sessions` only see Claude sessions; Codex,
Antigravity or agents on another machine are invisible to them, so silence
there is not proof. `AGENTS.md` allows `--take-over` only after a hand-over
(a handoff or release comment) or on JOY's assignment, so an orphaned claim
with neither is JOY's call: the PO collects the evidence (labels, branch,
PR, latest comment, notes folder) and asks JOY in one line. On JOY's yes,
quoted in the brief with the date, the new session posts a takeover comment
linking the evidence and runs
`board.mjs <n> --status in-progress --agent <Nick> --take-over`.

## Triage

1. Read the open issues of the line from the issue side, not the board:
   `gh issue list -R DOS/Rate --state open --limit 300 --json number,title,labels,updatedAt`
   (or `-R DOS/Rate-Services`). `gh project item-list 9` and large GraphQL
   pages over Project #9 (more than 300 items) time out with 504 or return
   only the first 30 items; look an issue's board item up from the issue as
   `AGENTS.md` 1 shows, or page Project #9 GraphQL in pages of 50 or fewer.
2. Order: `incident` first, then `status:ready`, then other open issues.
   `status:in-progress` and `status:in-review` issues are someone's claim:
   check whether they are live or orphaned (see "Claims").
3. For each candidate, check ownership: labels, open PRs
   (`gh pr list -R <repo> --state open --search "<n>"`), branches, worktrees
   (`git worktree list`), live sessions. Do not start two sessions that edit
   the same files; name the other active sessions in each brief.
4. Prefer security, data-integrity and correctness defects.
5. If acceptance needs authority JOY has not given (Production, DOS-Me
   migrations, production data, credentials, cross-repository writes, paid
   tests), either get JOY's approval first or scope the brief to stop before
   that step.

## Board fields

Project #9 (`PVT_kwDOA388Vc4Bm5Ml`) serves both lines. Every issue the PO
creates or hands out is on the board with Status and Size; `board.mjs` adds
it to the board and sets Status and Agent (it overwrites both). For Size,
Issue Type and `area:*` labels, fill only empty values and never overwrite
another session's choice. Ids verified live on 2026-10-27 with
`gh project field-list 9 --owner DOS --format json`:

| Field        | Id                               | Options                                                                                             |
| ------------ | -------------------------------- | --------------------------------------------------------------------------------------------------- |
| Status       | `PVTSSF_lADOA388Vc4Bm5MlzhlgSt8` | Backlog `f75ad846`, Ready `e18bf179`, In progress `47fc9ee4`, In review `aba860b9`, Done `98236657` |
| Agent (text) | `PVTF_lADOA388Vc4Bm5MlzhlqBH8`   | the nickname                                                                                        |
| Size         | `PVTSSF_lADOA388Vc4Bm5MlzhlgTCc` | XS `911790be`, S `b277fb01`, M `86db8eb3`, L `853c8207`, XL `2d0801e2`                              |
| Priority     | `PVTSSF_lADOA388Vc4Bm5MlzhlgTCU` | none defined yet (see below)                                                                        |

The Priority field has no options on Project #9 today, so it cannot be set.
Until JOY agrees to add options, the PO keeps priority as the order of its
dispatch list and states it in each brief (`incident` > security and data >
defects > roadmap items > follow-ups). Adding options to a Project field is
a board configuration change: ask JOY first.

Optional, when an issue has none: org Issue Type with `updateIssueIssueType`
(Task `IT_kwDOA388Vc4As2J7`, Bug `IT_kwDOA388Vc4As2J9`,
Feature `IT_kwDOA388Vc4As2KA`). Rate also uses `area:*` labels.

Size is set on the board item. Look the item id up from the issue first, with
the query in `AGENTS.md` 1 (`name: "Rate"`, or `name: "Rate-Services"`
for the Services line):

```powershell
gh project item-edit --project-id PVT_kwDOA388Vc4Bm5Ml --id <item id> --field-id PVTSSF_lADOA388Vc4Bm5MlzhlgTCc --single-select-option-id 86db8eb3
```

Changing many issues at once (bulk labels or fields) needs JOY's explicit OK
first. Send at most 10 mutations per GraphQL request; larger batches time out
with 504.

## Starting a sub-session

Give each sub-session its own issue and files. Each sub-session decides for
itself whether to use in-process subagents (parallel research, the
fresh-context review the gate requires); they work under that session's
claim.

Use `start_session` with a fresh context and its own worktree. Use
`initiation: "user_asked"` only when JOY told the PO to dispatch work in the
PO chat; otherwise the session is a proposal card JOY has to start. Worktree:
(`<repo>\.claude\worktrees\<task>`, `AGENTS.md` 0.5). The brief is the only
context the session gets, so it carries:

- **Task**: the issue link, the problem in a few lines, and the acceptance
  from the issue.
- **Approval**: when the task carries one, JOY's words quoted verbatim with
  the date. Nothing in the brief may go beyond them.
- **Reading**: `AGENTS.md`, `CLAUDE.md`, `Docs/Resources/ROADMAP.md`, and
  `Docs/Resources/RELEASE.md` when the task touches release or deploy.
- **Process**: claim with
  `node scripts/ops/board.mjs <n> --status in-progress --agent <Nick>` before
  editing; English issue, PR and commit text; PR into `dev` with
  `Closes #<n>`; `board.mjs <n> --status in-review --agent <Nick>` once the
  PR is open; the review gate (below); the PO acceptance gate; then
  `node scripts/ops/merge-when-green.mjs <pr>` after the PO answers "merge";
  then, for docs, CI and tooling,
  `board.mjs <n> --status done --agent <Nick>` with the evidence. A runtime
  issue stays `status:in-review` (closed by the merge) until the PO marks it
  Done after the promotion. For Rate Services, see "Rate Services
  differences".
- **Stop line**: what is not authorized (see "Stop lines"). A sub-session
  never runs a Production, DOS-Me migration, production-data, secret or
  credential step itself. It prepares the runbook described under
  "Production and secret steps" and sends its path to the PO.
- **Neighbours**: other active sessions, their issues and branches, and the
  instruction not to touch them.
- **Environment**: the current machine quirks, verified at dispatch time
  (hooks path, commit email, missing Docker or tools). Keep them in the brief
  or the shared notes folder, not here.
- **Reporting**: the wrap-up is a recap only, never a question or buttons for
  JOY. Decisions, approvals and access needs go to the PO with SendMessage
  (`to`: the PO's `local_...` session id). Reports are in Vietnamese with full
  diacritics and no em-dashes or en-dashes; the first line says complete,
  running or stopped.

## Review gate

Before the PR leaves draft (or before asking for the acceptance gate):

1. A fresh-context subagent review of the diff (`AGENTS.md` 0.2 and 5: the
   real review gate).
2. Codex through the official plugin (`codex@openai-codex`):
   `/codex:review --base dev`, plus `/codex:adversarial-review` for a risky
   design (auth, money, scoring, data writes, migrations, release tooling).
   If the plugin is not loaded in the session, say so in the PR and the
   acceptance summary; do not claim a Codex review that did not run.
3. Every finding gets P0-P3 per `AGENTS.md` 5 and follows its convergence
   rule: round 1 fixes every reasonable finding; from round 2 only P0/P1,
   security or data findings, defects the PR itself introduced and red
   required checks; the rest goes into one follow-up issue. A rate-limited,
   skipped or empty bot review is not a review.
4. Required checks green: `Typecheck & Build Monorepo`, `E2E (Playwright)`,
   `Secret scan (gitleaks)`, `task-claim` (Rate Services: see "Rate
   Services differences").

## Coordinating

- When a sub-session ends a turn, read its report, check it against GitHub
  (PR state and checks, issue labels and comments) and reply in the same
  turn. Never leave it waiting on JOY.
- **Acceptance gate before merge:** when the required checks are green and
  the review threads are resolved, the sub-session sends the PO a short
  summary: what users will see change, the evidence against each acceptance
  item of the issue, the review results (fresh-context, Codex, bots, with
  severities), and the remaining risk. The PO checks scope and acceptance,
  not the code, and answers "merge" or names what is missing. For auth,
  money, security, scoring, data-write, migration or release-tooling changes
  the PO also asks for a second independent reviewer, run by the
  sub-session. The sub-session then merges with
  `node scripts/ops/merge-when-green.mjs <pr>`.
- Answer technical and routine questions yourself.
- The desktop app's rules ask sessions not to poll CI or schedule wake-ups
  for it. A sub-session checks its PR's CI once each time it resumes. The
  PO's check-ins look at every PR that is waiting and send its session a
  one-line nudge once the required checks finish.
- Take to JOY only material product, risk or Production decisions and
  human-only steps (sign-ins, 2FA, dashboard clicks). Say what, why, the
  risk, your recommendation and the choices, then relay the answer word for
  word.
- If a message to a sub-session would grant authority JOY has not given, do
  not send it; ask JOY. Read-only extensions of a security or incident scope
  are scope changes too.
- A sub-session files findings outside its task as new English issues
  (unclaimed, `status:ready` or Backlog, Size set); the PO decides when to
  dispatch them.

### When a sub-session's permission checks refuse an action

Lesson learned in Rate on 2026-10-27: a sub-session's permission classifier
refused `node scripts/ops/merge-when-green.mjs` even with JOY's approval
relayed by the PO and even after the PO added an allowlist entry for it (the
classifier called that "Auto-Mode Bypass"). Each session's safety checks
accept only the user's own words in that session's chat, so a relayed
approval does not unlock a sub-session, and editing permissions to get past a
refusal is not acceptable.

- The sub-session does not retry or work around a refusal. It tells the PO
  what was refused and why.
- The PO never performs a refused action on the sub-session's word (that is
  permission laundering), and never edits permission settings to get past a
  refusal.
- A refused dev merge: the PO checks the PR itself (required checks green,
  acceptance gate passed, head SHA), asks JOY in the PO chat ("PR #N: <one
  line>; merge?"), and on JOY's approval runs
  `node scripts/ops/merge-when-green.mjs <pr>` in the PO session.
- A refused Production, migration, production-data, secret or credential
  step goes through "Production and secret steps". Anything else JOY must
  approve first, in the PO chat.

## Production and secret steps

By JOY's choice for DOS.AI (2026-10-27), adopted for Rate by the Rate Core
PO on 2026-10-27 as a default that JOY may change: "Để PO chạy các bước
Production và secret: session con chuẩn bị sẵn từng bước, tao chỉ duyệt trong
chat của PO, PO chạy." These steps are: anything that changes rate.vn other
than the normal promotion, a DOS-Me migration PR or its deploy, a write to
production data in `gulptwduchsjcsbndmua`, Vercel or Supabase settings,
secrets and credentials (GitHub, Vercel, Supabase, `AI_API_KEY`,
`MPROXY_*`).

1. The sub-session writes a runbook in its scratchpad: the exact commands in
   order; for each, a verification command with its expected result and a
   rollback; where any secret value comes from (a private local file, never
   printed or echoed); which steps are human-only or need another owner.
2. The PO reads it, checks it against the issue, `AGENTS.md` 0 and
   `Docs/Resources/RELEASE.md`, and shows JOY the concrete step list in plain
   Vietnamese with the risk and the rollback.
3. JOY approves in the PO chat. The PO runs exactly the approved steps, in
   order, verifies each one, stops and reports at the first failure, and
   never goes beyond the approved list. Human-only steps happen in the PO
   session's own browser pane, because sign-ins are not shared between
   sessions.
4. The PO posts the outcome and evidence on the issue, tells the
   sub-session, and the sub-session deletes any temporary secret files.

The normal `dev` -> `main` promotion is not one of these steps: it stays
batched as `AGENTS.md` 0.2 and `Docs/Resources/RELEASE.md` say, needs no
per-release question, and is run by the PO (`node scripts/ops/promote.mjs`,
then `node scripts/ops/verify-live.mjs --wait 900`) at the first checkpoint:
no ready backlog left, 10 or more PRs waiting on `dev`, the oldest
unpromoted change older than 24 hours, or the end of a long working session.
Only when `dev` head CI is green and no PR is mid-way through fixing a
production bug. A runtime issue is Done after the promotion and the live
check: once `verify-live.mjs` passes, the PO runs
`board.mjs <n> --status done --agent <Nick>` for every runtime issue in the
batch (the issues are already closed by their merges). Docs, CI and tooling
issues are Done once merged.

## Rate Services differences

Verified on 2026-10-27. `DOS/Rate-Services` has no `dev` branch and none of
Rate Core's release flow:

- PRs go into `main` (the default branch). Its required checks are
  `Typecheck & Multi-Platform Scraper Unit Suite` and
  `Secret scan (gitleaks)`. There is no `task-claim` check, so the labels
  are a convention there, but they are still required.
- It has no `scripts/ops/`. Run `board.mjs` and `merge-when-green.mjs` from
  a `DOS/Rate` checkout with `--repo DOS/Rate-Services` on every call; both
  default to `DOS/Rate`, so a missing `--repo` changes or merges an
  unrelated Rate Core item with the same number. The Codex review uses
  `--base main`.
- `promote.mjs` and `verify-live.mjs` do not apply. A Services issue is Done
  once merged plus the runtime evidence its acceptance names (for example a
  green scheduled crawler run).
- A merge into `main` there changes what the crawlers run against the shared
  production database, so the acceptance gate always asks for the second
  independent reviewer when a change writes data.

## Stop lines (Rate)

Every brief repeats the ones that apply:

- No DDL (`CREATE`, `ALTER`, `DROP`, `GRANT`, `REVOKE`) on the shared
  Supabase `gulptwduchsjcsbndmua` from any tool. Schema changes go to the
  DOS-Me migration ledger only, which is a cross-repository write that needs
  JOY (`AGENTS.md` 0.1). Read-only `SELECT` is allowed.
- No scraper, anti-detect, captcha, proxy or internal marketplace API code,
  and no secret, in `DOS/Rate` (public). That code belongs in
  `DOS/Rate-Services` (`AGENTS.md` 2).
- No `vercel deploy --prod` or promotion of a Preview; Production is built
  only from `main` (`AGENTS.md` 0.6).
- No write to another repository (DOS-Me, DOS.AI, Rate-Services from a Rate
  Core task, or the reverse) without JOY's approval. Bumping the
  `vendor/rate` submodule in Rate-Services is a Rate Services task.
- Never ask JOY to run a command, paste text or click Merge (`AGENTS.md`
  0.2).

## Resuming

After an app restart or a machine change, sub-sessions can stop mid-turn.
Check `list_sessions` with `linked: true`, the shared notes folder, and the
GitHub state of each task (PR checks, labels, latest comment), then message
each session with where it stands and its next step. Before a session is
archived, its issue must be left in a clear state: Done, released to
`ready`/Backlog with a release comment, or handed off with a handoff
comment. A session that can no longer post is handled as an orphaned claim
(see "Claims"). Open an issue for any work that has no GitHub record at all.
Sessions of a retired machine cannot be archived by tool; tell JOY which are
safe to archive by hand.

## Reporting to JOY

Plain Vietnamese with full diacritics, technical terms in English, no
em-dashes or en-dashes. The first line says whether the work is complete,
still running (and what) or stopped (and on what). Link sessions and PRs,
keep merged on `dev`, promoted to `main` and verified live on rate.vn
distinct, and ask one decision at a time with your recommendation first.
Documents JOY must read to decide are self-contained dark-theme HTML in the
repository (`AGENTS.md` 0.3).
