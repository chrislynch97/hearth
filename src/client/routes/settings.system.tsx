import { createFileRoute } from "@tanstack/react-router";
import { SystemSettingsPage } from "@/pages/SettingsPage";

export const Route = createFileRoute("/settings/system")({
    component: SystemSettingsPage,
});
