---
name: review-task
description: Use when Chris wants a committed Hearth task branch reviewed before testing — "/review-task 42-slug", "review this branch". Run in a fresh session, which is the cold reviewer. Runs the built-in code-review skill against the branch, records findings for fix-task. Report only; never fixes.
---

# Review a task

**Model:** Opus, high effort.

**Session title:** `(Review) <key>`. Set it first: ToolSearch
`select:mcp__ccd_session_mgmt__set_session_title`, call with `session_id: "self"`. Skip silently if
unavailable.

A fresh session is already cold, so this session is the reviewer. Conventions are in the repo
`CLAUDE.md` → *Task loop*. `<wt>` is the main checkout's `.claude/worktrees/<key>`, `<tasks>` its
`.claude/tasks/<key>/`.

## Steps

1. **Check the branch.** `cd <wt>`; `git branch --show-current` is `<key>` and
   `git status --porcelain` is empty. Uncommitted work: stop and say to commit first.
   `git fetch origin main`.
2. **Review.** Invoke the `code-review` skill with args `high <key>` — the branch as target, so
   it reviews the committed `origin/main...HEAD` diff, not the working tree. Don't accept a summary of the
   change from anyone; the issue and the diff are the statement of intent.
3. **Then the plan.** Read `<tasks>/plan.md` only after the review, to check its *Doing
   differently* items were deliberate. A finding the plan explicitly chose is dropped.
4. **Attribute.** Drop anything already on `origin/main`; only what the branch introduces or
   regresses counts.
5. **Findings file.** Append to `<tasks>/findings.md` under `## Review <date>`, one line per
   finding: `- [ ] N. **title** `file:line` — the problem and the fix as an instruction`.
   Never rewrite earlier sections. Print the same list in chat.
6. **Ledger.** Append `review: <date> — <n> findings` (or `— clean`) to `<tasks>/status.md`.
7. **Stop.** No fixes, no commits. Close with
   `Next: /fix-task <key> — in the (Build) session · Opus, high`, or with zero findings
   `Next: /test-task <key> — new session · Opus, medium`.

**Re-run here** (a second review after fixes): re-review the whole branch, and say for each
earlier finding whether its fix holds.

**Report to the manager.** Last action: `send_message` the ledger line to the session id the
manager named; fallback `list_sessions`, the session titled `(Task) <key>`. No manager, no message.

## What not to do

| Mistake | Why |
|---|---|
| Fixing findings here | Chris decides; `fix-task` does it in `(Build)`. |
| Reviewing the working tree or the main checkout | The branch's commits are what ships. |
| Reading the plan first | It primes you to see what was meant, not what was written. |
| Flagging pre-existing problems | Only what the branch introduces. |
| Citing personal Claude config as the authority | State it as a codebase convention and point at an in-repo example. |
