import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc/trpc'
import { household, member } from '../db/schema'

const HOUSEHOLD_ID = 'household'

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
        themePreference: z.enum(['system', 'light', 'dark']).optional(),
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
      const now = Date.now()
      await ctx.db
        .update(household)
        .set({ ...input, updatedAt: now })
        .where(eq(household.id, HOUSEHOLD_ID))

      const [updated] = await ctx.db
        .select()
        .from(household)
        .where(eq(household.id, HOUSEHOLD_ID))

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Household not found' })
      }

      return updated
    }),

  completeSetup: publicProcedure.mutation(async ({ ctx }) => {
    // Require at least one active person member
    const people = await ctx.db
      .select()
      .from(member)
      .where(and(eq(member.kind, 'person'), isNull(member.archivedAt)))

    if (people.length === 0) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message:
          'At least one active person member must exist before completing setup.',
      })
    }

    const now = Date.now()
    await ctx.db
      .update(household)
      .set({ setupCompletedAt: now, updatedAt: now })
      .where(eq(household.id, HOUSEHOLD_ID))

    const [updated] = await ctx.db
      .select()
      .from(household)
      .where(eq(household.id, HOUSEHOLD_ID))

    if (!updated) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Household not found' })
    }

    return updated
  }),
})
