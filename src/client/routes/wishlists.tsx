import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonPage } from "@/pages/ComingSoonPage";

export const Route = createFileRoute("/wishlists")({
    component: ComingSoonPage,
});
