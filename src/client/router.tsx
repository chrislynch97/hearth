import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router'
import { AppLayout } from './layout/AppLayout'
import { HomePage } from './pages/HomePage'
import { PotsPage } from './pages/PotsPage'
import { CategoriesPage } from './pages/CategoriesPage'
import { OutgoingsPage } from './pages/OutgoingsPage'
import { FundingPage } from './pages/FundingPage'
import { UpcomingPage } from './pages/UpcomingPage'
import { SpendingPage } from './pages/SpendingPage'
import { CatchupPage } from './pages/CatchupPage'
import { ImportPage } from './pages/ImportPage'
import { IncomePage } from './pages/IncomePage'
import { PayslipsPage } from './pages/PayslipsPage'
import { RaisesPage } from './pages/RaisesPage'
import { AccountsPage } from './pages/AccountsPage'
import { ReportsPage } from './pages/ReportsPage'
import {
  AccountSettingsPage,
  HouseholdSettingsPage,
  SettingsLayout,
  SystemSettingsPage,
} from './pages/SettingsPage'

// Root is the app shell (nav + header + <Outlet/>). It only ever mounts once the
// auth + bootstrap gates in App.tsx have passed, so every route below is authed.
const rootRoute = createRootRoute({ component: AppLayout })

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage })
const potsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/pots', component: PotsPage })
const categoriesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/categories', component: CategoriesPage })
const outgoingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/outgoings', component: OutgoingsPage })
const fundingRoute = createRoute({ getParentRoute: () => rootRoute, path: '/funding', component: FundingPage })
const upcomingRoute = createRoute({ getParentRoute: () => rootRoute, path: '/upcoming', component: UpcomingPage })
const spendingRoute = createRoute({ getParentRoute: () => rootRoute, path: '/spending', component: SpendingPage })
const catchupRoute = createRoute({ getParentRoute: () => rootRoute, path: '/catchup', component: CatchupPage })
const importRoute = createRoute({ getParentRoute: () => rootRoute, path: '/import', component: ImportPage })
const incomeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/income', component: IncomePage })
const payslipsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/payslips', component: PayslipsPage })
const raisesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/raises', component: RaisesPage })
const accountsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/accounts', component: AccountsPage })
const reportsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/reports', component: ReportsPage })

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsLayout,
})

// `/settings` on its own → the first tab everyone can see.
const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/settings/account' })
  },
})
const accountSettingsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: 'account',
  component: AccountSettingsPage,
})
const householdSettingsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: 'household',
  component: HouseholdSettingsPage,
})
const systemSettingsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: 'system',
  component: SystemSettingsPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  potsRoute,
  categoriesRoute,
  outgoingsRoute,
  fundingRoute,
  upcomingRoute,
  spendingRoute,
  catchupRoute,
  importRoute,
  incomeRoute,
  payslipsRoute,
  raisesRoute,
  accountsRoute,
  reportsRoute,
  settingsRoute.addChildren([
    settingsIndexRoute,
    accountSettingsRoute,
    householdSettingsRoute,
    systemSettingsRoute,
  ]),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
