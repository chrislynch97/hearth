---
name: test-task
description: Use when Chris has a committed Hearth task branch and wants it checked and then tried by hand before shipping — "/test-task 42-slug", "test this", "how do I test this". Run in a fresh session. Runs the automated checks and e2e suite, screenshots changed UI, then steps through a short manual checklist one step at a time.
---

# Test a task

**Model:** Opus, medium effort.

**Session title:** `(Test) <key>`. Set it first: ToolSearch
`select:mcp__ccd_session_mgmt__set_session_title`, call with `session_id: "self"`. Skip silently if
unavailable.

Two halves: **checks** the session runs itself, then a **manual** pass Chris runs with this
session keeping score. Fresh session on purpose: the checklist comes from the diff, not from the
build session's story. `<wt>` is the main checkout's `.claude/worktrees/<key>`, `<tasks>` its
`.claude/tasks/<key>/`. Demo or dev data only, never the real database.

## Checks

1. `cd <wt>`; clean tree (else stop: commit first). `git diff --stat origin/main...HEAD`, then read
   the files that matter.
2. `npm run typecheck`, `npm test`, `npm run lint`, then `npm run test:e2e` (builds the client,
   drives demo mode on :8788 from `<wt>/data/demo`). Nothing else may hold that data dir open.
3. **UI changed?** Screenshot it. The browser pane can't serve worktree code, so use Playwright:
   a throwaway `e2e/_shots.spec.ts` covering the changed screens at desktop and 390px mobile, light
   and dark (`emulateMedia({ colorScheme: 'dark' })`), full-page screenshots. Run it, read the PNGs,
   delete the spec. Report anything visibly wrong as a failed check.
4. All green: append `checks: <date> — pass` to `<tasks>/status.md`. A failure is reported with
   its output, not recorded, and the manual half still follows.

## Manual

A developer's confidence pass, not a QA script: it may use SQL, logs and curl, and spends most of
its steps on what could have **broken**, not on what was built.

**Produce it from the diff:**
- List every reachable surface touched: pages, routers, scheduled jobs, migrations, emails.
- **Blast radius**: for each shared method touched, find its other callers and which feature they
  serve. Those regression checks are the most valuable steps.
- Order by risk: one happy path → one step per changed behaviour → the regression checks → a data
  spot-check where the change makes a claim you can verify (what's stored).
- Each step: *do this → expect this*, product terms. Force state rather than wait for it (edit the
  row, call the procedure). Mark the steps not to skip. About ten steps; more means the change
  wants splitting.
- Step 1 is always running the branch. Demo mode, from `<wt>` in PowerShell:
  `npm run build:client; $env:CLIENT_DIR="<wt>\dist\client"; npm run demo` → `http://localhost:8787`
  (stop any other server on 8787 first). Anything touching households, roles, invites or auth uses
  `npm run dev:server` the same way and logs in as `ava` / `hearth-dev`.

**Run it one step at a time, in chat:**
1. Post the full list once, numbered, action only. Write it to `<tasks>/findings.md` under
   `## Manual test <date>` as `- [ ] N. <action>`.
2. Send step 1 in full: do, expect, what failure looks like. Wait.
3. On each reply, tick the line with ` — pass`, ` — FAIL: <what he saw>` or ` — skipped: <why>`,
   then `1 pass. Step 2:` and the next step in full. Never two steps at once. "2 and 3 pass" is fine.
4. A failure doesn't stop the run; finish the list so the fix gets everything at once.
5. After the last step: the scoreboard, then append
   `manual-test: <date> — <n> pass, <n> fail, <n> skipped` (plus ` FAILED steps <n, n>`) to the
   ledger. Failures → `Next: /fix-task <key> — in the (Build) session · Opus, high`; none →
   `Next: /ship-task <key> — new session · Opus, medium`.

The checklist lives in chat and in `findings.md` only: no other file, no side panel.

**Re-test here after a fix:** checks again, then only the steps that failed or were skipped plus
any the fix could have affected, under `## Manual test <date> (re-test)`. Say which passed steps
were carried over.

**Report to the manager.** Last action: `send_message` the ledger line(s) to the session id the
manager named; fallback `list_sessions`, the session titled `(Task) <key>`. No manager, no message.

## What not to do

| Mistake | Why |
|---|---|
| Writing the checklist from the plan | Tests the story, not the code. |
| Only the happy path | That's the one thing already known to work. |
| A step that needs waiting | It won't get run. Force the state. |
| Steps for what unit tests already prove | The pass is for real wiring, the browser, the data. |
| Pointing anything at the real database | Demo or dev mode only. |
