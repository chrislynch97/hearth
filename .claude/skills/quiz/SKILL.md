---
name: quiz
description: Quiz the owner on how the Hearth codebase actually works, to build real ownership of AI-written code. Use when the user types /quiz, asks to be quizzed or tested on the repo, or asks to check their understanding of an area. Reads the real code first, asks escalating questions one at a time, grades honestly, and records results to the scorecard.
---

# Quiz

Chris is the owner of this codebase but most of it was written by Claude. The
point of this skill is to convert that into genuine ownership — the kind where
he could fix it at 2am without help. Passing a quiz must mean something, so
**grade honestly and do not be generous.**

## Before asking anything

1. Read `.claude/learning/scorecard.md` — what's been covered, what he got wrong
   last time, what's due for revisit.
2. Read `.claude/learning/curriculum.md` for the area's file list.
3. **Read the actual source files for the area.** Never generate questions from
   memory or from the curriculum text — the repo changes and stale questions
   teach stale facts. Every question must have an answer you have just verified
   in the code.

If `/quiz` was called with no area, pick one: anything never covered, then
anything with a weak score, then anything past its revisit date. Say which you
picked and why, in one line.

## Areas

| Area | Where it lives |
|---|---|
| `spine` | `src/server/index.ts`, `src/server/trpc/{trpc,context,tenant}.ts` |
| `tenancy` | `db/schema/tenancy.ts`, `trpc/tenant.ts`, `features/household/` |
| `auth` | `src/server/auth/`, `features/access/` |
| `money` | `src/shared/{money,period,recurrence,dates}.ts` |
| `budget` | `features/budget/`, `client/pages/{Pots,Outgoings,Funding,BillReview}Page.tsx` |
| `income` | `features/income/`, `client/pages/{Payslips,Income,Raises}Page.tsx` |
| `spending` | `features/spending/`, `client/features/spending/` |
| `insights` | `features/insights/`, `features/networth/`, `client/features/reports/` |
| `client` | `client/{main,router,trpc,providers}.tsx`, `client/routes/`, `client/CLAUDE.md` |
| `data` | `db/{migrate,seed,demo,snapshot}.ts`, `drizzle/`, `server/backup/` |
| `ops` | `Dockerfile`, `docker-compose*.yml`, `.github/workflows/`, `e2e/`, `scripts/` |

## The difficulty ladder

Ask 6–8 questions, climbing. The top two levels are where ownership actually
lives — weight there once the basics hold.

| L | Kind | Shape |
|---|---|---|
| 1 | Recall | "Where does X live? What does Y do?" |
| 2 | Trace | "Walk the path from this click to the SQL and back." |
| 3 | Apply | "You need to add Z. What changes, in what order?" |
| 4 | Diagnose | "Here's a symptom / a snippet. What's wrong and why?" |
| 5 | Judge | "Why is it built this way? What breaks if you change it?" |

Start one level below where the scorecard says he is. If he aces two in a row,
skip a level. If he misses two in a row, drop one and say so plainly.

L4 questions are the highest-signal ones you can write. Prefer showing a real
(or realistically wrong) snippet over describing a symptom in prose.

## Running it

- **One question at a time.** Wait for the answer. Never batch.
- Never hint in the question, never include the answer's keywords in it.
- No multiple choice below L4 — recognition is not recall.
- "I don't know" is a valid answer: mark it wrong, give the answer, move on. Do
  not soften it.

## Grading

After each answer, in this order, terse:

1. **Verdict** — right / partial / wrong. Say it first, plainly.
2. **What was missing**, if anything — the specific fact, not a lecture.
3. **The file:line** that settles it, as a clickable link.

Partial credit is real but it is not a pass. If he named the mechanism but
missed the invariant it protects, that's partial — say which half he has.

At the end: a one-line score, the two weakest points, and one concrete thing to
read next. No praise padding.

## After the quiz

Update `.claude/learning/scorecard.md`:

- Set the area's last-quizzed date, level reached, and score.
- Replace the weak-points cell with what he actually missed this time.
- Set a revisit date: 7 days if he scored under half, 21 days if he scored
  around half, 60 days if he aced it.

If a question exposed something genuinely wrong or confusing in the code rather
than in his understanding, say so, and offer to file an issue. A quiz that finds
a real bug is a good quiz.
