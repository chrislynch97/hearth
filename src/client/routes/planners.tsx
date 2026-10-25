import { Outlet, createFileRoute } from "@tanstack/react-router";

/** `/planners` lists the goals; `/planners/<slug>` is one of them. The parent
 *  only gives the nav a route to link to. */
export const Route = createFileRoute("/planners")({
    component: Outlet,
});
