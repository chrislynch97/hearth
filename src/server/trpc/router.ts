import { router, publicProcedure } from './trpc'
import { bootstrapRouter } from '../routers/bootstrap'
import { householdRouter } from '../routers/household'
import { membersRouter } from '../routers/members'
import { categoriesRouter } from '../routers/categories'
import { potsRouter } from '../features/budget/pots.router'
import { expensesRouter } from '../features/budget/expenses.router'
import { billPricesRouter } from '../features/budget/billPrices.router'
import { setAsideRouter } from '../features/budget/setAside.router'
import { standingOrdersRouter } from '../features/budget/standingOrders.router'
import { billReviewRouter } from '../features/budget/billReview.router'
import { planRouter } from '../features/budget/plan.router'
import { spendsRouter } from '../features/spending/spends.router'
import { reconcileRouter } from '../features/spending/reconcile.router'
import { incomeSourcesRouter } from '../features/income/incomeSources.router'
import { payslipComponentsRouter } from '../features/income/payslipComponents.router'
import { payslipsRouter } from '../features/income/payslips.router'
import { raisesRouter } from '../features/income/raises.router'
import { incomeRouter } from '../features/income/income.router'
import { dashboardRouter } from '../features/insights/dashboard.router'
import { reportsRouter } from '../features/insights/reports.router'
import { dataRouter } from '../routers/data'
import { authRouter } from '../routers/auth'
import { accountsRouter } from '../features/networth/accounts.router'
import { importsRouter } from '../features/spending/imports.router'
import { usersRouter } from '../routers/users'
import { sessionsRouter } from '../routers/sessions'
import { invitationsRouter } from '../routers/invitations'
import { accessRouter } from '../routers/access'
import { auditRouter } from '../routers/audit'
import { onboardingRouter } from '../routers/onboarding'
import { feedbackRouter } from '../routers/feedback'
import { emailRouter } from '../routers/email'

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok' as const })),
  bootstrap: bootstrapRouter,
  household: householdRouter,
  members: membersRouter,
  categories: categoriesRouter,
  pots: potsRouter,
  expenses: expensesRouter,
  billPrices: billPricesRouter,
  setAside: setAsideRouter,
  standingOrders: standingOrdersRouter,
  billReview: billReviewRouter,
  plan: planRouter,
  spends: spendsRouter,
  reconcile: reconcileRouter,
  incomeSources: incomeSourcesRouter,
  payslipComponents: payslipComponentsRouter,
  payslips: payslipsRouter,
  raises: raisesRouter,
  income: incomeRouter,
  dashboard: dashboardRouter,
  reports: reportsRouter,
  data: dataRouter,
  auth: authRouter,
  accounts: accountsRouter,
  imports: importsRouter,
  users: usersRouter,
  sessions: sessionsRouter,
  invitations: invitationsRouter,
  access: accessRouter,
  audit: auditRouter,
  onboarding: onboardingRouter,
  feedback: feedbackRouter,
  email: emailRouter,
})

export type AppRouter = typeof appRouter
