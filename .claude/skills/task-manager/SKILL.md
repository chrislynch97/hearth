---
name: task-manager
description: Use when Chris wants one pinned session to see a Hearth task through from plan to merge — "/task-manager 42", "/task-manager <issue link>", "/task-manager <idea>", "manage this", "where am I with 42", "next step". Orchestrates only: reads the ledger, spawns each step session on the right model, groups them in the sidebar, receives each step's report. Never does a step's work itself.
---

# Task manager

**Model:** Opus, medium effort.

**Session title:** `(Task) <key>`.

One pinned session per task. It holds no code and changes nothing beyond the ledger, the
sidebar and other sessions' settings. Conventions (key, paperwork paths, ledger) are in the
repo `CLAUDE.md` → *Task loop*.

Tools: load once with ToolSearch `select:mcp__ccd_session_mgmt__get_session,mcp__ccd_session__spawn_task,mcp__ccd_sidebar__create_group,mcp__ccd_sidebar__list_groups,mcp__ccd_sidebar__rename_group,mcp__ccd_sidebar__move_sessions,mcp__ccd_sidebar__set_pinned,mcp__ccd_session_mgmt__list_sessions,mcp__ccd_session_mgmt__set_session_model,mcp__ccd_session_mgmt__set_session_effort,mcp__ccd_session_mgmt__set_session_fast_mode,mcp__ccd_session_mgmt__set_session_title,mcp__ccd_session_mgmt__send_message`.

## On `/task-manager <issue | link | idea | key>`

1. **Own id first.** `get_session` with `session_id: "self"`; keep the `sessionId` (`local_…`).
   That is the only source of this session's id — never one derived from a file path or memory.
2. **Work out the key.** An issue number or link: `gh issue view <n> --repo <repo> --json title`
   (`chrislynch97/hearth-planning` unless the link says `hearth`), key `<n>-<slug>`. An existing
   key: use it. A free-text idea: key `<slug>`; there is no issue yet, and `plan-task` may file one
   (it then renames the key and tells you).
3. **Title, group, pin.** Set the title. `list_groups`; create `<key>` if absent and move self into
   it (moving unpins), then `set_pinned` self. `list_sessions` for sessions whose title carries the
   key (a `(Plan)` or `(Build)` started by hand) and move them in too.
4. Read `status.md` and `findings.md` in the main checkout's `.claude/tasks/<key>/`. Print the
   ledger lines, then the next step. Offer it as a chip (*Spawning* below) and stop.

## Next-step rule

```
plan → build → review → fix (while findings are open) → test → ship
```

Next step is the first with no ledger line, except:

- Unticked lines in `findings.md` always mean `fix-task`.
- A `fix:` line that is the last line, with no `re-review:` after it, is a question, not a step.
  `fix-task` already gave the facts; relay its recommendation in one line, ask, append
  `re-review: <date> — requested` or `— skipped`, then offer `review-task` or `test-task`.
  Never offer a re-review unasked.
- A `manual-test:` line with `FAILED` means `fix-task`, then `test-task` again.
- `shipped:` with no `done:` means the ship session is waiting on CI; say so and offer nothing.
- `done:` means finished: print the ledger and stop.

| Step | Command | Title | Effort |
|---|---|---|---|
| plan | `/plan-task <key or issue>` | `(Plan) <key>` | xhigh |
| build | `/build-task <key>` | `(Build) <key>` | max |
| review | `/review-task <key>` | `(Review) <key>` | high |
| fix | `/fix-task <key>` | the `(Build)` session | high |
| test | `/test-task <key>` | `(Test) <key>` | medium |
| ship | `/ship-task <key>` | `(Ship) <key>` | medium |
| sync | `/sync-task <key>` | `(Sync) <key>` | high |

Efforts are read from each skill's `**Model:**` line at the time; the table is the fallback.

## Spawning a step

Chips cannot set a model, so the new session must not start work until this one has configured it.

1. `spawn_task` with `title` = the step title, `tldr` = one sentence (step, task), and `prompt`:

   ```
   You are the <Step> session for Hearth task <key>. Do exactly this and nothing else: ToolSearch select:mcp__ccd_session_mgmt__send_message,mcp__ccd_session_mgmt__list_sessions, then send the message "started <Step> <key>" to session <own id>. If delivery fails with "not found", list_sessions and send it to the session titled "(Task) <key>" instead. Then stop and wait for a message from that session.
   ```

2. When "started" arrives: `list_sessions` to find it by title, then `set_session_model` with the
   resolved Opus id, `set_session_effort` from the table, `set_session_fast_mode` off,
   `move_sessions` into the group, and `send_message` it the real command plus
   `Report back to session <own id> when you finish.` One line here saying what was sent.

**Reuse before spawn.** A repeated step goes to the session that ran it: look in the group for
the title prefix (`(Review)`, `(Test)`, `(Sync)`) and `send_message` it the command plus the
report-back line. `fix-task` and a build addendum always go to `(Build)`; a plan amendment to
`(Plan)`. A re-run keeps its earlier context, which is the point.

## Resolving the model id

Once per manager session: call `set_session_model` on the target with the id `latest`
(deliberately invalid); the refusal lists the ids the app offers. Take the Opus id with the
highest version (ignore dated suffixes; a `[1m]` variant is not newer). Cache it. Never type an id
from memory or from this file.

## Mid-loop additions

- **`add: <item>`** (small, within what's built): append `- [ ] <item>` under
  `## Additions <date>` in `findings.md`, send `/fix-task <key>` to `(Build)`. After its report,
  `review-task` and `test-task` re-run whatever the ledger says, because the new code has had
  neither.
- **`amend: <item>`** (new screen, endpoint, table, or a decision): send `amend: <item>` to
  `(Plan)`. After `plan: amended`, send `/build-task <key>` to `(Build)`, which builds only the
  addendum. Resume from `review-task`.
- Unsaid which: pick by the rule above and say which in one line.

## Receiving a report

Steps message their ledger line when done. Re-read the ledger and findings (the message is a
nudge), print the new line, then the next step and its chip. A failure (red checks, CI failed,
findings) is said plainly with the right next step; never skip ahead. A plan with open questions
is not done: tell Chris to answer in `(Plan)` and wait.

**Key renamed** (`plan-task` filed an issue for an idea): retitle self `(Task) <new key>`,
`rename_group` to the new key, and use it from then on.

## What not to do

| Mistake | Why |
|---|---|
| Doing a step's work here | No worktree, no context. |
| Putting the real command in the chip prompt | It would run on the app's default model. |
| Guessing the ledger from memory | Steps write it; re-read it every turn. |
| Hardcoding a model id | Resolve the newest Opus from the app's list each session. |
| Spawning `fix-task` fresh | It needs the `(Build)` session's context. |
| Merging, pushing or closing issues | That's `ship-task`. |
