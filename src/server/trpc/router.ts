import { router, publicProcedure } from './trpc'
import { bootstrapRouter } from '../routers/bootstrap'
import { householdRouter } from '../routers/household'
import { membersRouter } from '../routers/members'
import { categoriesRouter } from '../routers/categories'
import { potsRouter } from '../routers/pots'
import { expensesRouter } from '../routers/expenses'
import { planRouter } from '../routers/plan'
import { spendsRouter } from '../routers/spends'
import { reconcileRouter } from '../routers/reconcile'
import { incomeSourcesRouter } from '../routers/incomeSources'
import { payslipComponentsRouter } from '../routers/payslipComponents'
import { payslipsRouter } from '../routers/payslips'
import { raisesRouter } from '../routers/raises'
import { incomeRouter } from '../routers/income'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  bootstrap: bootstrapRouter,
  household: householdRouter,
  members: membersRouter,
  categories: categoriesRouter,
  pots: potsRouter,
  expenses: expensesRouter,
  plan: planRouter,
  spends: spendsRouter,
  reconcile: reconcileRouter,
  incomeSources: incomeSourcesRouter,
  payslipComponents: payslipComponentsRouter,
  payslips: payslipsRouter,
  raises: raisesRouter,
  income: incomeRouter,
})

export type AppRouter = typeof appRouter
