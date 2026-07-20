import {
    createRootRoute,
    createRoute,
    createRouter,
    lazyRouteComponent,
    redirect,
} from "@tanstack/react-router";
import { AppLayout } from "./layout/AppLayout";

// Root is the app shell (nav + header + <Outlet/>). It only ever mounts once the
// auth + bootstrap gates in App.tsx have passed, so every route below is authed.
const rootRoute = createRootRoute({ component: AppLayout });

// Every page is a lazy chunk (#141): the initial bundle carries only the shell,
// and heavy deps like recharts load with the first chart page that needs them.
const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: lazyRouteComponent(() => import("./pages/HomePage"), "HomePage"),
});
const potsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/pots",
    component: lazyRouteComponent(() => import("./pages/PotsPage"), "PotsPage"),
});
const categoriesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/categories",
    component: lazyRouteComponent(
        () => import("./pages/CategoriesPage"),
        "CategoriesPage"
    ),
});
const outgoingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/outgoings",
    component: lazyRouteComponent(
        () => import("./pages/OutgoingsPage"),
        "OutgoingsPage"
    ),
});
const reviewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/review",
    component: lazyRouteComponent(
        () => import("./pages/BillReviewPage"),
        "BillReviewPage"
    ),
});
const fundingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/funding",
    component: lazyRouteComponent(
        () => import("./pages/FundingPage"),
        "FundingPage"
    ),
});
const upcomingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/upcoming",
    component: lazyRouteComponent(
        () => import("./pages/UpcomingPage"),
        "UpcomingPage"
    ),
});
const spendingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/spending",
    component: lazyRouteComponent(
        () => import("./pages/SpendingPage"),
        "SpendingPage"
    ),
});
const catchupRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/catchup",
    component: lazyRouteComponent(
        () => import("./pages/CatchupPage"),
        "CatchupPage"
    ),
});
const importRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/import",
    component: lazyRouteComponent(
        () => import("./pages/ImportPage"),
        "ImportPage"
    ),
});
const incomeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/income",
    component: lazyRouteComponent(
        () => import("./pages/IncomePage"),
        "IncomePage"
    ),
});
const payslipsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/payslips",
    component: lazyRouteComponent(
        () => import("./pages/PayslipsPage"),
        "PayslipsPage"
    ),
});
const raisesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/raises",
    component: lazyRouteComponent(
        () => import("./pages/RaisesPage"),
        "RaisesPage"
    ),
});
const accountsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/accounts",
    component: lazyRouteComponent(
        () => import("./pages/AccountsPage"),
        "AccountsPage"
    ),
});
const reportsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/reports",
    component: lazyRouteComponent(
        () => import("./pages/ReportsPage"),
        "ReportsPage"
    ),
});

const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings",
    component: lazyRouteComponent(
        () => import("./pages/SettingsPage"),
        "SettingsLayout"
    ),
});

// `/settings` on its own → the first tab everyone can see.
const settingsIndexRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: "/",
    beforeLoad: () => {
        throw redirect({ to: "/settings/account" });
    },
});
const accountSettingsRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: "account",
    component: lazyRouteComponent(
        () => import("./pages/SettingsPage"),
        "AccountSettingsPage"
    ),
});
const householdSettingsRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: "household",
    component: lazyRouteComponent(
        () => import("./pages/SettingsPage"),
        "HouseholdSettingsPage"
    ),
});
const systemSettingsRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: "system",
    component: lazyRouteComponent(
        () => import("./pages/SettingsPage"),
        "SystemSettingsPage"
    ),
});

const routeTree = rootRoute.addChildren([
    indexRoute,
    potsRoute,
    categoriesRoute,
    outgoingsRoute,
    reviewRoute,
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
]);

// Preload a route's chunk on link hover/touchstart so the click itself is instant.
export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}
