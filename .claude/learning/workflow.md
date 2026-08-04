# How to run a session

`curriculum.md` is the map — what there is to learn. This is the procedure —
what to actually do tonight. Progress lives in `scorecard.md` (gitignored).

---

## The opening line

Paste this into a fresh session and nothing else:

> Read `.claude/learning/workflow.md` and `scorecard.md`, then run today's session.

That's the whole ritual. Don't plan the session yourself — the point is that the
sequence is already decided so you can't spend the evening deciding.

---

## Claude: what to do when you read this

1. Read `scorecard.md`. It has a **Next session** line — that's where we are.
   It's gitignored, so it only exists in the main checkout at
   `C:\dev\hearth\.claude\learning\scorecard.md`. Read it from there even when
   the cwd is a worktree.
2. Find that step in **The sequence** below.
3. Say in one line what the session is and roughly how long. Then start. Don't
   ask permission and don't offer a menu — the sequence already decided.
4. At the end: update `scorecard.md` (the area row, and advance **Next
   session**). Say what moved.

If Chris asks for something else, do that instead — the sequence is a default,
not a cage. Put the session back on track next time rather than silently
skipping ahead.

---

## The four session types

| Type | How long | What happens |
|---|---|---|
| **Tour** | ~45 min | Claude walks a set of files, Chris asks questions, `/quiz <area>` at the end. Reading *with* someone, not alone. |
| **Build** | ~2 h | `/pair` — Chris writes, Claude navigates. Ends with `/quiz-diff` and a PR. |
| **Hunt** | ~30 min | `/bug-hunt <area>` — 2–3 planted bugs, find them, ideally with a failing test. |
| **Review** | ~20 min | `/quiz-diff` on an open PR, then merge or send it back. |

A tour and a hunt fit in one evening. A build usually doesn't share.

---

## The sequence

Deliberately alternating — never more than one reading session before you write
something. The nav restructure comes early precisely because it's client-only
and needs almost none of the server knowledge.

| # | Type | What |
|---|---|---|
| 1 | Tour | **Tier 0a — the domain model.** `db/schema/tenancy.ts` then the other six schema files. The household / user / member distinction is the thing to come away with. Ends `/quiz tenancy`. |
| 2 | Build | **hearth-planning#12 — nav restructure.** Client-only, no schema, no server. First change Chris writes. Worktree already exists. |
| 3 | Review | `/quiz-diff` on the nav PR, then merge. |
| 4 | Tour | **Tier 0b — the request spine.** `trpc/context.ts` → `trpc/trpc.ts` → `trpc/tenant.ts` → `server/index.ts`. The three middlewares and the two allowlists. Ends `/quiz spine`. |
| 5 | Tour | **Tier 1 — one slice.** Trace a "save pot" click from DOM to SQL and back. Ends `/quiz budget` at level 2. |
| 6 | Hunt | `/bug-hunt tenancy` — first hunt, on the invariant that matters most. |
| 7 | Build | **hearth-planning#13 — todos, server half.** Schema, migration, router, tests. Nothing client-side. |
| 8 | Build | **#13 client half** — route, page, components, e2e. Ends `/quiz-diff` + PR. |
| 9 | Tour | **Tier 2 — the money engine.** Read the tests before the code. Ends `/quiz money`. |
| 10 | Build | **hearth-planning#14 — wishlists.** Chris writes all of it, including the shared-helper extraction. |

After 10, re-plan from `curriculum.md`. The savings planner (#15) is gated on
`/quiz money` and `/quiz budget` both passing — don't start it before then.

---

## Rules that don't change

- **Nothing merges that Chris can't explain.** `/quiz-diff` before every merge,
  including on code he wrote.
- **On home-portal features Chris writes the implementation.** Claude navigates.
- **Demo mode only** — `npm run demo`, never `./data/pgdata`.
- **Worktree first.** Branch named `<issue-number>-<slug>`; planning issues need
  closing by hand since cross-repo `Closes` doesn't fire.
- If Chris can't explain part of a diff, that's a signal the **code** is
  unclear. Fix the code before merging rather than filing it as a gap in him.

---

## When there's only 15 minutes

Don't start a sequence step. Do one of these instead:

- `/quiz` with no argument — it picks the stalest area itself.
- Review an open PR.
- Read one file from the current tier and ask questions about it.

A 15-minute session that moves the scorecard beats skipping the evening.
