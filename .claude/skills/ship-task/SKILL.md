---
name: ship-task
description: Use when a Hearth task has passed testing and Chris wants it landed — "/ship-task 42-slug", "ship it". Syncs with main, pushes, opens the PR, turns on squash auto-merge so CI is the gate, then on merge closes the issue, removes the worktree and archives the task's sessions. The ask is the authorisation for all of it.
---

# Ship a task

**Model:** Opus, medium effort.

**Session title:** `(Ship) <key>`. Set it first: ToolSearch
`select:mcp__ccd_session_mgmt__set_session_title`, call with `session_id: "self"`. Skip silently if
unavailable.

Chris invoking this is the authorisation to push, open the PR, enable auto-merge, close the
issue, remove the worktree and archive the task's sessions. Don't ask again. `<main>` is the main
checkout, `<wt>` its `.claude/worktrees/<key>`, `<tasks>` its `.claude/tasks/<key>/`.

## Steps

1. **Preconditions.** Clean tree in `<wt>`. No unticked lines in `findings.md`. The ledger has a
   `manual-test:` line without `FAILED` (or Chris says he's tested it). Otherwise say what's
   missing and stop.
2. **Sync.** Run the `sync-task` steps against `origin/main` (merge, never rebase). If the merge
   brought changes, re-run `npm run typecheck` and `npm test`.
3. **Push**: `git push -u origin <key>`.
4. **PR.** `gh pr create --repo chrislynch97/hearth --base main --title "<outcome>" --body-file <file>`.
   Title is the user-visible outcome in plain words. Body, terse:
   - **What**: one line.
   - **Why**: one or two lines, from the plan's goal.
   - **Changes**: a few bullets naming the files that carry the decisions.
   - **Tested**: from the ledger (`checks:`, `manual-test:`, `review:` lines).
   - The close line: `Closes #<n>` for a `hearth` issue; for a planning issue
     `Closes chrislynch97/hearth-planning#<n>` plus "closed by hand after merge (cross-repo)".
   - The attribution line from the session reminder.
5. **Hand CI the gate.** ToolSearch
   `select:mcp__ccd_pr__bind_pr,mcp__ccd_pr__get_status,mcp__ccd_pr__set_auto_merge,mcp__ccd_pr__set_monitor`.
   `bind_pr` the URL, `set_auto_merge` on with `squash`, and `set_monitor` with `auto_fix` on so
   this session is woken on a CI failure or conflict. Never poll CI yourself.
6. **Ledger and report.** Append `shipped: <date> — PR #<n>` to `<tasks>/status.md`, report the
   PR URL to the manager, and wait.

## When woken

- **CI failed or conflict**: read the failure, say what broke in two lines, report to the manager
  as `ship: <date> — CI failed: <check>`. The fix goes through `fix-task` in `(Build)`; then
  Chris commits and this session pushes again on his word. A conflict: run the `sync-task` steps
  and push.
- **Merged**:
  1. Planning issue: `gh issue close <n> --repo chrislynch97/hearth-planning --comment "Shipped in chrislynch97/hearth#<pr>"`.
  2. `git -C <main> worktree remove <wt>` (left alone, and named, if dirty), `git -C <main> branch -D <key>`,
     `git -C <main> fetch --prune`, and fast-forward the main checkout if it's on a clean `main`.
  3. Append `done: <date> — PR #<n> merged` to the ledger and print the whole ledger.
  4. Archive the group: ToolSearch
     `select:mcp__ccd_session_mgmt__list_sessions,mcp__ccd_session_mgmt__archive_session,mcp__ccd_sidebar__set_pinned,mcp__ccd_sidebar__move_sessions,mcp__ccd_sidebar__delete_group`.
     Unpin the `(Task) <key>` session (don't message it — a busy session can't be archived),
     `archive_session` each session in the `<key>` group except this one with
     `reason: "<key> shipped"`, then move this session out and `delete_group`. Name any that
     wouldn't archive; don't retry in a loop.
  5. Report in three lines (PR, issue, cleanup), then `archive_session` self as the last action.

## What not to do

| Mistake | Why |
|---|---|
| Shipping with open findings or failed steps | Precondition; say what's missing. |
| Rebasing or force-pushing | Merge `main` in; history on the PR stays intact. |
| Polling `gh pr checks` | The app wakes this session; auto-merge does the landing. |
| Merging past red CI with `--admin` | CI is the gate; that's Chris's call, never this session's. |
| Deleting a dirty worktree | Name it and leave it. |
