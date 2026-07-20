import { createFileRoute, redirect } from "@tanstack/react-router";

// `/settings` on its own → the first tab everyone can see.
export const Route = createFileRoute("/settings/")({
    beforeLoad: () => {
        throw redirect({ to: "/settings/account" });
    },
});
