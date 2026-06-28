import { router, publicProcedure } from './trpc'
import { bootstrapRouter } from '../routers/bootstrap'
import { householdRouter } from '../routers/household'
import { membersRouter } from '../routers/members'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  bootstrap: bootstrapRouter,
  household: householdRouter,
  members: membersRouter,
})

export type AppRouter = typeof appRouter
