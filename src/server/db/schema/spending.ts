import { pgTable, text, integer, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { household, member } from './tenancy'
import { category, expense, pot } from './budget'

export const reconciliationBatch = pgTable('reconciliation_batch', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  potId: text('pot_id').references(() => pot.id), // null = mixed/multi-pot
  ownerId: text('owner_id').references(() => member.id), // the payer this batch settled; null = whole-pot / legacy
  // What the reconciled spends *required* moving (the sum of their amounts).
  totalAmount: integer('total_amount').notNull(),
  // What actually left the account. Null = "moved in full" — the legacy default
  // and today's one-click behaviour. When it differs from totalAmount the gap is
  // a pot-level residual (totalAmount − movedAmount): positive = short, negative
  // = a credit that reduces what's needed next time. See issue #72. A write-off
  // batch (transactionCount 0) carries the residual being cleared here, so its
  // 0 − movedAmount contribution cancels the outstanding residual.
  movedAmount: integer('moved_amount'),
  transactionCount: integer('transaction_count').notNull(),
  reversedAt: timestamp('reversed_at', { withTimezone: true, mode: 'date' }),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  householdIdx: index('reconciliation_batch_household_id_idx').on(t.householdId),
}))

// Import batches — one Monzo CSV upload (spec §5.3). Preserved for audit and
// so a whole import can be identified (and, in future, reversed).
export const importBatch = pgTable('import_batch', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  source: text('source').notNull(),        // 'monzo_csv'
  filename: text('filename'),
  rowCount: integer('row_count').notNull(),        // rows in the file
  importedCount: integer('imported_count').notNull(),
  skippedCount: integer('skipped_count').notNull(),
  mapping: text('mapping'),                 // JSON: column mapping used
  importedAt: timestamp('imported_at', { withTimezone: true, mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  householdIdx: index('import_batch_household_id_idx').on(t.householdId),
}))

export const spendTransaction = pgTable('spend_transaction', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => household.id, { onDelete: 'cascade' }),
  date: text('date').notNull(), // YYYY-MM-DD
  description: text('description').notNull(),
  amount: integer('amount').notNull(), // minor units; + = spend, - = refund
  ownerId: text('owner_id').notNull().references(() => member.id),
  potId: text('pot_id').references(() => pot.id), // null = needs a pot, or a main-account spend (see settledAtSource)
  categoryId: text('category_id').references(() => category.id), // used when potId is null (unassigned or main-account)
  // The bill this payment was for, when logged from an outgoing. Null for most
  // spends (ad-hoc, imports) and every row predating this. `set null` on delete:
  // removing a bill must not erase the payment history that proves what was paid.
  expenseId: text('expense_id').references(() => expense.id, { onDelete: 'set null' }),
  // "No pot transfer needed": the money already left the right place, so this
  // spend never appears on catch-up. True for pot auto-deductions (Monzo pots)
  // and for main-account spends (potId null + categoryId set). A genuinely
  // un-assigned spend is potId null AND settledAtSource 0.
  settledAtSource: integer('settled_at_source').notNull().default(0),
  reconciled: integer('reconciled').notNull().default(0),
  reconciledAt: timestamp('reconciled_at', { withTimezone: true, mode: 'date' }),
  reconciliationBatchId: text('reconciliation_batch_id').references(() => reconciliationBatch.id),
  source: text('source').notNull().default('manual'), // 'manual' | 'import'
  importRef: text('import_ref'),                       // Monzo Transaction ID; unique dedup key (NULL for manual)
  importBatchId: text('import_batch_id').references(() => importBatch.id),
  raw: text('raw'),                                    // JSON of the original imported row
  splitGroupId: text('split_group_id'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => ({
  // Import dedup is household-scoped (imports.ts filters by householdId), so the
  // uniqueness must be too — a global unique made two households importing the
  // same Monzo transaction id collide with a raw SQLite error.
  uniqImportRef: uniqueIndex('spend_transaction_import_ref').on(t.householdId, t.importRef),
  householdIdx: index('spend_transaction_household_id_idx').on(t.householdId),
  // Per-bill payment history: "what have I actually paid for this bill?"
  expenseIdx: index('spend_transaction_household_expense_idx').on(t.householdId, t.expenseId),
}))

export type ReconciliationBatch = typeof reconciliationBatch.$inferSelect
export type SpendTransaction = typeof spendTransaction.$inferSelect
export type ImportBatch = typeof importBatch.$inferSelect
