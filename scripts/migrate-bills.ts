// ---------------------------------------------------------------------------
// One-off data migration: legacy expenses (+ expense_share) → single-pot bills
// and set-aside rows. See CLAUDE.md / the "Bills vs Set aside" change.
//
//   tsx scripts/migrate-bills.ts           → DRY RUN. Reads the DB, writes a
//                                            human-readable plan to
//                                            ./data/migration-plan.json, and
//                                            writes NOTHING to the database.
//   tsx scripts/migrate-bills.ts --commit  → Applies ./data/migration-plan.json
//                                            (edit it first to fix any guesses).
//
// Targets whatever DATABASE_URL points at (defaults to the real app.db, exactly
// like the app). It is non-destructive: bills are updated in place, set-asides
// are inserted and their old expense archived, and the legacy `expense_share`
// rows are LEFT UNTOUCHED as a fallback. Re-running skips anything already done.
//
// Take a backup first (Settings → Backups, or copy ./data/app.db).
// ---------------------------------------------------------------------------

import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { eq, isNull } from 'drizzle-orm'
import { db } from '../src/server/db/client.ts'
import { runMigrations } from '../src/server/db/migrate.ts'
import { expense, expenseShare, setAside, member, pot, category } from '../src/server/db/schema.ts'
import { newId } from '../src/shared/ids.ts'

const COMMIT = process.argv.includes('--commit')
const PLAN_PATH = process.env.MIGRATION_PLAN ?? './data/migration-plan.json'
const TARGET = process.env.DATABASE_URL ?? 'file:./data/app.db'

type Recurrence = 'monthly' | 'quarterly' | 'yearly'

interface BillPlan {
  potId: string | null
  potName: string
  categoryId: string | null
  funding: 'pot_manual' | 'pot_auto' | 'main'
  amount: number
}

interface SetAsidePlan {
  ownerId: string
  ownerName: string
  potId: string
  potName: string
  amount: number
  recurrence: Recurrence
  name: string
  groupLabel: string | null
}

interface PlanEntry {
  expenseId: string
  name: string
  recurrence: Recurrence
  /** What the classifier guessed (kept for reference). */
  suggestedType: 'bill' | 'set_aside'
  /** What WILL be applied on --commit. Edit this to override. */
  type: 'bill' | 'set_aside'
  confidence: 'high' | 'low'
  reason: string
  needsReview: boolean
  legacyShares: Array<{ ownerName: string; potName: string; amount: number }>
  bill: BillPlan
  setAsides: SetAsidePlan[]
}

interface Plan {
  generatedFrom: string
  note: string
  entries: PlanEntry[]
}

const money = (n: number): string => `£${(n / 100).toFixed(2)}`

async function dryRun(): Promise<void> {
  const members = await db.select().from(member)
  const pots = await db.select().from(pot)
  const categories = await db.select().from(category)
  const allShares = await db.select().from(expenseShare)
  const memberById = new Map(members.map((m) => [m.id, m]))
  const potById = new Map(pots.map((p) => [p.id, p]))
  const catById = new Map(categories.map((c) => [c.id, c]))
  const sharesByExpense = new Map<string, typeof allShares>()
  for (const s of allShares) {
    const arr = sharesByExpense.get(s.expenseId) ?? []
    arr.push(s)
    sharesByExpense.set(s.expenseId, arr)
  }

  const ownerName = (id: string): string => memberById.get(id)?.displayName ?? '(unknown)'
  const potName = (id: string | null): string => (id ? potById.get(id)?.name ?? '(unknown pot)' : '(no pot)')
  const isSavingsCat = (categoryId: string | null | undefined): boolean => {
    if (!categoryId) return false
    const name = catById.get(categoryId)?.name ?? ''
    return /sav|goal|invest|isa|emergenc|holiday|fund/i.test(name)
  }

  // Only un-migrated, non-archived expenses. A migrated bill has `amount` set;
  // a migrated set-aside had its expense archived.
  const expenses = await db.select().from(expense).where(isNull(expense.archivedAt))
  const pending = expenses.filter((e) => e.amount == null)
  const alreadyDone = expenses.length - pending.length

  const entries: PlanEntry[] = pending.map((e) => {
    const shares = sharesByExpense.get(e.id) ?? []
    const recurrence = e.recurrence as Recurrence
    const allHavePots = shares.length > 0 && shares.every((s) => s.potId != null)
    const selfPot = allHavePots && shares.every((s) => potById.get(s.potId as string)?.ownerId === s.ownerId)
    const distinctOwners = new Set(shares.map((s) => s.ownerId)).size
    const multiPersonSelfPot = selfPot && distinctOwners >= 2
    const allSavings = allHavePots && shares.every((s) => isSavingsCat(potById.get(s.potId as string)?.categoryId))

    let suggestedType: 'bill' | 'set_aside'
    let confidence: 'high' | 'low'
    let reason: string
    if (multiPersonSelfPot) {
      suggestedType = 'set_aside'
      confidence = 'high'
      reason = 'Each person pays into their own pot — classic set-aside (e.g. "Treat Yo Self").'
    } else if (allSavings) {
      suggestedType = 'set_aside'
      confidence = 'low'
      reason = 'Funds a savings/goal pot — probably money set aside, but confirm it is not a bill you pay out.'
    } else {
      suggestedType = 'bill'
      confidence = 'high'
      reason = 'Drains a pot / paid out — treated as a bill.'
    }

    // Bill shape: collapse to the single pot carrying the largest summed amount.
    const potAmounts = new Map<string, number>()
    for (const s of shares) if (s.potId) potAmounts.set(s.potId, (potAmounts.get(s.potId) ?? 0) + s.amount)
    const distinctPots = [...potAmounts.keys()]
    const chosenPot = [...potAmounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    const totalAmount = shares.reduce((sum, s) => sum + s.amount, 0)
    const needsReview = confidence === 'low' || (suggestedType === 'bill' && distinctPots.length !== 1)

    const bill: BillPlan = {
      potId: chosenPot,
      potName: potName(chosenPot),
      categoryId: null, // pot-funded bills derive category from the pot; only 'main' needs one (set in-app later)
      funding: chosenPot ? 'pot_manual' : 'main',
      amount: totalAmount,
    }
    const setAsides: SetAsidePlan[] = shares
      .filter((s) => s.potId)
      .map((s) => ({
        ownerId: s.ownerId,
        ownerName: ownerName(s.ownerId),
        potId: s.potId as string,
        potName: potName(s.potId),
        amount: s.amount,
        recurrence,
        name: distinctOwners >= 2 ? `${e.name} — ${ownerName(s.ownerId)}` : e.name,
        groupLabel: distinctOwners >= 2 ? e.name : null,
      }))

    return {
      expenseId: e.id,
      name: e.name,
      recurrence,
      suggestedType,
      type: suggestedType,
      confidence,
      reason,
      needsReview,
      legacyShares: shares.map((s) => ({ ownerName: ownerName(s.ownerId), potName: potName(s.potId), amount: s.amount })),
      bill,
      setAsides,
    }
  })

  const plan: Plan = {
    generatedFrom: TARGET,
    note: 'DRY RUN. Edit the `type` of any entry to override the guess, then run: tsx scripts/migrate-bills.ts --commit. Entries with needsReview=true deserve a look.',
    entries,
  }
  writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2))

  console.log(`\n[migrate-bills] DRY RUN against ${TARGET}`)
  console.log(`[migrate-bills] ${pending.length} expense(s) to migrate, ${alreadyDone} already migrated.\n`)
  for (const e of entries) {
    console.log(`• ${e.name}  →  ${e.type.toUpperCase()}${e.needsReview ? '   ⚠ REVIEW' : ''}`)
    console.log(`    ${e.reason}`)
    if (e.type === 'bill') {
      console.log(`    bill: ${money(e.bill.amount)} / ${e.recurrence} · pot: ${e.bill.potName} · funding: ${e.bill.funding}`)
    } else {
      for (const sa of e.setAsides) console.log(`    set aside: ${sa.ownerName} → ${sa.potName}  ${money(sa.amount)} / ${sa.recurrence}`)
    }
  }
  const reviewCount = entries.filter((e) => e.needsReview).length
  console.log(`\n[migrate-bills] Wrote plan → ${PLAN_PATH}`)
  console.log(`[migrate-bills] ${reviewCount} entr${reviewCount === 1 ? 'y' : 'ies'} flagged for review. Nothing written to the database.`)
  console.log(`[migrate-bills] When happy: tsx scripts/migrate-bills.ts --commit\n`)
}

async function commit(): Promise<void> {
  if (!existsSync(PLAN_PATH)) {
    console.error(`[migrate-bills] No plan found at ${PLAN_PATH}. Run the dry run first (without --commit).`)
    process.exit(1)
  }
  const plan = JSON.parse(readFileSync(PLAN_PATH, 'utf8')) as Plan
  const now = Date.now()

  const current = await db.select().from(expense)
  const currentById = new Map(current.map((e) => [e.id, e]))

  let bills = 0
  let setAsideGroups = 0
  let skipped = 0

  for (const entry of plan.entries) {
    const live = currentById.get(entry.expenseId)
    // Skip missing, or already migrated (bill has amount; set-aside was archived).
    if (!live || live.amount != null || live.archivedAt != null) {
      skipped++
      continue
    }

    if (entry.type === 'bill') {
      const b = entry.bill
      if (b.funding !== 'main' && !b.potId) {
        throw new Error(`Bill "${entry.name}" has no pot. Set funding to "main" (with a category) or choose a pot in the plan.`)
      }
      await db
        .update(expense)
        .set({
          amount: b.amount,
          funding: b.funding,
          potId: b.funding === 'main' ? null : b.potId,
          categoryId: b.categoryId,
          updatedAt: now,
        })
        .where(eq(expense.id, entry.expenseId))
      bills++
    } else {
      for (const sa of entry.setAsides) {
        await db.insert(setAside).values({
          id: newId(),
          name: sa.name,
          groupLabel: sa.groupLabel,
          ownerId: sa.ownerId,
          potId: sa.potId,
          amount: sa.amount,
          recurrence: sa.recurrence,
          note: null,
          active: 1,
          sortOrder: 0,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        })
      }
      await db.update(expense).set({ archivedAt: now, updatedAt: now }).where(eq(expense.id, entry.expenseId))
      setAsideGroups++
    }
  }

  console.log(`\n[migrate-bills] COMMIT against ${TARGET}`)
  console.log(`[migrate-bills] ${bills} bill(s) updated, ${setAsideGroups} set-aside group(s) created, ${skipped} skipped (already migrated).`)
  console.log(`[migrate-bills] Legacy expense_share rows left in place as a fallback.\n`)
}

async function main(): Promise<void> {
  await runMigrations()
  if (COMMIT) await commit()
  else await dryRun()
  db.$client.close()
}

main().catch((err) => {
  console.error('[migrate-bills] failed:', err)
  process.exit(1)
})
