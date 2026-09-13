import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonPage } from "@/pages/ComingSoonPage";

export const Route = createFileRoute("/trades")({
    component: ComingSoonPage,
});
