---
name: fix-task
description: Use when Chris wants a Hearth task's open findings worked through in its build session — "/fix-task 42-slug", "fix the findings". Reads findings.md (review findings, failed manual-test steps, additions), fixes or declines each on its merits, leaves the tree uncommitted.
---

# Fix a task's findings

**Model:** Opus, high effort.

**Session title:** none; this runs in the `(Build) <key>` session.

Input is every unticked `- [ ]` line in the main checkout's `.claude/tasks/<key>/findings.md`:
review findings, failed manual-test steps and `## Additions` alike. A block pasted in the ask is
appended there first. `<wt>` is `.claude/worktrees/<key>`.

## Steps

1. **Confirm the branch.** `git -C <wt> branch --show-current` is `<key>`. No open lines: say so
   and stop.
2. **Assess each.** Verify against the code before either verdict. Never implement a finding just
   because it was raised; never dismiss one for the same reason. A fix that would change designed
   behaviour or reach beyond the task goes under 👀 *Your call*, unfixed. An addition is built as
   asked.
3. **Fix**, one change per finding, following the repo conventions.
4. **Verify**: `npm run typecheck`, `npm test`, `npm run lint` in `<wt>`. Red stays red.
5. **Leave it uncommitted.**
6. **Findings and ledger.** Tick each handled line and append ` — fixed`, ` — declined: <reason>`
   or ` — your call`. Append `fix: <date> — <n> fixed, <n> declined, <n> your call` to
   `status.md`.
7. **Report**, numbered, empty groups omitted: ✅ **Fixed** (what changed, files),
   🚫 **Declined** (why), 👀 **Your call** (with a recommendation).
   Then **Re-review?** in one short block: files and lines changed, whether every fix stayed inside
   the lines its finding named, whether any added a mechanism, and a recommendation — review again
   when a fix added a mechanism or reached beyond its lines, otherwise not. The call is Chris's;
   record his answer as `re-review: <date> — requested` or `— skipped`.
   End with `Next: commit, then /test-task <key> — new session · Opus, medium` (or
   `/review-task <key>` if he asked for a re-review).

**Report to the manager — after Chris has committed, never before.** Check
`git -C <wt> status --porcelain` is clean, then `send_message` the ledger line(s) to the session
id the manager named; fallback `list_sessions`, the session titled `(Task) <key>`. No manager, no
message.

## What not to do

| Mistake | Why |
|---|---|
| Committing or pushing | Chris commits after reading the diff. |
| Fixing beyond the open lines | Anything else is a separate ask. |
| Implementing everything to clear the list | A declined finding with a reason is a valid outcome. |
| Recommending a re-review by reflex | Give the facts; let the answer be no. |
