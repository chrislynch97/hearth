import { router, publicProcedure } from './trpc'
import { bootstrapRouter } from '../features/household/bootstrap.router'
import { householdRouter } from '../features/household/household.router'
import { membersRouter } from '../features/household/members.router'
import { categoriesRouter } from '../features/household/categories.router'
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
import { dataRouter } from '../features/admin/data.router'
import { authRouter } from '../features/access/auth.router'
import { accountsRouter } from '../features/networth/accounts.router'
import { importsRouter } from '../features/spending/imports.router'
import { usersRouter } from '../features/access/users.router'
import { sessionsRouter } from '../features/access/sessions.router'
import { invitationsRouter } from '../features/access/invitations.router'
import { accessRouter } from '../features/access/access.router'
import { auditRouter } from '../features/admin/audit.router'
import { onboardingRouter } from '../features/household/onboarding.router'
import { feedbackRouter } from '../features/admin/feedback.router'
import { emailRouter } from '../features/access/email.router'

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
