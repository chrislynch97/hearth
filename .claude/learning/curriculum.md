# Hearth curriculum

The map for turning ~49k lines of mostly-AI-written code into code Chris owns.
Not a reading list to get through — a set of checkpoints, each with a "can you
answer this without looking" test at the end.

Progress lives in `scorecard.md` (gitignored). Quiz with `/quiz <area>`, hunt
with `/bug-hunt <area>`, build with `/pair`, gate merges with `/quiz-diff`.

**This file is the map, not the plan.** For what to actually do in a given
session — the session types, the order, and the one line to open a fresh session
with — see [`workflow.md`](workflow.md).

---

## Tier 0 — The spine

Six files. They govern every request in the app, and almost everything else is a
variation on what they establish. Know these cold before anything else.

| Order | File | What it establishes |
|---|---|---|
| 1 | `src/server/db/schema/tenancy.ts` | household / user / membership / member / session. The distinction between a *login* and a *budgeting participant* is the one people get wrong. |
| 2 | `src/server/db/schema/{budget,income,spending,networth,audit}.ts` | The rest of the domain model. ~500 lines total. |
| 3 | `src/server/trpc/context.ts` | How an HTTP request becomes `{ db, householdId, userId, role }`. |
| 4 | `src/server/trpc/trpc.ts` | The three middlewares every procedure passes through: fail-closed auth, deny-by-default write role, audit flush. |
| 5 | `src/server/trpc/tenant.ts` | `scopeWhere`, the role ladder, `assertRole`. |
| 6 | `src/server/index.ts` | Fastify boot, static serving, and the coarse HTTP gate that mirrors `PUBLIC_PROCEDURES`. |

Then the client half: `src/client/main.tsx` → `trpc.ts` → `providers.tsx` →
`router.tsx`, and `src/client/CLAUDE.md` for the conventions.

**Checkpoint.** Without looking: how does a request from a logged-out browser on
a locked instance get rejected, and in how many places? Why two?

---

## Tier 1 — One slice, end to end

Pots. The cleanest complete example in the repo.

`features/budget/pots.router.ts` → `client/pages/PotsPage.tsx` →
`features/budget/setAside.router.ts` → `features/budget/funding.ts`

**Checkpoint.** Trace one click of "save pot" from the DOM event to the SQL and
back to the re-render, naming every file it passes through. Then explain why
`createWithContributions` exists when `create` already does.

---

## Tier 2 — The money engine

The genuinely hard part, and the part where being a passenger costs real money.
**Read the tests first** — they're the spec, and they're better written than most
of the prose about it.

| File | The idea |
|---|---|
| `shared/money.ts` | Minor units everywhere. `allocate` and the remainder penny. |
| `shared/period.ts` | Monthly / four-weekly / fortnightly / weekly cycles, anchors, boundaries. |
| `shared/recurrence.ts` | Normalising any frequency to a comparable per-period amount. |
| `features/budget/funding.ts` | The core allocation: who funds what, split vs pooled. 504 lines of tests behind it. |
| `features/budget/billReview.ts` | Detecting a bill whose price changed. |
| `features/income/payslip.ts` | Payslip components → net → what's actually available. |
| `features/budget/upcoming.ts` | What's due, when. |

**Checkpoint.** The household is on `pooled` funding with a four-weekly period.
Explain, in order, how a £40 monthly bill becomes a number on the dashboard.

---

## Tier 3 — The operational surface

Less conceptual, more "where is it and what breaks it".

- **Auth** — `server/auth/`: session hashing, MFA/TOTP replay protection, rate
  limiting, the trust-proxy switch, the first-run gate.
- **Data** — `db/{migrate,seed,demo,snapshot,target}.ts`, `drizzle/` (17
  migrations), `features/admin/data.router.ts` for import/export/reset.
- **Backup** — `server/backup/{runner,schedule,encrypt,offsite}.ts`.
- **Mail** — `server/mail/`, off by default, reset needs a *confirmed* address.
- **Ops** — `server/ops/{health,alerts,authAlerts}.ts`.
- **Deploy** — the six `docker-compose*.yml` variants and what distinguishes
  them, `Dockerfile`, `.github/workflows/`.
- **Client shell** — `client/layout/`: `AppLayout`, `nav-config.ts`, the command
  palette. This is what the home-portal pivot will reshape.

**Checkpoint.** The live instance won't start after an update. List the first
five things you'd check, in order.

---

## The invariants

The short list of things that are true everywhere, and whose violation is a real
bug rather than a style problem. If you learn nothing else, learn these.

1. **Every tenant query goes through `scopeWhere`** — including by-id lookups. An
   unscoped `eq(table.id, x)` lets one household read or mutate another's row.
2. **`PUBLIC_PROCEDURES` and `WRITE_ROLE_EXEMPT` are allowlists.** New procedures
   are authenticated and write-gated by default, and fail closed. Adding to
   either list is a security decision.
3. **Writes take `expectedUpdatedAt` + `versionGuard`**, and call
   `throwStaleWrite` when the guard misses. Without it, two tabs silently
   overwrite each other.
4. **Mutations stage `recordAudit(ctx, …)`;** middleware flushes on success only.
   Audit failures never break the mutation.
5. **`superjson` on both ends.** Drop it on one side and every `Date` becomes a
   string while the types keep claiming otherwise.
6. **Import `db/target`, not `db/client`, for values** — value-importing
   `db/client` opens the real database at module load.
7. **Money is minor units.** Convert at the edges, never in the middle.
8. **Demo mode only.** `npm run demo` against `./data/demo`. Never `./data/pgdata`,
   never a `postgres://` URL — that's the household's live financial data.
9. **One process per PGlite directory.** Two writers on `./data/demo` corrupts it.

---

## Tier 4 — Build the pivot

Hearth becomes a home management portal. Each feature is a full vertical slice,
ordered so each one teaches something the last didn't.

| # | Feature | What it's for, pedagogically |
|---|---|---|
| 1 | **To-do lists** | Trivial domain logic, full traversal: schema → migration → router + tests → route → page → e2e. All the load on architecture, none on maths. Chris writes ~70%. |
| 2 | **Wish lists** | Deliberately the same shape — repetition consolidates. Adds money in minor units and `shared/links.ts`. Chris writes it all. |
| 3 | **Savings planner** | The hard one. Must integrate with pots, set-asides, funding and periods, which forces Tier 2 rather than skirting it. Line items with their own due dates (the cake, two weeks before the wedding). |
| 4 | **Home measurements / rooms** | New architectural problem: hierarchical data, and the app's first binary storage for blueprints and photos. Chris owns that decision. |
| 5 | **DIY log** | Depends on rooms. Cross-domain linking (a paint colour, a supplier, a room). Mostly consolidation. |

Every one of them: issue → worktree → branch → PR → `/quiz-diff` → merge.

---

## Standing habits

- **Nothing merges that Chris can't explain.** `/quiz-diff` before every merge,
  including on code he wrote.
- `/quiz` weekly, on whatever the scorecard says has gone stale.
- `/bug-hunt` after finishing each tier.
- **Capstone: Chris writes `docs/architecture.md`.** It doesn't exist, the repo
  needs it, and writing it is the real test of whether the rest of this worked.
