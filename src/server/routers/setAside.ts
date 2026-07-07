import { z } from 'zod'
import { asc, eq, isNull } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { setAside, member, pot } from '../db/schema'
import type { SetAside } from '../db/schema'
import { newId } from '../../shared/ids'
import type { DB } from '../db/client'

const recurrenceEnum = z.enum(['monthly', 'quarterly', 'yearly'])

const baseInput = z.object({
  name: z.string().min(1),
  groupLabel: z.string().nullable().optional(),
  ownerId: z.string(),
  potId: z.string(),
  amount: z.number().int().min(0),
  recurrence: recurrenceEnum,
  note: z.string().nullable().optional(),
})

async function validateOwnerAndPot(db: DB, ownerId: string, potId: string): Promise<void> {
  const [owner] = await db.select().from(member).where(eq(member.id, ownerId))
  if (!owner) throw new TRPCError({ code: 'BAD_REQUEST', message: 'ownerId does not refer to an existing member' })
  const [p] = await db.select().from(pot).where(eq(pot.id, potId))
  if (!p) throw new TRPCError({ code: 'BAD_REQUEST', message: 'potId does not refer to an existing pot' })
}

async function load(db: DB, id: string): Promise<SetAside> {
  const [row] = await db.select().from(setAside).where(eq(setAside.id, id))
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Set-aside not found' })
  return row
}

export const setAsideRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(setAside).where(isNull(setAside.archivedAt)).orderBy(asc(setAside.name))
  }),

  create: publicProcedure.input(baseInput).mutation(async ({ ctx, input }) => {
    await validateOwnerAndPot(ctx.db, input.ownerId, input.potId)
    const now = Date.now()
    const id = newId()
    await ctx.db.insert(setAside).values({
      id,
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
    return load(ctx.db, id)
  }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
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
      const { id, active, ...rest } = input
      const now = Date.now()
      const target = await load(ctx.db, id)

      if (rest.ownerId !== undefined || rest.potId !== undefined) {
        await validateOwnerAndPot(ctx.db, rest.ownerId ?? target.ownerId, rest.potId ?? target.potId)
      }

      const setFields: Record<string, unknown> = { ...rest, updatedAt: now }
      if (active !== undefined) setFields['active'] = active ? 1 : 0

      await ctx.db.update(setAside).set(setFields).where(eq(setAside.id, id))
      return load(ctx.db, id)
    }),

  archive: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await load(ctx.db, input.id)
      const now = Date.now()
      await ctx.db.update(setAside).set({ archivedAt: now, updatedAt: now }).where(eq(setAside.id, input.id))
    }),
})
