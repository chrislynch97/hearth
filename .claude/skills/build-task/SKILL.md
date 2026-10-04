---
name: build-task
description: Use when Chris wants work started on a planned Hearth task — "/build-task 42-slug", "build it", "start on this". Creates the branch and worktree off origin/main, loads the plan, and builds straight away. Leaves everything uncommitted for Chris to read and commit.
---

# Build a task

**Model:** Opus, max effort.

**Session title:** `(Build) <key>`. Set it first: ToolSearch
`select:mcp__ccd_session_mgmt__set_session_title`, call with `session_id: "self"`. Skip silently if
unavailable.

`/build-task` is the go; there is no further gate. Conventions are in the repo `CLAUDE.md` →
*Task loop*. `<main>` is the main checkout, `<tasks>` its `.claude/tasks/<key>/`, `<wt>` is
`<main>/.claude/worktrees/<key>`.

## Steps

0. **Re-run here after `plan: amended`**: skip to step 4, build only the plan's newest
   *Addendum*, then carry on from step 5.
1. **Load the plan** from `<tasks>/plan.md`. No plan and the change is more than a few lines: say
   so in one line and offer `/plan-task`; otherwise carry on.
2. **Worktree.** `git -C <main> fetch --prune`. If branch `<key>` exists, reuse it; else
   `git -C <main> worktree add --no-track <wt> -b <key> origin/main`. Check
   `git -C <wt> rev-parse --abbrev-ref @{upstream}` fails; if not, `git branch --unset-upstream`.
3. **node_modules.** Junction the main checkout's in (PowerShell:
   `New-Item -ItemType Junction -Path <wt>\node_modules -Target <main>\node_modules`). If the plan
   adds a dependency, skip the junction and `npm ci` in `<wt>` instead.
4. **One-line status** (worktree, branch, plan found), then **build from the plan** without asking.
   Work in `<wt>` by absolute path, never the main checkout. Follow `CLAUDE.md`, the client
   `CLAUDE.md` and the code-style rules; fake data only. If reality diverges from the plan, update
   `plan.md` and say so. Stop only for a decision the plan left open or a destructive action.
5. **Green before handing back**: `npm run typecheck`, `npm test`, `npm run lint` in `<wt>`.
   Red stays red in the report.
6. **Leave it uncommitted.** No `git add`, no `git commit`. Append `build: <date>` to
   `<tasks>/status.md`. Close with a short summary of what changed and
   `Next: commit, then /review-task <key> — new session · Opus, high`.

**Report to the manager — after Chris has committed, never before.** The next step reads the
branch, and an uncommitted tree isn't on it. Once he says he's committed (or asks you to commit),
check `git -C <wt> status --porcelain` is clean, then `send_message` the ledger line to the
session id the manager named; fallback `list_sessions`, the session titled `(Task) <key>`. No
manager, no message.

## What not to do

| Mistake | Why |
|---|---|
| Editing in the main checkout | It's shared with other sessions; work lands on the wrong branch. |
| Omitting `--no-track` | The branch would push to `main`. |
| Committing as you go | Chris reads the diff and commits; your commits hide what changed. |
| Asking for a "go" | `/build-task` is the go. |
| Running `prettier --write` | It rewrites whole files here; hand-match the surrounding style. |
| Reporting before the commit | The next session would review an empty branch. |
