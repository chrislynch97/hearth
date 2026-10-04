---
name: sync-task
description: Use when a Hearth task branch has gone stale against main — "/sync-task 42-slug", "merge main in", "bring the branch up to date", "fix the conflicts". Merges origin/main into the branch (never rebase), resolves conflicts, verifies, and pushes if the branch is already on GitHub.
---

# Sync a task branch

**Model:** Opus, high effort.

**Session title:** `(Sync) <key>`. Set it first: ToolSearch
`select:mcp__ccd_session_mgmt__set_session_title`, call with `session_id: "self"`. Skip silently if
unavailable (and skip it when run as part of `ship-task`).

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
   `sync: <date> — <pushed | not pushed>` to the ledger.

**Report to the manager.** Last action: `send_message` the ledger line to the session id the
manager named; fallback `list_sessions`, the session titled `(Task) <key>`. No manager, no message.

## What not to do

| Mistake | Why |
|---|---|
| `git rebase` or `--force` | Loses the PR's history. |
| Taking one side wholesale | Drops an intent silently. |
| Hand-merging generated files | Regenerate them. |
