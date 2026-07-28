import { eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { assertMember, scopeWhere } from '../../trpc/tenant'
import { pot, category, expense } from '../../db/schema'
import type { DB } from '../../db/client'

/** A spend's owner, pot and category must all exist in this household. */
export async function validateOwnerAndPot(
  db: DB,
  householdId: string,
  ownerId: string,
  potId: string | null | undefined,
  categoryId: string | null | undefined,
): Promise<void> {
  await assertMember(db, householdId, ownerId)
  if (potId) {
    const [p] = await db.select().from(pot).where(scopeWhere(householdId, pot.householdId, eq(pot.id, potId)))
    if (!p) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'potId does not refer to an existing pot' })
    }
  }
  if (categoryId) {
    const [c] = await db.select().from(category).where(scopeWhere(householdId, category.householdId, eq(category.id, categoryId)))
    if (!c) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'categoryId does not refer to an existing category' })
    }
  }
}

/** The bill a spend claims to pay must exist in this household. No-op when the
 *  spend isn't tied to one, which is most of them. */
export async function validateExpense(
  db: DB,
  householdId: string,
  expenseId: string | null | undefined,
): Promise<void> {
  if (!expenseId) return
  const [e] = await db.select().from(expense).where(scopeWhere(householdId, expense.householdId, eq(expense.id, expenseId)))
  if (!e) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'expenseId does not refer to an existing bill' })
  }
}
