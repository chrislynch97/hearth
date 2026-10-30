import { House, LayoutDashboard, ListChecks, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** The icon beside each top-level item in the sidebar, by section id. */
export const SECTION_ICONS: Record<string, LucideIcon> = {
    overview: LayoutDashboard,
    money: Wallet,
    home: House,
    lists: ListChecks,
};
