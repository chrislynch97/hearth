---
name: plan-task
description: Use when Chris wants a Hearth change thought through before any code — "/plan-task 42", "plan this issue", "spec this out", "have a think about", or a feature idea. Takes an issue number/link or a free-text idea, reads the code, writes one combined spec-and-plan to a file, iterates until it's settled, then hands over to build-task. Never builds.
---

# Plan a task

**Model:** Opus, xhigh effort.

**Session title:** `(Plan) <key>`. Set it first: ToolSearch
`select:mcp__ccd_session_mgmt__set_session_title`, call with `session_id: "self"`. Skip silently if
unavailable.

One document that says what we're building and how, for Chris to decide from. Conventions are
in the repo `CLAUDE.md` → *Task loop*. `<tasks>` below is the main checkout's
`.claude/tasks/<key>/`.

## Flow

1. **Read the input.** An issue: `gh issue view <n> --repo <repo> --comments`
   (`chrislynch97/hearth-planning` unless the link says `hearth`). An idea: what Chris wrote.
   The issue is guidance, not gospel.
2. **Explore first, silently.** Parallel Explore agents over everything it touches, the nearest
   existing precedent, and the callers of any shared code the change will go through. Read the
   relevant memories (tenancy model, db/client gotcha, static assets). Say nothing until the plan
   exists.
3. **Write `<tasks>/plan.md`** (shape below) and send it with `SendUserFile` (`display: render`).
   Reply in two or three lines: the size, the decisions worth his eye.
4. **Iterate.** Every change rewrites the file and re-sends it; never paste sections into chat.
   *Questions for you* is settled here: ask them in one chat message, fold each answer into the
   plan, re-send. The plan is not done while that section has an entry.
5. **Issue, when there isn't one.** Once settled, ask in one line whether to file it in
   `chrislynch97/hearth-planning`. On yes: `gh issue create` with a short problem-framed body
   (not the plan), then rename the key to `<n>-<slug>`: move `<tasks>`, retitle this session,
   and tell the manager the new key.
6. **Ledger.** Create `<tasks>/status.md` with `plan: <date>`.
7. **Stop.** `Next: /build-task <key> — new session · Opus, max`. Never start building.
   Run without a manager? Offer a `spawn_task` chip titled `(Task) <key>`, prompt
   `/task-manager <key>`, as the recommended route.

**Amendments.** `amend: <item>` after the plan is settled: read the current diff in
`.claude/worktrees/<key>`, add `## Addendum <date>` in the same shape, settle its questions as in
step 4, append `plan: amended <date> — <five words>`, report.

**Report to the manager.** Last action: `send_message` the ledger line to the session id the
manager named; fallback `list_sessions`, the session titled `(Task) <key>`. No manager, no message.

## Plan shape

Terse, one screen of scrolling for a medium change. Drop empty sections.

- **Size**: small / medium / large by touch points. No durations.
- **Goal**: one paragraph, the user-visible outcome.
- **Today**: what exists, named precisely (tables, routers, pages), and what's missing.
- **Approach**: numbered in build order (schema & migration → server → client). Data shapes as one
  fenced example. Reuse over invent: name the precedent. No code snippets.
- **Doing differently from the issue**: only where the plan diverges. Each: *Issue says* /
  *Plan does* / *Because* (a concrete reason from the code).
- **Questions for you**: each a short paragraph: what it's about in product terms, the options
  with consequences, a recommendation and why. A question the code can answer isn't one.
- **Blast radius**: shared code touched and what else goes through it, one line each.
- **Out of scope**: one bullet each, with the reason.
- **Work**: collapsed in `<details><summary>Work — N touch points</summary>`: files grouped by
  area, one sentence each, tests included in the touch point they belong to.

`.md` by default; `.html` only for a flow diagram or before/after UI sketch (load `artifact-design`
first). Never both.

## What not to do

| Mistake | Why |
|---|---|
| Asking questions before exploring | Most answers are in the code. |
| Code snippets, step-per-file plans | Unreadable; name the file, describe the change. |
| Starting to code or asking for a "go" | Building is `build-task`, in a fresh session. |
| Reporting to the manager with questions open | Settle them here first. |
| Filing an issue unasked | Ask once, after the plan is settled. |
| Skipping the caller search on shared code | That's where the regressions are. |
