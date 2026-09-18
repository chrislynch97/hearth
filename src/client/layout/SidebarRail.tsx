import { Link } from "@tanstack/react-router";
import { House, LayoutDashboard, ListChecks, Wallet } from "lucide-react";
import type { ComponentType } from "react";
import { HearthMark } from "@/components/HearthMark";
import { NAV_SECTIONS, type NavSectionConfig } from "@/layout/nav-config";

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
    selectedSection: string;
    activeSectionId: string | undefined;
    onSelect: (id: string) => void;
}

const itemClass = (selected: boolean) =>
    [
        "relative flex w-14 flex-col items-center gap-1.5 rounded-sm pt-[9px] pb-[7px]",
        "transition-colors duration-[140ms] ease-out",
        selected ? "bg-primary-tint" : "hover:bg-hover",
    ].join(" ");

const labelClass = (selected: boolean) =>
    [
        "font-mono text-[8.5px] uppercase tracking-[0.08em] leading-none",
        selected ? "font-bold text-primary" : "text-text-secondary",
    ].join(" ");

const Marker = () => (
    <span className="absolute -left-2 top-[11px] h-[22px] w-[3px] rounded-r-[2px] bg-primary" />
);

/** Tier 1 — the 72px section rail. Sections swap the page list beside them;
 *  Overview is the exception and navigates, because one page doesn't need a
 *  list of its own. */
export const SidebarRail = ({
    selectedSection,
    activeSectionId,
    onSelect,
}: SidebarRailProps) => {
    const render = (section: NavSectionConfig) => {
        const Icon = SECTION_ICONS[section.id] ?? LayoutDashboard;
        // A navigating rail item shows as selected when you're actually on it;
        // a list-swapping one shows as selected when its list is up.
        const selected = section.to
            ? activeSectionId === section.id
            : selectedSection === section.id;
        const body = (
            <>
                {selected && <Marker />}
                <Icon
                    size={16}
                    strokeWidth={1.5}
                    className={selected ? "text-primary" : "text-text-muted"}
                />
                <span className={labelClass(selected)}>{section.title}</span>
            </>
        );

        return section.to ? (
            <Link
                key={section.id}
                to={section.to}
                className={itemClass(selected)}
            >
                {body}
            </Link>
        ) : (
            <button
                key={section.id}
                type="button"
                onClick={() => onSelect(section.id)}
                aria-pressed={selected}
                className={itemClass(selected)}
            >
                {body}
            </button>
        );
    };

    return (
        <nav
            aria-label="Sections"
            className="flex w-[72px] shrink-0 flex-col items-center gap-1 border-r border-border bg-sunken pt-3.5 pb-3"
        >
            <Link to="/" aria-label="Hearth" className="mb-4">
                <HearthMark size={22} color="var(--color-primary)" />
            </Link>
            {NAV_SECTIONS.map(render)}
        </nav>
    );
};
