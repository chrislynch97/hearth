import { createFileRoute } from "@tanstack/react-router";
import { SpendingPage } from "@/pages/SpendingPage";

/** Lets Catch-up link straight to the spends that still need a pot. */
export interface SpendingSearch {
    status?: "needs-pot";
}

export const Route = createFileRoute("/spending")({
    validateSearch: (search: Record<string, unknown>): SpendingSearch =>
        search.status === "needs-pot" ? { status: "needs-pot" } : {},
    component: SpendingPage,
});
