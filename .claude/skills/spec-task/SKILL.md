---
name: spec-task
description: Use when Chris describes a Hearth feature or improvement with no issue yet and wants it thought through before any code — "spec this out", "have a think about", "what would a clean setup be", or a feature idea ending in "then file it". Writes a short spec, iterates, files a hearth-planning issue on his word, and starts Build on "build". Not for an existing issue (that is build-task).
---

# Spec a task

**Model:** Opus, xhigh effort.

**Session title:** `(Spec) <slug>`. Set it first: ToolSearch
`select:mcp__ccd_session_mgmt__set_session_title`, call with `session_id: "self"`. Skip silently if
unavailable.

Chris describes what he wants; this session explores the code, writes a short spec he reads in the
side panel, iterates until he's happy, then (only when he says so) files the issue. The spec is the
durable artifact; the issue is a summary of it. Conventions are in the repo `CLAUDE.md` →
*Task loop*. `<tasks>` is the main checkout's `.claude/tasks/<key>/`.

## Flow

1. **Explore first, silently.** Parallel Explore agents over everything it touches, the nearest
   existing precedent, and the callers of any shared code it would go through. Read the relevant
   memories (tenancy model, db/client gotcha, static assets). Say nothing until the spec exists.
2. **Write `<tasks>/spec.md`** (key `<slug>`, shape below) and send it with `SendUserFile`
   (`display: render`). Reply in two or three lines: the core idea, the decisions worth his eye.
3. **Iterate.** Every change rewrites the file and re-sends it; never paste sections into chat.
4. **Issue on his word only.** "file it" / "make the issue": `gh issue create --repo
   chrislynch97/hearth-planning` with a short problem-framed body written from scratch (not the
   spec). Rename the key to `<n>-<slug>`: move `<tasks>`, retitle this session `(Spec) <n>-<slug>`.
5. **Hand-off.** Close with `Next: /build-task <key> — new session · Opus, max`, then stop. If he
   then says `build` here, that typed turn starts it per *Starting the next session* in
   `build-task` (title `(Build) <key>`, Opus, max, command `/build-task <key>`). Build makes the
   task's sidebar group itself. Never plan or build here.

## Spec shape

Terse; one screen of scrolling for a medium feature. Drop empty sections.

- **Today** — what exists, named precisely (tables, routers, pages), and what's missing.
- **Proposal** — numbered in build order: data, server, client, migration. Data shapes as one
  fenced example. Reuse over invent: name the precedent. No code snippets.
- **Out of scope** — one bullet each, with the reason.
- **Risk** — what could regress and how it would show.
- **Open decisions** — each with a recommendation.

`.md` by default; `.html` only for a flow diagram or before/after UI sketch (load
`artifact-design` first). Never both.

## Run log

Before the closing `Next:` line, append one JSON line to the main checkout's
`.claude/tasks/workflow-log.jsonl` (shape in `build-task` → *Run log*, `step: "spec"`).

## What not to do

| Mistake | Why |
|---|---|
| Asking questions before exploring | Most answers are in the code. Ask inside *Open decisions*. |
| Implementation plan, task breakdown, durations | That's Build's plan. Sizing by touch points only. |
| Filing the issue when the spec is approved | Approval isn't the ask. Wait for "file it". |
| Filing in the public `hearth` repo | Chris's own work goes in `hearth-planning`. |
| Fixing a flagged pre-existing bug silently | Flag it in the spec as in or out of scope. |
