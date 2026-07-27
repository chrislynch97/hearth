import { router, publicProcedure } from './trpc'
import { bootstrapRouter } from '../routers/bootstrap'
import { householdRouter } from '../routers/household'
import { membersRouter } from '../routers/members'
import { categoriesRouter } from '../routers/categories'
import { potsRouter } from '../routers/pots'
import { expensesRouter } from '../routers/expenses'
import { billPricesRouter } from '../routers/billPrices'
import { setAsideRouter } from '../routers/setAside'
import { standingOrdersRouter } from '../routers/standingOrders'
import { billReviewRouter } from '../routers/billReview'
import { planRouter } from '../routers/plan'
import { spendsRouter } from '../routers/spends'
import { reconcileRouter } from '../routers/reconcile'
import { incomeSourcesRouter } from '../routers/incomeSources'
import { payslipComponentsRouter } from '../routers/payslipComponents'
import { payslipsRouter } from '../routers/payslips'
import { raisesRouter } from '../routers/raises'
import { incomeRouter } from '../routers/income'
import { dashboardRouter } from '../routers/dashboard'
import { reportsRouter } from '../routers/reports'
import { dataRouter } from '../routers/data'
import { authRouter } from '../routers/auth'
import { accountsRouter } from '../routers/accounts'
import { importsRouter } from '../routers/imports'
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
