import { z } from 'zod'
import { and, asc, desc, eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../../trpc/trpc'
import { assertMember, scopeWhere } from '../../trpc/tenant'
import { expectedUpdatedAtInput, throwStaleWrite, versionGuard } from '../../trpc/concurrency'
import { recordAudit } from '../../trpc/audit'
import { expense, vehicle, vehicleBill, vehicleCost, vehicleDate } from '../../db/schema'
import type { Vehicle, VehicleCost, VehicleDate } from '../../db/schema'
import type { DBOrTx } from '../../db/client'
import { newId } from '@shared/ids'
import { shortPath } from '@shared/slug'
import { annualise, type Recurrence } from '@shared/recurrence'
import { MAX_REMIND_DAYS, nextDueDate } from '@shared/schedule'
import { VEHICLE_COST_KINDS, VEHICLE_DATE_KINDS, VEHICLE_KINDS, vehicleDateName } from '@shared/vehicles'
import { newShortId } from '../savings/savings'

const NAME = z.string().trim().min(1).max(100)
const REGISTRATION = z.string().trim().max(20).nullable()
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const AMOUNT = z.number().int().min(0).max(100_000_000)
const NOTE = z.string().trim().max(500).nullable()

export interface LinkedBill {
  id: string
  name: string
  amount: number
  recurrence: string
  /** What it costs over a year, for the vehicle's running total. */
  annual: number
  archived: boolean
}

export interface VehicleWithDetails extends Vehicle {
  /** Its URL segment, `k3x9p2-golf`. */
  slug: string
  dates: Array<VehicleDate & { name: string }>
  costs: VehicleCost[]
  bills: LinkedBill[]
}

/** A guessed id from another household must not reach their vehicle. */
async function assertVehicle(db: DBOrTx, householdId: string, vehicleId: string): Promise<void> {
  const [row] = await db
    .select({ id: vehicle.id })
    .from(vehicle)
    .where(scopeWhere(householdId, vehicle.householdId, eq(vehicle.id, vehicleId)))
  if (!row) throw new TRPCError({ code: 'BAD_REQUEST', message: 'That vehicle no longer exists.' })
}

async function findDate(db: DBOrTx, householdId: string, id: string): Promise<VehicleDate> {
  const [row] = await db
    .select()
    .from(vehicleDate)
    .where(scopeWhere(householdId, vehicleDate.householdId, eq(vehicleDate.id, id)))
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Date not found' })
  return row
}

const dateFields = z.object({
  kind: z.enum(VEHICLE_DATE_KINDS),
  label: z.string().trim().max(60).nullable(),
  dueDate: DATE,
  repeatMonths: z.number().int().min(1).max(120).nullable(),
  remindDays: z.number().int().min(0).max(MAX_REMIND_DAYS),
})

const costFields = z.object({
  kind: z.enum(VEHICLE_COST_KINDS),
  date: DATE,
  amount: AMOUNT,
  note: NOTE,
})

const datesRouter = router({
  create: publicProcedure
    .input(dateFields.extend({ vehicleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertVehicle(ctx.db, ctx.householdId, input.vehicleId)
      const now = new Date()
      const id = newId()
      const [inserted] = await ctx.db
        .insert(vehicleDate)
        .values({ ...input, id, householdId: ctx.householdId, createdAt: now, updatedAt: now })
        .returning()
      recordAudit(ctx, { entityType: 'vehicleDate', entityId: id, action: 'create', after: inserted })
      return inserted!
    }),

  update: publicProcedure.input(dateFields.extend({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const { id, ...fields } = input
    const before = await findDate(ctx.db, ctx.householdId, id)
    const [updated] = await ctx.db
      .update(vehicleDate)
      .set({ ...fields, updatedAt: new Date() })
      .where(scopeWhere(ctx.householdId, vehicleDate.householdId, eq(vehicleDate.id, id)))
      .returning()
    recordAudit(ctx, { entityType: 'vehicleDate', entityId: id, action: 'update', before, after: updated })
    return updated!
  }),

  remove: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const before = await findDate(ctx.db, ctx.householdId, input.id)
    await ctx.db
      .delete(vehicleDate)
      .where(scopeWhere(ctx.householdId, vehicleDate.householdId, eq(vehicleDate.id, input.id)))
    recordAudit(ctx, { entityType: 'vehicleDate', entityId: input.id, action: 'delete', before })
  }),

  /** The MOT's done: log what it cost, if anything, and move the date on by its
   *  repeat. A one-off date is finished, so it goes. */
  done: publicProcedure
    .input(
      z.object({
        id: z.string(),
        expectedUpdatedAt: expectedUpdatedAtInput,
        doneOn: DATE,
        amount: AMOUNT.nullable(),
        note: NOTE,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const before = await findDate(ctx.db, ctx.householdId, input.id)
      const now = new Date()
      const costKind = (VEHICLE_COST_KINDS as readonly string[]).includes(before.kind) ? before.kind : 'other'
      const note = input.note ?? (before.kind === 'other' ? vehicleDateName(before.kind, before.label) : null)

      await ctx.db.transaction(async (tx) => {
        // Moving the date first, guarded, stops a second tap rolling it on twice.
        const where = scopeWhere(
          ctx.householdId,
          vehicleDate.householdId,
          eq(vehicleDate.id, input.id),
          versionGuard(vehicleDate.updatedAt, input.expectedUpdatedAt),
        )
        if (before.repeatMonths === null) {
          const removed = await tx.delete(vehicleDate).where(where).returning({ id: vehicleDate.id })
          if (removed.length === 0) throwStaleWrite('Date', true)
          recordAudit(ctx, { entityType: 'vehicleDate', entityId: input.id, action: 'delete', before })
        } else {
          const dueDate = nextDueDate(before.dueDate, input.doneOn, before.repeatMonths)
          const [after] = await tx.update(vehicleDate).set({ dueDate, updatedAt: now }).where(where).returning()
          if (!after) throwStaleWrite('Date', true)
          recordAudit(ctx, { entityType: 'vehicleDate', entityId: input.id, action: 'update', before, after })
        }
        if (input.amount !== null) {
          const costId = newId()
          const [cost] = await tx
            .insert(vehicleCost)
            .values({
              id: costId,
              householdId: ctx.householdId,
              vehicleId: before.vehicleId,
              kind: costKind,
              date: input.doneOn,
              amount: input.amount,
              note,
              createdAt: now,
              updatedAt: now,
            })
            .returning()
          recordAudit(ctx, { entityType: 'vehicleCost', entityId: costId, action: 'create', after: cost })
        }
      })
    }),
})

const costsRouter = router({
  create: publicProcedure
    .input(costFields.extend({ vehicleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertVehicle(ctx.db, ctx.householdId, input.vehicleId)
      const now = new Date()
      const id = newId()
      const [inserted] = await ctx.db
        .insert(vehicleCost)
        .values({ ...input, id, householdId: ctx.householdId, createdAt: now, updatedAt: now })
        .returning()
      recordAudit(ctx, { entityType: 'vehicleCost', entityId: id, action: 'create', after: inserted })
      return inserted!
    }),

  update: publicProcedure.input(costFields.extend({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const { id, ...fields } = input
    const where = scopeWhere(ctx.householdId, vehicleCost.householdId, eq(vehicleCost.id, id))
    const [before] = await ctx.db.select().from(vehicleCost).where(where)
    if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cost not found' })
    const [updated] = await ctx.db
      .update(vehicleCost)
      .set({ ...fields, updatedAt: new Date() })
      .where(where)
      .returning()
    recordAudit(ctx, { entityType: 'vehicleCost', entityId: id, action: 'update', before, after: updated })
    return updated!
  }),

  remove: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const where = scopeWhere(ctx.householdId, vehicleCost.householdId, eq(vehicleCost.id, input.id))
    const [before] = await ctx.db.select().from(vehicleCost).where(where)
    if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cost not found' })
    await ctx.db.delete(vehicleCost).where(where)
    recordAudit(ctx, { entityType: 'vehicleCost', entityId: input.id, action: 'delete', before })
  }),
})

const billsRouter = router({
  /** Links a bill to a vehicle, moving it off any other vehicle it was on. */
  link: publicProcedure
    .input(z.object({ vehicleId: z.string(), expenseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertVehicle(ctx.db, ctx.householdId, input.vehicleId)
      const [bill] = await ctx.db
        .select({ id: expense.id })
        .from(expense)
        .where(scopeWhere(ctx.householdId, expense.householdId, eq(expense.id, input.expenseId)))
      if (!bill) throw new TRPCError({ code: 'BAD_REQUEST', message: 'That bill no longer exists.' })

      const now = new Date()
      await ctx.db
        .insert(vehicleBill)
        .values({ id: newId(), householdId: ctx.householdId, ...input, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({ target: vehicleBill.expenseId, set: { vehicleId: input.vehicleId, updatedAt: now } })
      recordAudit(ctx, { entityType: 'vehicleBill', entityId: input.expenseId, action: 'update', after: input })
    }),

  unlink: publicProcedure.input(z.object({ expenseId: z.string() })).mutation(async ({ ctx, input }) => {
    const [before] = await ctx.db
      .delete(vehicleBill)
      .where(scopeWhere(ctx.householdId, vehicleBill.householdId, eq(vehicleBill.expenseId, input.expenseId)))
      .returning()
    if (before) recordAudit(ctx, { entityType: 'vehicleBill', entityId: input.expenseId, action: 'delete', before })
  }),
})

export const vehiclesRouter = router({
  /** Every vehicle, archived included, with its dates, costs and linked bills. */
  list: publicProcedure.query(async ({ ctx }): Promise<VehicleWithDetails[]> => {
    const [vehicles, dates, costs, bills] = await Promise.all([
      ctx.db
        .select()
        .from(vehicle)
        .where(scopeWhere(ctx.householdId, vehicle.householdId))
        .orderBy(asc(vehicle.createdAt)),
      ctx.db
        .select()
        .from(vehicleDate)
        .where(scopeWhere(ctx.householdId, vehicleDate.householdId))
        .orderBy(asc(vehicleDate.dueDate)),
      ctx.db
        .select()
        .from(vehicleCost)
        .where(scopeWhere(ctx.householdId, vehicleCost.householdId))
        .orderBy(desc(vehicleCost.date), desc(vehicleCost.createdAt)),
      ctx.db
        .select({
          vehicleId: vehicleBill.vehicleId,
          id: expense.id,
          name: expense.name,
          amount: expense.amount,
          recurrence: expense.recurrence,
          archivedAt: expense.archivedAt,
          active: expense.active,
        })
        .from(vehicleBill)
        .innerJoin(expense, and(eq(vehicleBill.expenseId, expense.id), eq(expense.householdId, ctx.householdId)))
        .where(scopeWhere(ctx.householdId, vehicleBill.householdId))
        .orderBy(asc(expense.name)),
    ])

    return vehicles.map((row) => ({
      ...row,
      slug: shortPath(row.shortId, row.name),
      dates: dates
        .filter((d) => d.vehicleId === row.id)
        .map((d) => ({ ...d, name: vehicleDateName(d.kind, d.label) })),
      costs: costs.filter((c) => c.vehicleId === row.id),
      bills: bills
        .filter((b) => b.vehicleId === row.id)
        .map((b) => {
          const archived = b.archivedAt !== null || b.active === 0
          const amount = b.amount ?? 0
          return {
            id: b.id,
            name: b.name,
            amount,
            recurrence: b.recurrence,
            annual: archived ? 0 : annualise(amount, b.recurrence as Recurrence),
            archived,
          }
        }),
    }))
  }),

  create: publicProcedure
    .input(
      z.object({
        name: NAME,
        kind: z.enum(VEHICLE_KINDS),
        registration: REGISTRATION,
        ownerId: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.ownerId) await assertMember(ctx.db, ctx.householdId, input.ownerId)
      const now = new Date()
      const id = newId()
      const taken = await ctx.db
        .select({ shortId: vehicle.shortId })
        .from(vehicle)
        .where(scopeWhere(ctx.householdId, vehicle.householdId))
      const shortId = newShortId(new Set(taken.map((t) => t.shortId)))
      const [inserted] = await ctx.db
        .insert(vehicle)
        .values({
          ...input,
          registration: input.registration?.toUpperCase() || null,
          id,
          householdId: ctx.householdId,
          shortId,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      recordAudit(ctx, { entityType: 'vehicle', entityId: id, action: 'create', after: inserted })
      return { ...inserted!, slug: shortPath(shortId, input.name) }
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        expectedUpdatedAt: expectedUpdatedAtInput,
        name: NAME.optional(),
        kind: z.enum(VEHICLE_KINDS).optional(),
        registration: REGISTRATION.optional(),
        ownerId: z.string().nullable().optional(),
        archived: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, expectedUpdatedAt, archived, registration, ...fields } = input
      if (fields.ownerId) await assertMember(ctx.db, ctx.householdId, fields.ownerId)
      const [before] = await ctx.db
        .select()
        .from(vehicle)
        .where(scopeWhere(ctx.householdId, vehicle.householdId, eq(vehicle.id, id)))
      if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: 'Vehicle not found' })

      const now = new Date()
      const archiving = archived === undefined ? {} : { archivedAt: archived ? (before.archivedAt ?? now) : null }
      const plate = registration === undefined ? {} : { registration: registration?.toUpperCase() || null }
      const [updated] = await ctx.db
        .update(vehicle)
        .set({ ...fields, ...plate, ...archiving, updatedAt: now })
        .where(
          scopeWhere(
            ctx.householdId,
            vehicle.householdId,
            eq(vehicle.id, id),
            versionGuard(vehicle.updatedAt, expectedUpdatedAt),
          ),
        )
        .returning()
      if (updated) {
        const action = archived && !before.archivedAt ? 'archive' : 'update'
        recordAudit(ctx, { entityType: 'vehicle', entityId: id, action, before, after: updated })
        return { ...updated, slug: shortPath(updated.shortId, updated.name) }
      }
      throwStaleWrite('Vehicle', true)
    }),

  dates: datesRouter,
  costs: costsRouter,
  bills: billsRouter,
})
