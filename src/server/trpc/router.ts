import { router, publicProcedure } from './trpc'
import { bootstrapRouter } from '../routers/bootstrap'
import { householdRouter } from '../routers/household'
import { membersRouter } from '../routers/members'
import { categoriesRouter } from '../routers/categories'
import { potsRouter } from '../routers/pots'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  bootstrap: bootstrapRouter,
  household: householdRouter,
  members: membersRouter,
  categories: categoriesRouter,
  pots: potsRouter,
})

export type AppRouter = typeof appRouter
