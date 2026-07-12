import { z } from 'zod'
import { eq, isNull } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { assertRole, scopeWhere } from '../trpc/tenant'
import { recordAudit } from '../trpc/audit'
import { household, member } from '../db/schema'

export const householdRouter = router({
  update: publicProcedure
    .input(
      z.object({
        displayName: z.string().min(1).optional(),
        currencyCode: z.string().optional(),
        currencySymbol: z.string().optional(),
        currencyDecimalPlaces: z.number().int().min(0).max(4).optional(),
        currencySymbolPosition: z.enum(['prefix', 'suffix']).optional(),
        currencyGroupSeparator: z.enum([',', '.', ' ', '']).optional(),
        currencyDecimalSeparator: z.enum(['.', ',']).optional(),
        locale: z.string().optional(),
        budgetPeriodStartDay: z.number().int().min(1).max(28).optional(),
        budgetPeriodFrequency: z
          .enum(['monthly', 'four_weekly', 'fortnightly', 'weekly'])
          .optional(),
        budgetPeriodAnchor: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
          .nullable()
          .optional(),
        weekStart: z.enum(['monday', 'sunday']).optional(),
        dateFormat: z.enum(['iso', 'numeric', 'medium', 'long']).optional(),
        backupFrequency: z.enum(['off', 'daily', 'weekly']).optional(),
        incomeBasisDefault: z
          .enum(['regular_net', 'latest_payslip', 'rolling_12m'])
          .optional(),
        jointContributionBasis: z
          .enum(['equal', 'income_proportional', 'custom'])
          .optional(),
        emergencyFundMonths: z.number().int().min(0).max(24).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.role, 'admin')
      const now = new Date()
      const [before] = await ctx.db.select().from(household).where(eq(household.id, ctx.householdId))
      await ctx.db
        .update(household)
        .set({ ...input, updatedAt: now })
        .where(eq(household.id, ctx.householdId))

      const [updated] = await ctx.db
        .select()
        .from(household)
        .where(eq(household.id, ctx.householdId))

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Household not found' })
      }

      recordAudit(ctx, { entityType: 'household', entityId: ctx.householdId, action: 'update', before, after: updated })
      return updated
    }),

  completeSetup: publicProcedure.mutation(async ({ ctx }) => {
    assertRole(ctx.role, 'admin')
    // Require at least one active person member
    const people = await ctx.db
      .select()
      .from(member)
      .where(scopeWhere(ctx.householdId, member.householdId, eq(member.kind, 'person'), isNull(member.archivedAt)))

    if (people.length === 0) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message:
          'At least one active person member must exist before completing setup.',
      })
    }

    const now = new Date()
    const [before] = await ctx.db.select().from(household).where(eq(household.id, ctx.householdId))
    await ctx.db
      .update(household)
      .set({ setupCompletedAt: now, updatedAt: now })
      .where(eq(household.id, ctx.householdId))

    const [updated] = await ctx.db
      .select()
      .from(household)
      .where(eq(household.id, ctx.householdId))

    if (!updated) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Household not found' })
    }

    recordAudit(ctx, { entityType: 'household', entityId: ctx.householdId, action: 'update', before, after: updated })
    return updated
  }),
})
