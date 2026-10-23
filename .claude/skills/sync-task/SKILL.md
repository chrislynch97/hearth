---
name: sync-task
description: Use when a Hearth task branch has gone stale against main outside the loop — "/sync-task 42-slug", "merge main in", "bring the branch up to date", "fix the conflicts". Merges origin/main into the branch (never rebase), resolves conflicts, verifies, and pushes if the branch is already on GitHub. Build and Ship already sync as part of their phases.
---

# Sync a task branch

**Model:** Opus, high effort.

**Session title:** run it wherever you are. In a task session keep its title; in a fresh one, set
`(Sync) <key>` first (ToolSearch `select:mcp__ccd_session_mgmt__set_session_title`,
`session_id: "self"`; skip silently if unavailable).

Main into the branch, never the reverse and never a rebase: a PR may already be open.
`<wt>` is the main checkout's `.claude/worktrees/<key>`.

## Steps

1. **Clean tree.** `git -C <wt> status --porcelain` must be empty; otherwise stop and say so.
   Never stash or commit Chris's work.
2. **Merge.** `git fetch origin main`, `git merge origin/main`. Already up to date: say so, stop.
3. **Resolve.** Per file, read both sides; a conflict is two intents. Keep both behaviours. A
   genuine design clash is listed for Chris, not guessed. Migrations: if both sides added one with
   the same number, renumber the branch's with `npm run db:generate` rather than hand-editing
   `drizzle/meta`. `package-lock.json`: take main's and `npm install` to regenerate.
4. **Verify**: `npm run typecheck`, `npm test`.
5. **Commit** with git's default merge message.
6. **Push** with plain `git push` if the branch has an upstream; none means it was never pushed,
   so stop there.
7. **Status** in three lines: files resolved and how, verification result, pushed or not. Append
   `sync: <date> — <pushed | not pushed>` to the ledger, and the run log line (`step: "sync"`).

## What not to do

| Mistake | Why |
|---|---|
| `git rebase` or `--force` | Loses the PR's history. |
| Taking one side wholesale | Drops an intent silently. |
| Hand-merging generated files | Regenerate them. |
| Stashing or committing Chris's work | A dirty tree is a stop. |
