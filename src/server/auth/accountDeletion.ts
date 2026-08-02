/** Deleting a login identity (issue #230).
 *
 *  Household erasure (#110) removes a tenant; this removes a *person*. `user` is
 *  a global row with no FK to `household`, so erasing a household left the
 *  account — username, email, password hash, MFA secret — behind with nothing
 *  that would ever remove it.
 *
 *  A user with no membership row is dead in this product: nothing can grant one
 *  back, because accepting an invitation always mints a *new* account. So the
 *  rule these helpers implement is that such a row is never left lying around —
 *  the paths that can create one sweep it, and the login gate refuses one that
 *  somehow survives.
 */
import { createHash } from 'node:crypto'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { household, invitation, member, membership, user } from '../db/schema'
import type { DBOrTx } from '../db/client'
import { DEFAULT_HOUSEHOLD_ID } from '../trpc/tenant'

/** A stable, non-reversible handle for an account that no longer exists, so the
 *  audit entries about one erasure can be tied together without keeping the
 *  identity the erasure was meant to remove. */
export function accountReference(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 16)
}

/** Delete account rows, leaving each household's budgeting history behind.
 *
 *  `membership`, `session` and `email_token` cascade from `user`. Two columns
 *  don't and are handled here: `member.userId` has no FK at all and is *unlinked*
 *  on purpose — a household's spends and payslips must not vanish because the
 *  person who entered them left — and `invitation.invitedByUserId` is ON DELETE
 *  NO ACTION, so a pending invite the account issued would otherwise block the
 *  delete outright. */
export async function deleteUsers(tx: DBOrTx, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return
  await tx.update(member).set({ userId: null, updatedAt: new Date() }).where(inArray(member.userId, userIds))
  await tx.update(invitation).set({ invitedByUserId: null }).where(inArray(invitation.invitedByUserId, userIds))
  await tx.delete(user).where(inArray(user.id, userIds))
}

/** Accounts left with no membership row at all.
 *
 *  `among` narrows the sweep to the people a particular action touched, so a
 *  caller only ever deletes what it can account for — an unrelated orphan from a
 *  legacy install is the operator's to deal with, not a surprise side effect of
 *  someone erasing their household. `except` keeps the instance owner out of
 *  every sweep: that account is the instance's root of trust. */
export async function orphanedUserIds(
  tx: DBOrTx,
  opts: { among?: string[]; except?: string | null } = {},
): Promise<string[]> {
  const { among, except } = opts
  if (among && among.length === 0) return []
  const rows = await tx
    .select({ id: user.id })
    .from(user)
    .leftJoin(membership, eq(membership.userId, user.id))
    .where(among ? and(isNull(membership.id), inArray(user.id, among)) : isNull(membership.id))
  return rows.map((r) => r.id).filter((id) => id !== except)
}

/** What deleting `userId` would take with it, and what stops it.
 *
 *  `blockedBy` names the households where the caller is the only owner but not
 *  the only member: someone has to be left holding the household, so they must
 *  hand it over or erase it first. `households` are the ones that would go with
 *  the account because nobody else belongs to them. */
export interface AccountDeletionImpact {
  blockedBy: Array<{ id: string; name: string }>
  households: Array<{ id: string; name: string }>
}

export async function accountDeletionImpact(db: DBOrTx, userId: string): Promise<AccountDeletionImpact> {
  const mine = (await db.select().from(membership).where(eq(membership.userId, userId))).filter(
    (m) => m.acceptedAt !== null,
  )
  if (mine.length === 0) return { blockedBy: [], households: [] }

  const householdIds = mine.map((m) => m.householdId)
  const all = await db.select().from(membership).where(inArray(membership.householdId, householdIds))
  const rows = await db.select().from(household).where(inArray(household.id, householdIds))
  const nameById = new Map(rows.map((h) => [h.id, h.displayName]))
  const named = (id: string) => ({ id, name: nameById.get(id) ?? 'Household' })

  const blockedBy: Array<{ id: string; name: string }> = []
  const households: Array<{ id: string; name: string }> = []
  for (const grant of mine) {
    const peers = all.filter((m) => m.householdId === grant.householdId && m.userId !== userId)
    if (peers.length === 0) {
      // Nobody else belongs here, so the household has nobody to fall to and
      // would be left holding financial records no one could ever reach. Never
      // the primary household, which is the instance's own — wiping that one is
      // `data.reset`, and its owner is refused this whole procedure anyway.
      if (grant.householdId !== DEFAULT_HOUSEHOLD_ID) households.push(named(grant.householdId))
      continue
    }
    const otherOwners = peers.filter((m) => m.role === 'owner' && m.acceptedAt !== null)
    if (grant.role === 'owner' && otherOwners.length === 0) blockedBy.push(named(grant.householdId))
  }
  return { blockedBy, households }
}
