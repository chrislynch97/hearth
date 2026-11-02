import { Outlet, createFileRoute } from "@tanstack/react-router";

/** `/vehicles` is the overview; `/vehicles/<slug>` is one vehicle. */
export const Route = createFileRoute("/vehicles")({
    component: Outlet,
});
