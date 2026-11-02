import { z } from 'zod'
import { asc, desc, eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../../trpc/trpc'
import { assertMember, scopeWhere } from '../../trpc/tenant'
import { expectedUpdatedAtInput, throwStaleWrite, versionGuard } from '../../trpc/concurrency'
import { recordAudit } from '../../trpc/audit'
import { maintenanceJob, maintenanceLog } from '../../db/schema'
import type { MaintenanceJob, MaintenanceLog } from '../../db/schema'
import type { DBOrTx } from '../../db/client'
import { newId } from '@shared/ids'
import { todayIso } from '@shared/dates'
import { MAINTENANCE_AREAS, STARTER_JOBS } from '@shared/maintenance'
import { MAX_REMIND_DAYS, REPEAT_UNITS, addRepeat } from '@shared/schedule'

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const AMOUNT = z.number().int().min(0).max(100_000_000)
const NOTE = z.string().trim().max(500).nullable()

export interface MaintenanceJobWithLog extends MaintenanceJob {
  /** Newest first. */
  log: MaintenanceLog[]
}

async function findJob(db: DBOrTx, householdId: string, id: string): Promise<MaintenanceJob> {
  const [row] = await db
    .select()
    .from(maintenanceJob)
    .where(scopeWhere(householdId, maintenanceJob.householdId, eq(maintenanceJob.id, id)))
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' })
  return row
}

const jobFields = z.object({
  name: z.string().trim().min(1).max(100),
  area: z.enum(MAINTENANCE_AREAS),
  notes: z.string().trim().max(2000).nullable(),
  assigneeId: z.string().nullable(),
  dueDate: DATE,
  repeatEvery: z.number().int().min(1).max(520).nullable(),
  repeatUnit: z.enum(REPEAT_UNITS),
  remindDays: z.number().int().min(0).max(MAX_REMIND_DAYS),
})

const logFields = z.object({
  doneOn: DATE,
  doneById: z.string().nullable(),
  amount: AMOUNT.nullable(),
  note: NOTE,
})

const logsRouter = router({
  update: publicProcedure.input(logFields.extend({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const { id, ...fields } = input
    if (fields.doneById) await assertMember(ctx.db, ctx.householdId, fields.doneById)
    const where = scopeWhere(ctx.householdId, maintenanceLog.householdId, eq(maintenanceLog.id, id))
    const [before] = await ctx.db.select().from(maintenanceLog).where(where)
    if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: 'Entry not found' })
    const [updated] = await ctx.db
      .update(maintenanceLog)
      .set({ ...fields, updatedAt: new Date() })
      .where(where)
      .returning()
    recordAudit(ctx, { entityType: 'maintenanceLog', entityId: id, action: 'update', before, after: updated })
    return updated!
  }),

  remove: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const where = scopeWhere(ctx.householdId, maintenanceLog.householdId, eq(maintenanceLog.id, input.id))
    const [before] = await ctx.db.delete(maintenanceLog).where(where).returning()
    if (!before) throw new TRPCError({ code: 'NOT_FOUND', message: 'Entry not found' })
    recordAudit(ctx, { entityType: 'maintenanceLog', entityId: input.id, action: 'delete', before })
  }),
})

export const maintenanceRouter = router({
  list: publicProcedure.query(async ({ ctx }): Promise<MaintenanceJobWithLog[]> => {
    const [jobs, log] = await Promise.all([
      ctx.db
        .select()
        .from(maintenanceJob)
        .where(scopeWhere(ctx.householdId, maintenanceJob.householdId))
        .orderBy(asc(maintenanceJob.dueDate), asc(maintenanceJob.name)),
      ctx.db
        .select()
        .from(maintenanceLog)
        .where(scopeWhere(ctx.householdId, maintenanceLog.householdId))
        .orderBy(desc(maintenanceLog.doneOn), desc(maintenanceLog.createdAt)),
    ])

    return jobs.map((job) => ({ ...job, log: log.filter((entry) => entry.jobId === job.id) }))
  }),

  create: publicProcedure.input(jobFields).mutation(async ({ ctx, input }) => {
    if (input.assigneeId) await assertMember(ctx.db, ctx.householdId, input.assigneeId)
    const now = new Date()
    const id = newId()
    const [inserted] = await ctx.db
      .insert(maintenanceJob)
      .values({ ...input, id, householdId: ctx.householdId, createdAt: now, updatedAt: now })
      .returning()
    recordAudit(ctx, { entityType: 'maintenanceJob', entityId: id, action: 'create', after: inserted })
    return inserted!
  }),

  /** The empty page's one-tap starters, each due today so its first run sets
   *  the rhythm. Names already on the list are skipped. */
  addStarters: publicProcedure
    .input(z.object({ names: z.array(z.string()).min(1).max(STARTER_JOBS.length) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select({ name: maintenanceJob.name })
        .from(maintenanceJob)
        .where(scopeWhere(ctx.householdId, maintenanceJob.householdId))
      const taken = new Set(existing.map((row) => row.name.toLowerCase()))
      const picked = STARTER_JOBS.filter((job) => input.names.includes(job.name) && !taken.has(job.name.toLowerCase()))
      if (picked.length === 0) return 0

      const now = new Date()
      const dueDate = todayIso()
      const rows = picked.map((job) => ({
        id: newId(),
        householdId: ctx.householdId,
        name: job.name,
        area: job.area,
        dueDate,
        repeatEvery: job.every,
        repeatUnit: job.unit,
        remindDays: job.remindDays,
        createdAt: now,
        updatedAt: now,
      }))
      const inserted = await ctx.db.insert(maintenanceJob).values(rows).returning()
      for (const row of inserted) {
        recordAudit(ctx, { entityType: 'maintenanceJob', entityId: row.id, action: 'create', after: row })
      }
      return inserted.length
    }),

  update: publicProcedure.input(jobFields.extend({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const { id, ...fields } = input
    if (fields.assigneeId) await assertMember(ctx.db, ctx.householdId, fields.assigneeId)
    const before = await findJob(ctx.db, ctx.householdId, id)
    const [updated] = await ctx.db
      .update(maintenanceJob)
      .set({ ...fields, updatedAt: new Date() })
      .where(scopeWhere(ctx.householdId, maintenanceJob.householdId, eq(maintenanceJob.id, id)))
      .returning()
    recordAudit(ctx, { entityType: 'maintenanceJob', entityId: id, action: 'update', before, after: updated })
    return updated!
  }),

  setArchived: publicProcedure
    .input(z.object({ id: z.string(), archived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const before = await findJob(ctx.db, ctx.householdId, input.id)
      const [updated] = await ctx.db
        .update(maintenanceJob)
        .set({ archivedAt: input.archived ? new Date() : null, updatedAt: new Date() })
        .where(scopeWhere(ctx.householdId, maintenanceJob.householdId, eq(maintenanceJob.id, input.id)))
        .returning()
      recordAudit(ctx, { entityType: 'maintenanceJob', entityId: input.id, action: 'update', before, after: updated })
      return updated!
    }),

  remove: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const before = await findJob(ctx.db, ctx.householdId, input.id)
    await ctx.db
      .delete(maintenanceJob)
      .where(scopeWhere(ctx.householdId, maintenanceJob.householdId, eq(maintenanceJob.id, input.id)))
    recordAudit(ctx, { entityType: 'maintenanceJob', entityId: input.id, action: 'delete', before })
  }),

  /** The job's done: log it and move the due date on from the day it was done,
   *  so a late boiler service is next due a year after the service itself. A
   *  one-off is archived, keeping its log. */
  done: publicProcedure
    .input(logFields.extend({ id: z.string(), expectedUpdatedAt: expectedUpdatedAtInput }))
    .mutation(async ({ ctx, input }) => {
      if (input.doneById) await assertMember(ctx.db, ctx.householdId, input.doneById)
      const before = await findJob(ctx.db, ctx.householdId, input.id)
      const now = new Date()

      await ctx.db.transaction(async (tx) => {
        // Moving the job first, guarded, stops a second tap logging it twice.
        const change =
          before.repeatEvery === null
            ? { archivedAt: now }
            : { dueDate: addRepeat(input.doneOn, before.repeatEvery, before.repeatUnit as 'week' | 'month') }
        const [after] = await tx
          .update(maintenanceJob)
          .set({ ...change, updatedAt: now })
          .where(
            scopeWhere(
              ctx.householdId,
              maintenanceJob.householdId,
              eq(maintenanceJob.id, input.id),
              versionGuard(maintenanceJob.updatedAt, input.expectedUpdatedAt),
            ),
          )
          .returning()
        if (!after) throwStaleWrite('Job', true)
        recordAudit(ctx, { entityType: 'maintenanceJob', entityId: input.id, action: 'update', before, after })

        const logId = newId()
        const [entry] = await tx
          .insert(maintenanceLog)
          .values({
            id: logId,
            householdId: ctx.householdId,
            jobId: input.id,
            doneOn: input.doneOn,
            doneById: input.doneById,
            amount: input.amount,
            note: input.note,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
        recordAudit(ctx, { entityType: 'maintenanceLog', entityId: logId, action: 'create', after: entry })
      })
    }),

  logs: logsRouter,
})
