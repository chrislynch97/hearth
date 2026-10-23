---
name: check-task
description: Use when a Hearth task branch is built, committed and synced and needs judging by a session that didn't write it — "/check-task 42-slug", or the message the Build session sends on Chris's "commit". Cold review, the automated checks and e2e, the session driving most test steps itself in a real browser, then a short list only Chris can judge. Re-checks after fixes in the same session. Report only; never fixes.
---

# Check a task

**Model:** Opus, high effort.

**Session title:** `(Check) <key> — <state>`, per *State and title* below.

## Overview

The task's independent judge. It never saw the build and never writes code: every finding goes back
to `(Build)`, and this session re-checks what comes back. One run does the whole check so Build
gets every finding in one wave: **review**, **checks**, **driven test**, then **Chris's steps**. A
🔴 blocking review finding or any failed driven step skips Chris's steps until the re-check; no
point him testing code about to change.

Conventions are in the repo `CLAUDE.md` → *Task loop*. `<main>` is the main checkout, `<tasks>` its
`.claude/tasks/<key>/`, `<wt>` its `.claude/worktrees/<key>`. Dev or demo data only, never the
real database.

Other tasks' Checks may be running, so never use a fixed port. Each time a server is needed, ask
the OS for a free one: `node -e "const s=require('net').createServer().listen(0,()=>{console.log(s.address().port);s.close()})"`.

## Phase 1 — Review

1. **Branch.** In `<wt>`: `git branch --show-current` is `<key>`, `git status --porcelain` is
   empty (dirty: stop and say Build must commit). `git fetch origin main`. Note the head SHA.
2. **Review.** Invoke the `code-review` skill with args `high <key>`, so it reviews the committed
   `origin/main...HEAD` diff. Never accept a summary from Build; the issue and the diff are the
   only statement of intent.
3. **Then the plan.** Read `<tasks>/plan.md` only after the review, to check its *Different from
   the issue* items were deliberate. A finding the plan explicitly chose is dropped.
4. **Attribute.** Drop anything already on `origin/main`. Never cite personal Claude config as
   the authority; point at an in-repo example.
5. **Record.** Report in chat, 🔴 Blocking then 🟠 Fix, numbered, bold title plus `file:line`, the
   fix as an instruction. Append the same to `<tasks>/findings.md` under `## Review <date>` as
   `- [ ] N. **title** `file:line` — …`. Append `review: <date> — <n> findings` (or `— clean`).

## Phase 2 — Checks

In `<wt>`: `npm run typecheck`, `npm test`, `npm run lint`, `E2E_PORT=<free port> npm run test:e2e`
(builds the client, drives demo mode from `<wt>/data/demo`). Nothing else may hold that data dir open. All
green: append `checks: <date> — pass`. A failure goes into findings under `## Checks <date>` with
its output, and the driven steps still follow.

## Writing the test list

From the diff, never from the plan. A developer's confidence pass, not a QA script: it spends most
of its steps on what could have **broken**, not on what was built.

1. **Read the change.** `git diff --stat origin/main...HEAD`, then the files that matter. Note
   every reachable surface touched: pages, routers, scheduled jobs, migrations, emails.
2. **Blast radius.** For each shared method touched, find its other callers and the feature they
   serve. Those regression checks are the most valuable steps.
3. **Order by risk:** one happy path → one step per changed behaviour → the regression checks → a
   data spot-check where the change makes a claim you can verify.
4. **Force state, don't wait for it.** Seed a row, call the procedure, set the date.
5. **Tag each step `driven` or `yours`.** Driven is the default: anything visible in the browser,
   callable with curl or readable in the server log. Yours is only what needs a person: whether a
   layout or wording reads right, a real phone, an email in a real inbox, a judgement on the
   experience. Three yours-steps or fewer. Mark the ones not to skip.
6. About ten steps. Write them to `<tasks>/findings.md` under `## Test <date>` as
   `- [ ] N. (driven|yours) <action>`, post the titles and tags in chat, append `test-plan: <date>`.

## Phase 3 — Drive the test steps

1. **Serve the branch.** In `<wt>`: `npm run build:client`, pick a free `<port>`, then start the
   server in the background. Anything touching households, roles, invites or auth uses dev mode:
   `PORT=<port> CLIENT_DIR=<wt>/dist/client npm run dev:server` (seeds `<wt>/data/dev` on first
   run). Otherwise demo: the same with `npm run demo`. One process per data dir. Port taken at
   start: pick another and retry.
2. **Drive with the Playwright MCP tools** (ToolSearch `+playwright browser`) against
   `http://127.0.0.1:<port>`. Not the browser pane: it can't serve worktree code. Dev mode: sign in
   as `ava` / `hearth-dev`. Role steps use the seeded accounts, same password: `ben` (member),
   `nan` (viewer), `priya` and `mikko` (owners of other households); `ava` is admin in Harbour and
   member in Ivy. Phone width is `browser_resize` to 390×844; dark mode via `browser_evaluate` is
   not reliable, so screenshot dark with a throwaway Playwright `.mjs` and `emulateMedia`.
3. **Run each driven step** in order without stopping to report. Record ` — pass` or
   ` — FAIL: <what happened>` plus a few words of evidence. Screenshot only failures. A step that
   turns out to need a person moves to yours, with the reason.
4. **Report once:** `Driven: 7 pass, 1 fail` and a line per failure. Append
   `auto-test: <date> — <scoreboard>` (with ` FAILED steps <n, n>`). Stop the server.

## Phase 4 — Chris's steps

Leave the server running for these. Post every yours-step at once, numbered, in this shape:

```
1.
- Do: open Plan, pick "Groceries", drag the pot to £120
- Expect: the bar fills to 80% and the header total drops by £20
- Fail looks like: bar stays put, or the total doesn't change
```

Product terms only; *Fail looks like* only when it isn't the plain opposite of *Expect*. Say the
URL and which account to sign in as. Then wait. On his reply ("all pass", "2 fails: …"), record each
line, append `manual-test: <date> — <scoreboard>` (with ` FAILED steps <n, n>`), stop the server,
and go to *Hand-off*. A run with no yours-steps still ends with his one-word go, since that typed
turn is what may start Ship.

## Hand-off

- **Any finding or failure**: `send_message` the `(Build)` session
  `Findings ready for <key>: <n> review, <n> checks, <n> test. Fix from the findings file.` State:
  `waiting — fixes in Build`. Messaging needs no typed turn.
- **All clear** (no open findings, every step passed, his reply is in): start Ship per *Starting
  the next session* in `build-task`: title `(Ship) <key>`, Opus, medium, command
  `/ship-task <key>`. A `(Ship)` session that already exists (a CI fix re-checked) gets
  `push <key>` instead. State: `running — ship`.

## Re-check

`/check-task <key> recheck` from Build:

1. **Review narrowly:** `git diff <last reviewed SHA>..HEAD` only, against the findings it answers.
   A fix that reaches beyond its finding's lines or adds a mechanism gets a full read of what it
   touched. Build ticks; you add ` — confirmed <date>` or reopen as a new finding.
2. **Checks** again in full.
3. **Re-drive** the failed and skipped steps plus any the fixes touched; say which passes were
   carried over. Chris's steps again only where a fix touched what they cover.
4. Append `review: <date> — re-check, <verdict>` and the new test lines, then hand off as above.

## State and title

At every transition, rewrite line 1 of `<tasks>/status.md` to `state: <state>`, then set this
session's title to `(Check) <key> — <state, shortened>` with `set_session_title`
(`session_id: "self"`). States: `needs you — <ask>`, `running — <what>`, `waiting — <on what>`,
`done`.

## Run log

Before each hand-off, append one JSON line to `<main>/.claude/tasks/workflow-log.jsonl` (shape in
`build-task` → *Run log*, `step: "check" | "recheck"`).

## What not to do

| Mistake | Why |
|---|---|
| Fixing anything | You didn't write it and mustn't start. Findings go to Build. |
| Taking Build's word for what changed | The diff and the issue are the only inputs. |
| A test list written from the plan | Tests the story, not the code. |
| Asking Chris to run a step you could drive | Screens, endpoints and logs are yours. His are judgement and real devices. |
| A step that needs waiting | It won't get run. Force the state. |
| Verifying worktree UI in the browser pane | It serves main's code. Playwright from the worktree. |
| Opening a data dir the server holds | Two processes on one PGlite dir corrupt it. |
| Pointing anything at the real database | Dev or demo mode only. |
