---
name: task
description: Use to do any Hearth feature or fix in this one session, from idea or issue to merged PR — "/task 42", "/task <issue link>", "spec this out", "ship it", "merge main in".
---

# Run a task

One session per task: plan, build, test, ship. Chris's usage is tight, so spend it on the work.

`<main>` is `$(git rev-parse --path-format=absolute --git-common-dir)/..`, `<wt>` is
`<main>/.claude/worktrees/<key>`. Key and tracker rules are in the repo `CLAUDE.md`.

## Keep it cheap

- No subagents, no starting other sessions, unless Chris asks.
- No paperwork: no status, findings or log files, no session titles or sidebar groups.
- Read only what the task needs, line ranges for big files. Don't re-read what you just edited.
- Pipe long output through `tail -n 30`. Never poll.
- One screenshot per screen and width, at `scale: 0.5` unless the detail matters.
- Short replies. The diff says what changed.

## Plan

1. Issue: `gh issue view <n> --repo chrislynch97/hearth-planning --comments` (`hearth` if the link
   says so), then read the code it touches and the nearest precedent.
2. **Small and clear:** skip the plan and build. **Otherwise:** reply with a short plan, then wait:
   the outcomes in product terms, anything that departs from the issue, and only the questions the
   code can't answer, each with a recommendation. No file names or durations.
3. Approval is the go for the whole build.

No issue yet: same plan. `file it` creates a `hearth-planning` issue with a short problem-framed
body; don't file unprompted.

## Build

1. Worktree, branch `<key>`: `git -C <main> fetch --prune`, then
   `git -C <main> worktree add --no-track <wt> -b <key> origin/main`.
2. Junction node_modules (PowerShell:
   `New-Item -ItemType Junction -Path <wt>\node_modules -Target <main>\node_modules`), or `npm ci`
   in `<wt>` if the task adds a dependency.
3. Build in `<wt>` by absolute path, fake data only. Run the tests you touched as you go
   (`npx vitest run <path>`). No `prettier --write`.
4. Before hand-back, once: `npm run typecheck`, `npm test`, `npm run lint`. E2e is CI's job.
5. UI changes: run `<wt>`'s demo in two Terminal tabs (`cwd` set to `<wt>`, never `<main>`), open it
   with `preview_start {url}`, and look at the changed screens at desktop and 375px, dialogs included.
   Server changes: call it once or lean on the tests.
6. Migrations, auth or tenancy: run `code-review medium` on the diff first. Anything else only when
   Chris says `review`.
7. Hand back uncommitted: a line or two, plus at most three test steps that need a person (a real
   phone, how something reads), with exact on-screen labels. UI changes: leave the demo running in
   the pane on the changed screen and say so; Chris tries it before he decides. Then wait.

## Ship

On `ship`, or `commit` for a commit alone. Saying it is the go for everything below. UI that changed
since Chris last had it in the pane goes back in front of him first.

1. Commit: one to four conventional commits (`feat(plan): …`).
2. Sync: `git fetch origin main`, `git merge origin/main`, never rebase. Main moved: re-run
   `typecheck` and `test`. Conflicts: keep both intents; same migration number on both sides,
   renumber with `npm run db:generate`; `package-lock.json`, take main's and `npm install`. A real
   design clash goes to Chris.
3. `git push -u origin <key>`, then `gh pr create --repo chrislynch97/hearth --base main`, titled
   `<type>(<area>): <outcome>`. Body: what, why, what was tested (only what actually ran), the close
   line from `CLAUDE.md`, the attribution line.
4. `gh pr merge <n> --repo chrislynch97/hearth --squash --auto`. Then `bind_pr` and `set_monitor` so
   the app wakes this session. CI failed: fix it here and push. Never `--admin`.

## Close out

On merge (a wake-up, or Chris says so):

1. Planning issue: `gh issue close <n> --repo chrislynch97/hearth-planning --comment "Shipped in chrislynch97/hearth#<pr>"`.
2. Unlink the junction first, or the remove follows it and empties main's `node_modules`:
   `cmd /c rmdir <wt>\node_modules` (no `/s`). Then
   `git -C <main> worktree remove <wt>`, `git -C <main> branch -D <key>`,
   `git -C <main> fetch --prune`; fast-forward main if it's clean. A dirty worktree stays; name it.
3. One line, done.
