import { z } from 'zod'
import { asc, eq, isNull } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { assertMember, scopeWhere } from '../trpc/tenant'
import { expectedUpdatedAtInput, throwStaleWrite, versionGuard } from '../trpc/concurrency'
import { recordAudit } from '../trpc/audit'
import { setAside, pot } from '../db/schema'
import type { SetAside, Pot } from '../db/schema'
import { newId } from '../../shared/ids'
import type { DB, DBOrTx } from '../db/client'

const recurrenceEnum = z.enum(['monthly', 'quarterly', 'yearly'])

/** One contribution line as the Pots screen sends it — a named part (or the
 *  common single unnamed line) with a monthly-ish amount. Shared by
 *  `setAside.replaceForPot` and `pots.createWithContributions`. */
export const contributionLineInput = z.object({
  label: z.string().nullable().optional(),
  amount: z.number().int().min(0),
  recurrence: recurrenceEnum.optional(),
})
export type ContributionLine = z.infer<typeof contributionLineInput>

/**
 * Insert a pot's contribution lines, skipping zero-amount lines. Owner is taken
 * from the pot. Takes a `DBOrTx` so it composes inside a larger transaction —
 * `pots.createWithContributions` threads its tx through here so the pot and its
 * contributions commit atomically (no orphaned pot if a line insert fails).
 */
export async function insertContributionLines(
  db: DBOrTx,
  householdId: string,
  p: Pick<Pot, 'id' | 'name' | 'ownerId'>,
  lines: ContributionLine[],
  now: Date,
): Promise<void> {
  const kept = lines.filter((l) => l.amount > 0)
  for (const [i, line] of kept.entries()) {
    await db.insert(setAside).values({
      id: newId(),
      householdId,
      name: line.label?.trim() || p.name,
      groupLabel: null,
      ownerId: p.ownerId,
      potId: p.id,
      amount: line.amount,
      recurrence: line.recurrence ?? 'monthly',
      note: null,
      active: 1,
      sortOrder: i,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    })
  }
}

const baseInput = z.object({
  name: z.string().min(1),
  groupLabel: z.string().nullable().optional(),
  ownerId: z.string(),
  potId: z.string(),
  amount: z.number().int().min(0),
  recurrence: recurrenceEnum,
  note: z.string().nullable().optional(),
})

async function validateOwnerAndPot(db: DB, householdId: string, ownerId: string, potId: string): Promise<void> {
  await assertMember(db, householdId, ownerId)
  const [p] = await db.select().from(pot).where(scopeWhere(householdId, pot.householdId, eq(pot.id, potId)))
  if (!p) throw new TRPCError({ code: 'BAD_REQUEST', message: 'potId does not refer to an existing pot' })
}

async function load(db: DB, householdId: string, id: string): Promise<SetAside> {
  const [row] = await db.select().from(setAside).where(scopeWhere(householdId, setAside.householdId, eq(setAside.id, id)))
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Set-aside not found' })
  return row
}

export const setAsideRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(setAside)
      .where(scopeWhere(ctx.householdId, setAside.householdId, isNull(setAside.archivedAt)))
      .orderBy(asc(setAside.name))
  }),

  create: publicProcedure.input(baseInput).mutation(async ({ ctx, input }) => {
    await validateOwnerAndPot(ctx.db, ctx.householdId, input.ownerId, input.potId)
    const now = new Date()
    const id = newId()
    await ctx.db.insert(setAside).values({
      id,
      householdId: ctx.householdId,
      name: input.name,
      groupLabel: input.groupLabel ?? null,
      ownerId: input.ownerId,
      potId: input.potId,
      amount: input.amount,
      recurrence: input.recurrence,
      note: input.note ?? null,
      active: 1,
      sortOrder: 0,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    const created = await load(ctx.db, ctx.householdId, id)
    recordAudit(ctx, { entityType: 'setAside', entityId: id, action: 'create', after: created })
    return created
  }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        expectedUpdatedAt: expectedUpdatedAtInput,
        name: z.string().min(1).optional(),
        groupLabel: z.string().nullable().optional(),
        ownerId: z.string().optional(),
        potId: z.string().optional(),
        amount: z.number().int().min(0).optional(),
        recurrence: recurrenceEnum.optional(),
        note: z.string().nullable().optional(),
        active: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, expectedUpdatedAt, active, ...rest } = input
      const now = new Date()
      const target = await load(ctx.db, ctx.householdId, id)

      if (rest.ownerId !== undefined || rest.potId !== undefined) {
        await validateOwnerAndPot(ctx.db, ctx.householdId, rest.ownerId ?? target.ownerId, rest.potId ?? target.potId)
      }

      const setFields: Record<string, unknown> = { ...rest, updatedAt: now }
      if (active !== undefined) setFields['active'] = active ? 1 : 0

      const [written] = await ctx.db
        .update(setAside)
        .set(setFields)
        .where(scopeWhere(ctx.householdId, setAside.householdId, eq(setAside.id, id), versionGuard(setAside.updatedAt, expectedUpdatedAt)))
        .returning({ id: setAside.id })
      if (!written) {
        const [current] = await ctx.db
          .select({ id: setAside.id })
          .from(setAside)
          .where(scopeWhere(ctx.householdId, setAside.householdId, eq(setAside.id, id)))
        throwStaleWrite('Set-aside', current != null)
      }
      const after = await load(ctx.db, ctx.householdId, id)
      recordAudit(ctx, { entityType: 'setAside', entityId: id, action: 'update', before: target, after })
      return after
    }),

  archive: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const target = await load(ctx.db, ctx.householdId, input.id)
      const now = new Date()
      await ctx.db
        .update(setAside)
        .set({ archivedAt: now, updatedAt: now })
        .where(scopeWhere(ctx.householdId, setAside.householdId, eq(setAside.id, input.id)))
      recordAudit(ctx, { entityType: 'setAside', entityId: input.id, action: 'archive', before: target })
    }),

  /**
   * Replace all of a pot's monthly contributions in one shot (used by the Pots
   * screen). Each line is a named part of the pot's set-aside; a single unnamed
   * line is the common case, several lines are the "hobbies = running + squash"
   * breakdown. Owner is taken from the pot. Existing rows for the pot are removed
   * and replaced, so passing an empty list clears the pot's contribution.
   */
  replaceForPot: publicProcedure
    .input(
      z.object({
        potId: z.string(),
        lines: z.array(contributionLineInput),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date()
      const scopePot = () => scopeWhere(ctx.householdId, setAside.householdId, eq(setAside.potId, input.potId))
      await ctx.db.transaction(async (tx) => {
        const [p] = await tx
          .select()
          .from(pot)
          .where(scopeWhere(ctx.householdId, pot.householdId, eq(pot.id, input.potId)))
        if (!p) throw new TRPCError({ code: 'BAD_REQUEST', message: 'potId does not refer to an existing pot' })

        // Capture the pot's contributions before/after so a wiped or reshaped set
        // can be recovered — the whole replace is one audit entry keyed on the pot.
        const before = await tx.select().from(setAside).where(scopePot())
        await tx.delete(setAside).where(scopePot())
        await insertContributionLines(tx, ctx.householdId, p, input.lines, now)
        const after = await tx.select().from(setAside).where(scopePot())
        recordAudit(ctx, {
          entityType: 'potContributions',
          entityId: input.potId,
          action: 'update',
          before: { contributions: before },
          after: { contributions: after },
        })
      })
      return ctx.db.select().from(setAside).where(scopePot())
    }),
})
