---
name: quiz-diff
description: Quiz the owner on a specific change — a branch, a PR, or recent commits — before it merges, so nothing lands in Hearth that he can't explain. Use when the user types /quiz-diff, or after building a feature when the change is ready for review. Also invoke this automatically at the end of any feature work in this repo.
---

# Quiz on a diff

The standing rule in this repo: **nothing merges that Chris can't explain.**
This skill is the gate. Run it after building anything non-trivial, before the
PR merges — not days later.

## Get the diff

Whatever was named, resolve it to a real diff and read the whole thing:

- No argument → the current branch against `main` (`git diff main...HEAD`).
- A number → that PR (`gh pr diff <n>`).
- A branch name → that branch against `main`.
- "last commit" / a SHA → that commit.

Read the changed files in full, not just the hunks. A question about a diff you
only half-read will be a bad question.

## What to ask

5–6 questions, and they must be about *this change*, not the area in general.
Weight them toward the decisions rather than the syntax — he needs to be able to
defend the change, not recite it.

Cover, where the diff touches them:

- **The decision** — why this approach and not the obvious alternative. There is
  almost always one; name it and make him argue.
- **The invariants** — did this change need `scopeWhere`, an entry in
  `PUBLIC_PROCEDURES` or `WRITE_ROLE_EXEMPT`, a `versionGuard`, a `recordAudit`?
  Ask why it does or doesn't. This is the single most important category.
- **The blast radius** — what else reads this table / calls this procedure /
  renders this component, and what happens to it.
- **The migration**, if there is one — what happens to existing rows, and what
  happens if it runs twice.
- **The test** — what would have to break for this test to fail, and what real
  bug it would not catch.
- **The thing left undone** — every change has one. Make him find it.

Ask one at a time. Grade as in the `quiz` skill: verdict first, then the
specific gap, then the `file:line`.

## The important part

If he can't explain a piece of the change, **that is a signal about the code,
not just about him.** Treat it that way. Ask whether the code should be clearer,
better named, or better commented — and if so, fix it before merging rather than
writing it off as something he needs to learn.

At the end, one of three verdicts, stated plainly:

- **Ready to merge** — he can defend it.
- **Merge after changes** — name the specific clarifications to make first.
- **Not understood yet** — walk the change with him and re-quiz. Don't merge.

Then note the change in `.claude/learning/scorecard.md` under the area it
touched, with anything he stumbled on added to that area's weak points.
