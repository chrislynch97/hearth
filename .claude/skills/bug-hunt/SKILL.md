---
name: bug-hunt
description: Plant realistic bugs in a scratch branch of Hearth for the owner to find, as a way of testing his real mental model of the code. Use when the user types /bug-hunt, asks to be tested on debugging, or asks to practise finding bugs in an area of the repo.
---

# Bug hunt

The highest-signal exercise in the set: you can bluff a quiz answer, you cannot
bluff finding a bug you don't understand. Chris hunts, you plant.

## Safety — non-negotiable

- Work on a scratch branch only: `bughunt/<area>-<date>`. **Never** plant on
  `main` or on a branch with real work.
- Verification runs in **demo mode** (`npm run demo`) against `./data/demo`.
  Never point anything at `./data/pgdata` or a `postgres://` URL.
- Record every planted bug in `.claude/learning/bug-hunt-active.md` — file, line,
  what you changed, why it's wrong, the symptom it produces.
- **The branch gets deleted at the end of the session, found or not.** Never
  leave planted bugs alive. If the session ends early, say clearly that the
  branch is still out there and offer to delete it.

## Planting

Plant 2–3 bugs in the named area. Tell him the area and the count — an unbounded
hunt is just frustrating — but nothing else.

Rules for a good plant:

- **Realistic.** It must look like something that would survive review, not a
  typo. The best plants are the ones you could plausibly have written yourself.
- **Findable by reasoning**, from a symptom or from reading the code. Not by
  `git diff` — tell him diffing against `main` is off limits.
- **Consequential.** It must actually break something a user would notice or care
  about. A bug with no symptom teaches nothing.
- **Varied.** Don't plant three of the same class.
- Mix the visibility: one that a test would catch, one that only shows in the UI,
  one that's silent until a specific condition (a second household, a viewer
  role, a month boundary).

## The bug classes worth planting

These are the mistakes this codebase is actually exposed to. They double as a
review checklist.

**Tenancy and authorisation**
- A by-id query with `eq(table.id, x)` and no `scopeWhere` — cross-household read.
- `scopeWhere` present but passed the wrong table's `householdId` column.
- A new procedure added to `PUBLIC_PROCEDURES` that shouldn't be.
- A mutation added to `WRITE_ROLE_EXEMPT`, so a viewer can write.
- `assertRole` / `assertInstanceOwner` dropped from a privileged resolver.

**Data integrity**
- Missing `versionGuard` / `expectedUpdatedAt` — lost update on concurrent edit.
- `recordAudit` omitted, or staged for a write that then throws.
- A write outside the transaction that's supposed to make it atomic.
- A migration that isn't idempotent, or backfills the wrong default.

**Money and dates**
- Major units where minor units are required — float drift in a total.
- `allocate` replaced with naive division, losing the remainder penny.
- Period end treated as inclusive where the code expects exclusive (or vice versa).
- A date built in local time where the row stores UTC — off-by-one at month ends.
- Recurrence normalisation silently dropping a frequency case.

**Wiring**
- A value import of `db/client` instead of `db/target`.
- A missing `await`, so an error surfaces as an unhandled rejection much later.
- React Query cache not invalidated after a mutation — correct DB, stale UI.
- An optimistic update with no rollback on error.
- A `superjson` type assumption broken, so a `Date` arrives as a string.

## Running the hunt

Give him the symptom, not the cause — a user-facing description of what's wrong,
the way a bug report would arrive. Then get out of the way.

Ask him to **write a failing test first** for each bug he finds. Finding it is
half; proving it is the half that makes the fix safe.

When he's stuck, escalate slowly — same ladder as `/pair`: reflect the question
back, then name the layer, then the file, then the pattern, then the line. Never
jump to the answer.

## Debrief

For each bug: found or not, how long, and how he found it — reading, testing, or
guessing. How he found it matters more than whether he did.

For any he missed, walk it and ask the real question: **what would have caught
this?** A test, a type, a lint rule, a comment, a different API shape. If the
answer is a change worth making to the repo, offer to file an issue — hardening
the code against the class of bug is worth more than winning the round.

Then delete the branch and the active-bugs file, and log the result in
`.claude/learning/scorecard.md`.
