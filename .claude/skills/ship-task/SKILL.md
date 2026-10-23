---
name: ship-task
description: Use when a Hearth task has passed its Check and needs landing — "/ship-task 42-slug", the message the Check session sends when everything passes, "push" after a CI fix was re-checked, or a wake-up from the app on CI or merge. Syncs, pushes, opens the PR, turns on squash auto-merge so CI is the gate, then on merge closes the issue, removes the worktree and archives the task's sessions.
---

# Ship a task

**Model:** Opus, medium effort.

**Session title:** `(Ship) <key> — <state>`, per *State and title* below.

## Overview

Everything after Check passes, in one session that lives until the PR merges: **open the PR**,
**CI rounds** (repeated), **close-out**. Starting this session is the authorisation to push, open
the PR, enable auto-merge, close the issue, remove the worktree and archive the task's sessions.
Don't ask again. CI is the judge here; code fixes go to `(Build)` and come back through `(Check)`.

`<main>` is the main checkout, `<tasks>` its `.claude/tasks/<key>/`, `<wt>` its
`.claude/worktrees/<key>`.

## Phase 1 — Open the PR

1. **Preconditions.** Clean tree in `<wt>`. No unticked lines in `findings.md`. The latest
   `auto-test:` and `manual-test:` lines have no `FAILED`. Otherwise say what's missing and stop.
2. **Sync** if main moved since Build's: per `sync-task`, merge never rebase, re-verify.
3. **Push**: `git push -u origin <key>`, the first and only time upstream is set.
4. **PR.** `gh pr create --repo chrislynch97/hearth --base main --title "<type>(<area>): <outcome>"
   --body-file <file>`. Title matches the repo's squash subjects. Body, terse:
   - **What**: one line.
   - **Why**: one or two lines, from the plan.
   - **Changes**: a few bullets naming the files that carry the decisions.
   - **Tested**: from the ledger (`review:`, `checks:`, `auto-test:`, `manual-test:`). Nothing
     claimed that the ledger doesn't show.
   - The close line: `Closes #<n>` for a `hearth` issue; for a planning issue
     `Closes chrislynch97/hearth-planning#<n>` plus "closed by hand after merge (cross-repo)".
   - The attribution line from the session reminder.
5. **Hand CI the gate.** ToolSearch
   `select:mcp__ccd_pr__bind_pr,mcp__ccd_pr__get_status,mcp__ccd_pr__set_auto_merge,mcp__ccd_pr__set_monitor`.
   `bind_pr` the URL, `set_auto_merge` on with `squash`, `set_monitor` with `auto_fix` on so the
   app wakes this session on a failure, conflict or merge. Never poll CI.
6. Append `pr: <date> — <url>`. State: `waiting — CI`. Report the URL and stop.

## Phase 2 — CI rounds

- **CI failed**: read the failure, say what broke in two lines. Append it to `findings.md` under
  `## CI <date>` and `send_message` the `(Build)` session `ci: <check> failed for <key>. Fix from
  the findings file.` State: `waiting — CI fix in Build`. When Check sends `push <key>` after the
  re-check: sync if main moved, `git push`, append `sync: <date> — pushed CI fix`, state
  `waiting — CI`.
- **Conflict**: run the `sync-task` steps here and push.
- **Review comments** (rare; a solo repo): same verdicts as Build's fix phase, proposed to Chris
  first; nothing is fixed here.

## Phase 3 — Close-out

On merge:

1. Planning issue: `gh issue close <n> --repo chrislynch97/hearth-planning --comment "Shipped in chrislynch97/hearth#<pr>"`.
2. `git -C <main> worktree remove <wt>` (a tree whose only change is `package-lock.json` counts
   as clean; anything else: leave it and name it), `git -C <main> branch -D <key>`,
   `git -C <main> fetch --prune`, and fast-forward the main checkout if it's on a clean `main`.
3. Append `merged: <date> — PR #<n>` and `done: <date>`; state `done`. Print the whole ledger.
4. **Sessions.** ToolSearch
   `select:mcp__ccd_session_mgmt__list_sessions,mcp__ccd_session_mgmt__archive_session,mcp__ccd_sidebar__list_groups,mcp__ccd_sidebar__move_sessions,mcp__ccd_sidebar__delete_group`.
   Archive every other session in the `<key>` group with `reason: "<key> shipped"`, then move this
   one out and `delete_group`. Name any that wouldn't archive; don't retry in a loop.
5. Report in three lines (PR, issue, cleanup), append the run log line, then `archive_session`
   self as the last action.

## State and title

At every transition, rewrite line 1 of `<tasks>/status.md` to `state: <state>`, then set this
session's title to `(Ship) <key> — <state, shortened>` with `set_session_title`
(`session_id: "self"`). States: `needs you — <ask>`, `running — <what>`, `waiting — <on what>`,
`done`.

## Run log

At the end of each phase, append one JSON line to `<main>/.claude/tasks/workflow-log.jsonl` (shape
in `build-task` → *Run log*, `step: "open-pr" | "ci" | "close-out"`).

## What not to do

| Mistake | Why |
|---|---|
| Shipping with open findings or failed steps | Precondition; say what's missing. |
| Fixing code here | CI judged it; Build fixes, Check re-checks. |
| Rebasing or force-pushing | Merge main in; the PR's history stays intact. |
| Polling `gh pr checks` | The app wakes this session; auto-merge lands it. |
| Merging past red CI with `--admin` | CI is the gate; that's Chris's call, never this session's. |
| Deleting a dirty worktree | Name it and leave it. |
