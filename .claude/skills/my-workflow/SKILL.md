---
name: my-workflow
description: Use when Chris wants a recap of the Hearth task loop or where a task is up to — "/my-workflow", "what's my process", "which skill for X", "what do I run next", "/my-workflow 42-slug". Reads the skill files and ledgers live so it never goes stale.
---

# Workflow recap

**Model:** Opus, medium effort.

## `/my-workflow`

Read the `description:`, `**Model:**` and `**Session title:**` lines of every sibling
`../*/SKILL.md` first. Then print, and nothing else:

```
spec-task → (issue) → (Build): plan → you approve → build → you say "commit" → (Check): review, checks, driven test, your steps → findings back to (Build) until clean → (Ship): PR, auto-merge, CI → merged, cleaned up
```

| Skill | Model | Started by | Does | Never |
|---|---|---|---|---|

One row per session skill (`build-task`, `check-task`, `ship-task`), then a second table for
`spec-task`, `sync-task` and `my-workflow`. *Started by* is Chris or the session before it on his
sign-off; *Never* is the top line of that skill's mistakes table. Under the tables:

**What you type, and where:**
- approve the plan → in `(Build)`; it builds straight away
- `commit` (or commit yourself and say `done`) → in `(Build)`; it syncs and starts or re-runs `(Check)`
- your test steps' results → in `(Check)`; all pass starts `(Ship)`
- `add: …` / `amend: …` → in `(Build)`
- `build` → in `(Spec)` once the issue exists

**Standing rules:**
- three sessions per task; Check never wrote the code and never fixes it
- nothing is committed before you've seen the diff
- `ship-task` is the only step that pushes, merges or closes an issue
- every task's state is line 1 of its ledger, and in its sessions' titles

If the ask names a situation ("branch is stale", "CI failed"), answer with the one thing to type
and where, and stop.

## `/my-workflow <key>`

Read the main checkout's `.claude/tasks/<key>/status.md`. Print its state line, the other lines
as-is, then one line naming the session the task is in and what it waits on. No ledger:
`Next: /build-task <key>` (or `/spec-task` if there's no issue).

## `/my-workflow --lint`

For every sibling skill: any `/<name>` it mentions that isn't a sibling or a built-in skill, any
skill missing a `**Model:**` line, and any section reference with no target. One line per problem,
or `clean`. Fix nothing.
