import { Link, useLocation } from "@tanstack/react-router";
import type { NavItem, NavSectionConfig } from "@/layout/nav-config";
import { trpc } from "@/trpc";

export interface SidebarPageListProps {
    section: NavSectionConfig;
}

const SoonBadge = () => (
    <span className="flex h-4 shrink-0 items-center rounded-xs border border-border px-[5px] font-mono text-[9px] uppercase tracking-[0.09em] text-text-faint">
        Soon
    </span>
);

const CountBadge = ({ count }: { count: number }) => (
    // A count is a fact, not an alarm — moss, never apricot.
    <span className="tabular flex h-[18px] min-w-5 shrink-0 items-center justify-center rounded-full bg-primary-tint px-1.5 font-mono text-[11px] text-primary">
        {count}
    </span>
);

const rowClass = (active: boolean, planned: boolean) =>
    [
        "relative flex h-[30px] items-center gap-2 rounded-sm pl-3 pr-2",
        "transition-colors duration-[140ms] ease-out",
        active
            ? "bg-primary-tint font-semibold text-primary"
            : planned
              ? "text-text-faint hover:bg-hover"
              : "text-text-secondary hover:bg-hover",
    ].join(" ");

export const SidebarPageList = ({ section }: SidebarPageListProps) => {
    const { pathname } = useLocation();
    const backlogQuery = trpc.reconcile.backlog.useQuery();

    const backlogCount = backlogQuery.data?.perPot?.length ?? 0;

    const countFor = (item: NavItem) =>
        item.to === "/catchup" && backlogCount > 0 ? backlogCount : undefined;

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex h-14 items-end px-4 pb-[11px]">
                <h2 className="font-display text-h3 font-medium text-text">
                    {section.title}
                </h2>
            </div>

            <nav
                aria-label={`${section.title} pages`}
                className="flex flex-1 flex-col gap-px overflow-y-auto px-2 pb-2"
            >
                {section.groups.map((group, i) => (
                    <div key={group.title ?? `group-${i}`} role="group">
                        {group.title && (
                            <div className="px-3 pt-[11px] pb-1 font-mono text-[9px] uppercase tracking-[0.11em] text-text-faint">
                                {group.title}
                            </div>
                        )}
                        {group.items.map((item) => {
                            const active =
                                pathname === item.to ||
                                pathname.startsWith(item.to + "/");
                            const count = countFor(item);
                            return (
                                <Link
                                    key={item.to}
                                    to={item.to}
                                    aria-current={active ? "page" : undefined}
                                    className={rowClass(
                                        active,
                                        item.planned !== undefined
                                    )}
                                >
                                    {active && (
                                        <span className="absolute -left-2 top-[7px] h-4 w-[3px] rounded-r-[2px] bg-primary" />
                                    )}
                                    <span className="flex-1 truncate text-base">
                                        {item.label}
                                    </span>
                                    {item.planned && <SoonBadge />}
                                    {count !== undefined && (
                                        <CountBadge count={count} />
                                    )}
                                </Link>
                            );
                        })}
                    </div>
                ))}
            </nav>
        </div>
    );
};
