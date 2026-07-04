# Monzo CSV import — design

Status: **in progress** (Phase 8). This document is the plan of record; it may
run slightly ahead of the code as the feature is built.

## Goal

Let a household import a Monzo account's transaction history from the CSV Monzo
exports ("Statements → Download as CSV"), turning each row into a
`SpendTransaction`, with a **review-before-commit** step so nothing lands
unseen. One export = one person's account, so the whole batch is attributed to
one chosen owner.

This replaces manual entry for the bulk of spending; the pot-suggestion engine
pre-assigns pots so reconciliation is mostly one-click.

## Monzo's CSV shape

Monzo's export has a header row. The columns we care about (names as Monzo
writes them):

| Monzo column | Use |
|---|---|
| `Transaction ID` | `import_ref` — the natural dedup key (globally unique, stable) |
| `Date` (`DD/MM/YYYY`) | calendar date → `YYYY-MM-DD` |
| `Time` | ignored (we store a *day*, not a moment) |
| `Type` | detect internal transfers / pot top-ups |
| `Name` | primary description |
| `Description` | fallback description if `Name` is blank |
| `Amount` | signed decimal in the account currency |
| `Currency` | account currency (usually `GBP`) |
| `Local amount` / `Local currency` | foreign-spend detection |
| `Category` | Monzo's own category — kept in `raw`, not mapped in v1 |
| `Notes and #tags` | appended to our `note` (optional) |

The full original row is preserved as JSON in `SpendTransaction.raw` for audit
and future re-processing. We never rely on column *order* — everything is keyed
by header name, so extra/re-ordered columns are tolerated.

## Sign normalisation

Hearth stores `SpendTransaction.amount` as **positive = spend, negative =
refund** (minor units). Monzo stores **negative = money out, positive = money
in**. So:

```
hearth.amount = -round(monzo.Amount * 10^decimalPlaces)
```

A Monzo purchase of `-12.50` becomes `+1250`; a `+4.00` refund becomes `-400`.

## Row classification (the preview)

Every parsed row is classified so the user sees exactly what will happen:

- **new** — a normal transaction not already imported → will be inserted.
- **duplicate** — its `Transaction ID` already exists in `spend_transaction`
  (from a prior import). Skipped. Re-importing the same export is therefore safe
  and idempotent.
- **excluded** — internal moves that aren't real spending: pot transfers and
  transfers between your own accounts (`Type` = `Pot transfer`, or a transfer
  category). Shown, unticked by default; the user can include them.
- **foreign** — `Currency` ≠ the household currency (or a differing
  `Local currency`). Still importable, but flagged so the user can sanity-check
  the converted figure.
- **error** — malformed rows (missing `Transaction ID`, unparseable `Amount` or
  `Date`). Surfaced with the reason, **never silently dropped**; not importable
  until fixed upstream.

## Pipeline

```
upload CSV ─▶ parse (client) ─▶ imports.preview ─▶ review & edit ─▶ imports.commit
             │                   │                  │                │
             │                   ├ classify rows    ├ pick owner     ├ create ImportBatch
             │                   ├ dedup vs existing ├ adjust pots    ├ insert rows (source=import,
             │                   └ suggest pots      └ tick/untick    │   import_ref, raw)
             │                                          rows          └ return counts
             └ header auto-detected; mapping overridable
```

1. **Upload & parse** — the browser reads the file and parses the CSV
   (`src/shared/csvParse.ts`). No large-file upload endpoint needed for a
   personal-scale statement.
2. **Preview** (`imports.preview`) — send parsed rows + chosen owner; the server
   classifies, dedupes against existing `import_ref`s, and runs the existing
   `suggestPot` engine per row. Returns the categorised, pot-suggested preview.
3. **Review** — the user picks the owner, tweaks per-row pots, and ticks/unticks
   rows (excluded/foreign default handling as above).
4. **Commit** (`imports.commit`) — creates an `ImportBatch` and inserts the
   selected rows atomically (`db.batch`), each `source='import'` with its
   `import_ref`, `import_batch_id`, and `raw`. Returns
   `{ imported, skipped }`.

## Architecture choice

The spec floats "one plain REST endpoint for CSV import", but the whole app is
tRPC and the statements are small (hundreds–thousands of rows). Parsing in the
browser and using two tRPC procedures (`preview`, `commit`) keeps types
end-to-end, avoids multipart plumbing, and makes the review step natural. The
`raw` JSON we store means we can always re-derive fields later if the mapping
improves.

## Schema additions (migration 0008)

- `spend_transaction`: `import_ref TEXT` (unique index — NULLs allowed for
  manual rows), `import_batch_id TEXT` (→ `import_batch.id`), `raw TEXT` (JSON).
- new `import_batch`: `id`, `source` (`monzo_csv`), `filename`, `imported_at`,
  `row_count`, `imported_count`, `skipped_count`, `mapping` (JSON), timestamps.

Registered in `db/tables.ts` so exports/backups/restore include them.

## Dedup & splits interaction

`import_ref` is unique, so re-importing is safe. When an imported spend is later
**split**, the original row keeps its `import_ref` (the split logic only
rewrites amount/owner/pot), and the new child rows get `import_ref = NULL` —
matching the spec's "only one keeps import_ref".

## Out of scope (v1 of the importer)

- Automatic Monzo category → Hearth category mapping (kept in `raw` for later).
- Live bank feeds / the Monzo API. CSV only.
- Multi-account merge in one file — one export is one account/owner.
