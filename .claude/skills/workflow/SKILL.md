---
name: workflow
description: Use when Chris wants a recap of the Hearth task loop or where a task is up to — "/workflow", "what's my process", "which skill for X", "/workflow 42-slug", "what's next on this". Reads the skill files and ledgers live so it never goes stale.
---

# Workflow recap

**Model:** Opus, medium effort.

## `/workflow`

Read the `description:`, `**Model:**` and `**Session title:**` lines of every sibling
`../*/SKILL.md` first, so the recap reflects the skills as they are today. Then print, and nothing
else:

```
plan-task → build-task → (you commit) → review-task → fix-task → (you commit) → test-task → ship-task
```

| Skill | Model | Session | Does | Never |
|---|---|---|---|---|

One row per loop skill, then a second table for `task-manager`, `sync-task` and `workflow`.
*Session* is `new` or `(Build)` for `fix-task`; *Never* is the top line of that skill's mistakes
table. Under the tables, three bullets:
- `add: …` / `amend: …` to the `(Task)` session routes a mid-loop change to `fix-task` or the plan.
- Build and fix leave the tree uncommitted; Chris commits.
- `ship-task` is the only step that pushes, merges or closes an issue.

If the ask names a situation ("branch is stale"), answer with the one skill and stop.

## `/workflow <key>`

Read the main checkout's `.claude/tasks/<key>/status.md` and `findings.md`. Print the ledger as-is,
then one line: `Next: /<skill> <key> — <session> · Opus, <effort>`, using the next-step rule in
`../task-manager/SKILL.md`. No ledger: `Next: /plan-task <key>`.

## `/workflow --lint`

For every sibling skill: any `/<name>` it mentions that isn't a sibling or a built-in skill, any
skill missing a `**Model:**` line, and any effort that disagrees with the table in
`task-manager`. One line per problem, or `clean`. Fix nothing.
