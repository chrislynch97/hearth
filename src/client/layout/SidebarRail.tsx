import { Link } from "@tanstack/react-router";
import { House, LayoutDashboard, ListChecks, Wallet } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { HearthMark } from "@/components/HearthMark";
import {
    NAV_SECTIONS,
    sectionTarget,
    type NavSectionConfig,
} from "@/layout/nav-config";

const SECTION_ICONS: Record<
    string,
    ComponentType<{ size?: number | string; strokeWidth?: number | string }>
> = {
    overview: LayoutDashboard,
    money: Wallet,
    home: House,
    lists: ListChecks,
};

export interface SidebarRailProps {
    /** The section owning the current route, or null on Overview. */
    activeSectionId: string | undefined;
    /** Pinned to the bottom of the rail. Carries the account menu on Overview,
     *  where there's no page-list tier to hold it. */
    footer?: ReactNode;
}

const itemClass = (current: boolean) =>
    [
        "relative flex w-14 flex-col items-center gap-2 rounded-sm py-2.5",
        "transition-colors duration-[140ms] ease-out",
        current ? "bg-primary-tint" : "hover:bg-hover",
    ].join(" ");

/** Tier 1 — the 72px section rail. Every item is a link: the rail says where you
 *  are and takes you somewhere, and exactly one is ever lit. An earlier version
 *  let a rail item swap the page list without navigating, which meant two items
 *  could look active while you were on neither. */
export const SidebarRail = ({ activeSectionId, footer }: SidebarRailProps) => {
    const render = (section: NavSectionConfig) => {
        const Icon = SECTION_ICONS[section.id] ?? LayoutDashboard;
        const current = activeSectionId === section.id;

        return (
            <Link
                key={section.id}
                to={sectionTarget(section)}
                aria-current={current ? "true" : undefined}
                className={itemClass(current)}
            >
                {current && (
                    <span className="absolute -left-2 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-[2px] bg-primary" />
                )}
                <Icon
                    size={18}
                    strokeWidth={1.5}
                    className={current ? "text-primary" : "text-text-muted"}
                />
                <span
                    className={[
                        "font-mono text-[9px] uppercase tracking-[0.08em] leading-none",
                        current
                            ? "font-bold text-primary"
                            : "text-text-secondary",
                    ].join(" ")}
                >
                    {section.title}
                </span>
            </Link>
        );
    };

    return (
        <nav
            aria-label="Sections"
            className="flex w-[72px] shrink-0 flex-col items-center gap-2 border-r border-border bg-sunken pt-4 pb-3"
        >
            <Link to="/" aria-label="Hearth" className="mb-5">
                <HearthMark size={22} color="var(--color-primary)" />
            </Link>
            {NAV_SECTIONS.map(render)}
            {footer && <div className="mt-auto">{footer}</div>}
        </nav>
    );
};
