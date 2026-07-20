import { createFileRoute } from "@tanstack/react-router";
import { SystemSettingsPage } from "@/pages/settings/SystemSettingsPage";

export const Route = createFileRoute("/settings/system")({
    component: SystemSettingsPage,
});
