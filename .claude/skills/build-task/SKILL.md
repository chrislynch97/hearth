---
name: build-task
description: Use to start or continue work on a Hearth task — "/build-task 42", "/build-task <issue link>", "/build-task 42-slug", "plan 42", "build it", a message from the Check session saying findings are ready, or "ci: …" from Ship. The task's one author session: plans, builds, fixes Check's findings, syncs with main, and starts the Check session on Chris's "commit".
---

# Build a task

**Model:** Opus, max effort.

**Session title:** `(Build) <key> — <state>`, per *State and title* below.

## Overview

One session writes everything for the task: the plan, the code, and every fix. It never judges its
own work; the `(Check)` session does that cold, and CI after the PR. Four phases, each resumable
from the ledger: **plan**, **build**, **hand to Check**, **fix**. Chris commits; this session never
commits unless he says `commit`.

Conventions are in the repo `CLAUDE.md` → *Task loop*. `<main>` is the main checkout
(`$(git rev-parse --path-format=absolute --git-common-dir)/..`), `<tasks>` its
`.claude/tasks/<key>/`, `<wt>` its `.claude/worktrees/<key>`.

## Phase 1 — Plan

Skipped when the ledger already has `plan:` (resume at the first phase with no line).

1. **Key.** An issue number or link: `gh issue view <n> --repo <repo> --comments`
   (`chrislynch97/hearth-planning` unless the link says `hearth`), key `<n>-<slug>` (slug from the
   title, four words max). An existing key: use it.
2. **Group and title.** ToolSearch
   `select:mcp__ccd_sidebar__list_groups,mcp__ccd_sidebar__create_group,mcp__ccd_sidebar__move_sessions,mcp__ccd_session_mgmt__set_session_title`.
   Find or create the group `<key>` and move this session into it. State: `running — plan`.
3. **Explore.** Parallel Explore agents over everything the issue names, the nearest existing
   precedent, and the callers of any shared code the change will go through. A `<tasks>/spec.md`
   from `spec-task` is the primary input. Read the relevant memories (tenancy model, db/client
   gotcha, static assets). Reconcile issue against code: deviate on evidence and list every
   deviation; never silently follow an instruction that looks wrong.
4. **Write `<tasks>/plan.md`** (shape below), send it with `SendUserFile` (`display: render`) and
   two or three lines: the size, the deviations, the questions. State:
   `needs you — approve plan`. Every change rewrites the file and re-sends it. Ask the questions in
   chat too, fold each answer in, re-send. The plan isn't approved while *Questions for you* has an
   entry.
5. **On approval**, which is the go for all of Phase 2 (never ask for another): create
   `<tasks>/status.md` with the state line and `plan: <date>`, then go straight on to Phase 2 in
   the same turn.

**Amendments.** `amend: <item>` after approval: read the current diff, add `## Addendum <date>` to
the plan in the same shape, settle its questions here, append
`plan: amended <date> — <five words>`, then build only what it adds. `add: <item>` is smaller:
append it to `<tasks>/findings.md` under `## Additions <date>` and build it as asked.

## Plan shape

**Header** (one line): `Size: medium · 7 touch points`. Small / medium / large by touch points.
No durations, ever.

### 1. For Chris

Plain bullets, fragments, no file or class names, no code. Must fit on one screen.

- **What's going to be done** — one bullet per user-visible outcome, in product terms.
- **Questions for you** — only when a choice is genuinely his. Each: the question in product terms;
  why the code can't decide it; option A → consequence, option B → consequence;
  *Recommend: A, because …*. A question the code can answer isn't one.
- **Different from the issue** — only where the plan departs: *issue says X → doing Y, because Z*.

### 2. For the build

```markdown
<details>
<summary>Build detail — N touch points</summary>

**Blast radius** — shared code touched and which other features go through it, one line each.

**Work** — touch points grouped by area (schema & migration / server / client), each the file and
one sentence on what changes; build order; tests inside the touch point they test. No snippets.

**Out of scope** — one bullet each, with the reason.

</details>
```

No verification section: how it's checked is Check's job. `.md` by default; `.html` only for a
flow diagram or UI sketch (load `artifact-design` first).

## Phase 2 — Build

1. **Worktree.** `git -C <main> fetch --prune`. Branch `<key>` exists: reuse it. Else
   `git -C <main> worktree add --no-track <wt> -b <key> origin/main`.
2. **No upstream.** `git -C <wt> rev-parse --abbrev-ref @{upstream}` must fail; if it prints
   anything, `git branch --unset-upstream`. Ship's first push sets it.
3. **node_modules.** Junction the main checkout's in (PowerShell:
   `New-Item -ItemType Junction -Path <wt>\node_modules -Target <main>\node_modules`). A plan that
   adds a dependency: skip the junction and `npm ci` in `<wt>`.
4. **Build from the plan** without asking. State: `running — build`. Work in `<wt>` by absolute
   path, never the main checkout. Follow `CLAUDE.md`, the client `CLAUDE.md` and the code-style
   rules; fake data only. Reality diverges from the plan: update `plan.md` and say so. Stop only
   for a decision the plan left open or a destructive action.
5. **Verify**: `npm run typecheck`, `npm test`, `npm run lint` in `<wt>`. Red stays red in the
   report.
6. **Hand back uncommitted.** Append `build: <date>`. State:
   `needs you — review and commit the build`. Close with: `Say "commit" to have this session commit
   and start Check, or commit yourself and say "done".`

## Phase 3 — Hand to Check

On Chris's sign-off (`commit`, or `done` after he committed):

1. `commit`: conventional-commit subjects (`feat(plan): …`, `fix(spend): …`), one to four logical
   commits. `done`: `git -C <wt> status --porcelain` must be clean.
2. **Sync with main.** `git fetch origin main`, `git merge origin/main` (never rebase); resolve per
   `sync-task`, re-run the step 5 checks, commit the merge with git's default message. Append
   `sync: <date> — merged origin/main` (or `— up to date`). A genuine design clash is listed for
   Chris and the hand-off waits.
3. **Start Check** per *Starting the next session*: title `(Check) <key>`, Opus, high, command
   `/check-task <key>`. State: `running — check`.

## Phase 4 — Fix

A message from `(Check)` saying findings are ready, or `ci: <failure>` from `(Ship)`, starts this
phase.

1. **Input** is every unticked `- [ ]` line in `<tasks>/findings.md`. A CI failure is appended
   first under `## CI <date>`. State: `running — fixes`.
2. **Assess each** against the code before either verdict. Never implement a finding just because
   it was raised; never dismiss one for the same reason. A fix that would change designed behaviour
   or reach beyond the task goes under 👀 *Your call*, unfixed. An addition is built as asked.
3. **Fix**, one change per finding, then verify as in Phase 2 step 5.
4. **Record.** Tick each line with ` — fixed`, ` — declined: <reason>` or ` — your call`. Append
   `fix: <date> — <n> fixed, <n> declined, <n> your call`.
5. **Report**, numbered, empty groups omitted: ✅ Fixed, 🚫 Declined, 👀 Your call. State:
   `needs you — review and commit fixes`. Close with: `Say "commit" to commit and send Check its
   re-check.`
6. **On `commit`** (or `done`): commit, sync as in Phase 3 step 2 if main moved, then
   `send_message` the existing `(Check)` session `/check-task <key> recheck`. A CI fix goes to
   `(Ship)` as `push <key>` once Check has re-checked it. State: `running — re-check`.

## State and title

At every transition, rewrite line 1 of `<tasks>/status.md` to `state: <state>` (insert it if
missing), then set this session's title to `(Build) <key> — <state, shortened>` with
`set_session_title` (`session_id: "self"`). States are `needs you — <the ask>`,
`running — <what>`, `waiting — <on what>` or `done`. Never rename the sidebar group.

## Starting the next session

Only a turn Chris typed may start a session; a turn begun by another session's message is refused.
So a hand-off happens on his sign-off turn, in that turn. ToolSearch
`select:mcp__ccd_session__start_session,mcp__ccd_session_mgmt__detach_session,mcp__ccd_session_mgmt__list_sessions,mcp__ccd_sidebar__move_sessions,mcp__ccd_session_mgmt__set_session_model,mcp__ccd_session_mgmt__set_session_effort,mcp__ccd_session_mgmt__set_session_fast_mode,mcp__ccd_session_mgmt__send_message`,
then:

1. **Reuse first.** `list_sessions`: a session in the `<key>` group whose title starts with the
   target's prefix gets `send_message` with the command, and nothing else happens.
2. Otherwise `start_session` (`initiation: "user_asked"`, `context: "fresh"`,
   `use_worktree: false`, the title, name `<step>-<issue#>`, prompt:
   `Set your title to <title> and wait for a message.`), `detach_session` it so it doesn't nest
   under this one, and `move_sessions` it into the `<key>` group.
3. `set_session_model` to the newest Opus id: pass it as you know it; when the result lists the
   picker's ids instead, take the highest Opus version. Then `set_session_effort`, and
   `set_session_fast_mode` off.
4. `send_message` it the command. Nothing is pinned.

## Run log

At the end of each phase, append one JSON line to `<main>/.claude/tasks/workflow-log.jsonl`:

```json
{"date":"2026-10-23","key":"65-keep-spend-date","step":"plan | build | fix","session":"<own id from get_session self>","model":"opus · max","outcome":"<verdict in a few words>","typed_turns":4,"redirects":["<each time Chris corrected course or asked for something this session should have done unasked; ≤12 words each>"],"skipped":["<parts of this skill not done, and why>"],"friction":"<one sentence on what slowed this phase, or empty>"}
```

`typed_turns` counts messages Chris typed since the last line. Never a secret or real data.

## What not to do

| Mistake | Why |
|---|---|
| Reviewing or testing your own build | That's marking your own work. Check does it cold. |
| Editing in the main checkout | It's shared with other sessions; work lands on the wrong branch. |
| Asking for a "go" after the plan is approved | Approval is the go. |
| Committing before Chris says `commit` | He reads the diff first. |
| Starting Check before the sync | Check must judge what will ship, merged with main. |
| Omitting `--no-track` | A push from the branch would target main. |
| Running `prettier --write` | It rewrites whole files here; hand-match the surrounding style. |
| Clearing findings by implementing everything | A declined finding with a reason is a valid outcome. |
