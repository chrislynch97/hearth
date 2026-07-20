import { createRootRoute } from "@tanstack/react-router";
import { AppLayout } from "@/layout/AppLayout";

// The app shell (nav + header + <Outlet/>). It only ever mounts once the auth +
// bootstrap gates in App.tsx have passed, so every route below is authed.
export const Route = createRootRoute({ component: AppLayout });
