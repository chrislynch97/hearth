import { createFileRoute } from "@tanstack/react-router";
import { AccountSettingsPage } from "@/pages/SettingsPage";

export const Route = createFileRoute("/settings/account")({
    component: AccountSettingsPage,
});
