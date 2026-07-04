import { z } from 'zod'
import { and, asc, eq, max } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { account, accountBalance, member } from '../db/schema'
import type { Account, AccountBalance } from '../db/schema'
import { newId } from '../../shared/ids'
import { netWorthAsOf, netWorthTimeline } from '../networth/networth'
import type { AccountKind } from '../networth/networth'
import type { DB } from '../db/client'

const KIND = z.enum(['asset', 'liability'])

async function assertMember(db: DB, ownerId: string): Promise<void> {
  const [owner] = await db.select().from(member).where(eq(member.id, ownerId))
  if (!owner) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'ownerId does not refer to an existing member' })
  }
}

async function getAccount(db: DB, id: string): Promise<Account> {
  const [row] = await db.select().from(account).where(eq(account.id, id))
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found' })
  return row
}

export interface AccountWithValue extends Account {
  /** Latest balance on or before today, or null if none recorded. */
  currentValue: number | null
  /** Date of that latest balance, or null. */
  asOfDate: string | null
}

/** Today as YYYY-MM-DD (server-local). Net worth is a "day", not a moment. */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export const accountsRouter = router({
  /** Non-archived accounts with their current (latest) balance attached. */
  list: publicProcedure.query(async ({ ctx }) => {
    const accounts = await ctx.db.select().from(account).orderBy(asc(account.sortOrder), asc(account.name))
    const balances = await ctx.db.select().from(accountBalance)
    const asOf = today()

    return accounts
      .filter((a) => a.archivedAt === null)
      .map((a): AccountWithValue => {
        const own = balances
          .filter((b) => b.accountId === a.id && b.asOfDate <= asOf)
          .sort((x, y) => y.asOfDate.localeCompare(x.asOfDate))
        const latest = own[0]
        return { ...a, currentValue: latest?.value ?? null, asOfDate: latest?.asOfDate ?? null }
      })
  }),

  /** Net-worth headline + per-account current values + the trend series. */
  summary: publicProcedure.query(async ({ ctx }) => {
    const accounts = (await ctx.db.select().from(account)).filter((a) => a.archivedAt === null)
    const balances = await ctx.db.select().from(accountBalance)
    const asOf = today()

    const kinded = accounts.map((a) => ({ id: a.id, kind: a.kind as AccountKind }))
    const point = netWorthAsOf(kinded, balances, asOf)
    const timeline = netWorthTimeline(kinded, balances)

    return {
      asOf,
      assets: point.assets,
      liabilities: point.liabilities,
      netWorth: point.netWorth,
      timeline,
    }
  }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        kind: KIND,
        subtype: z.string().nullable().optional(),
        ownerId: z.string(),
        institution: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertMember(ctx.db, input.ownerId)
      const now = Date.now()
      const [result] = await ctx.db.select({ maxOrder: max(account.sortOrder) }).from(account)
      const id = newId()
      await ctx.db.insert(account).values({
        id,
        name: input.name,
        kind: input.kind,
        subtype: input.subtype ?? null,
        ownerId: input.ownerId,
        institution: input.institution ?? null,
        note: input.note ?? null,
        sortOrder: (result?.maxOrder ?? 0) + 1,
        createdAt: now,
        updatedAt: now,
      })
      return getAccount(ctx.db, id)
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        kind: KIND.optional(),
        subtype: z.string().nullable().optional(),
        ownerId: z.string().optional(),
        institution: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
        sortOrder: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ownerId, ...rest } = input
      if (ownerId !== undefined) await assertMember(ctx.db, ownerId)
      const setFields: Record<string, unknown> = { ...rest, updatedAt: Date.now() }
      if (ownerId !== undefined) setFields['ownerId'] = ownerId
      await ctx.db.update(account).set(setFields).where(eq(account.id, id))
      return getAccount(ctx.db, id)
    }),

  archive: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await getAccount(ctx.db, input.id)
      const now = Date.now()
      await ctx.db.update(account).set({ archivedAt: now, updatedAt: now }).where(eq(account.id, input.id))
    }),

  /** Hard-delete an account and its balances (cascade). */
  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await getAccount(ctx.db, input.id)
      await ctx.db.delete(account).where(eq(account.id, input.id))
    }),

  // -- Balances ------------------------------------------------------------

  /** One account's balance history, oldest-first. */
  balances: publicProcedure
    .input(z.object({ accountId: z.string() }))
    .query(async ({ ctx, input }): Promise<AccountBalance[]> => {
      return ctx.db
        .select()
        .from(accountBalance)
        .where(eq(accountBalance.accountId, input.accountId))
        .orderBy(asc(accountBalance.asOfDate))
    }),

  /** Add (or overwrite) the balance snapshot for an account on a given date. */
  addBalance: publicProcedure
    .input(
      z.object({
        accountId: z.string(),
        asOfDate: z.string(),
        value: z.number().int(),
        note: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await getAccount(ctx.db, input.accountId)
      const now = Date.now()

      // One snapshot per (account, date): update in place if the date already exists.
      const [match] = await ctx.db
        .select()
        .from(accountBalance)
        .where(and(eq(accountBalance.accountId, input.accountId), eq(accountBalance.asOfDate, input.asOfDate)))
      if (match) {
        await ctx.db
          .update(accountBalance)
          .set({ value: input.value, note: input.note ?? null, updatedAt: now })
          .where(eq(accountBalance.id, match.id))
        const [updated] = await ctx.db.select().from(accountBalance).where(eq(accountBalance.id, match.id))
        return updated!
      }

      const id = newId()
      await ctx.db.insert(accountBalance).values({
        id,
        accountId: input.accountId,
        asOfDate: input.asOfDate,
        value: input.value,
        note: input.note ?? null,
        createdAt: now,
        updatedAt: now,
      })
      const [inserted] = await ctx.db.select().from(accountBalance).where(eq(accountBalance.id, id))
      return inserted!
    }),

  updateBalance: publicProcedure
    .input(
      z.object({
        id: z.string(),
        asOfDate: z.string().optional(),
        value: z.number().int().optional(),
        note: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input
      await ctx.db.update(accountBalance).set({ ...rest, updatedAt: Date.now() }).where(eq(accountBalance.id, id))
      const [updated] = await ctx.db.select().from(accountBalance).where(eq(accountBalance.id, id))
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Balance not found' })
      return updated
    }),

  removeBalance: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await ctx.db.select().from(accountBalance).where(eq(accountBalance.id, input.id))
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'Balance not found' })
      await ctx.db.delete(accountBalance).where(eq(accountBalance.id, input.id))
    }),
})
