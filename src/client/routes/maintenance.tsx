import { createFileRoute } from "@tanstack/react-router";
import { MaintenancePage } from "@/pages/MaintenancePage";

export const Route = createFileRoute("/maintenance")({
    component: MaintenancePage,
});
