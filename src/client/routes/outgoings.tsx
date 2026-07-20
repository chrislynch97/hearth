import { createFileRoute } from "@tanstack/react-router";
import { OutgoingsPage } from "@/pages/OutgoingsPage";

export const Route = createFileRoute("/outgoings")({
    component: OutgoingsPage,
});
