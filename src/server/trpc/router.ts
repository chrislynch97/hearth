import { router, publicProcedure } from './trpc'
import { bootstrapRouter } from '../routers/bootstrap'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  bootstrap: bootstrapRouter,
})

export type AppRouter = typeof appRouter
