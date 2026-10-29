import { Link } from "@tanstack/react-router";
import {
    SidebarMenuSubButton,
    SidebarMenuSubItem,
} from "@/components/shadcn/sidebar";
import { isCurrent, type NavItem } from "@/layout/nav-config";

export interface SidebarPageLinkProps {
    item: NavItem;
    pathname: string;
    count?: number;
    onNavigate: () => void;
}

/** One page under a section. Taller below `md`, where the sidebar only appears
 *  as the phone menu and a 28px row is too small for a thumb. */
export const SidebarPageLink = ({
    item,
    pathname,
    count,
    onNavigate,
}: SidebarPageLinkProps) => (
    <SidebarMenuSubItem>
        <SidebarMenuSubButton
            asChild
            isActive={isCurrent(item, pathname)}
            className={[
                "text-base max-md:h-10 max-md:text-md",
                item.planned ? "text-text-faint" : "text-sidebar-foreground",
            ].join(" ")}
        >
            <Link to={item.to} onClick={onNavigate}>
                <span className="flex-1 truncate">{item.label}</span>
                {item.planned && (
                    <span className="flex h-4 shrink-0 items-center rounded-xs border border-border px-[5px] font-mono text-[9px] uppercase tracking-[0.09em] text-text-faint">
                        Soon
                    </span>
                )}
                {count !== undefined && (
                    // A count is a fact, not an alarm — moss, never apricot.
                    <span className="tabular flex h-[18px] min-w-5 shrink-0 items-center justify-center rounded-full bg-primary-tint px-1.5 font-mono text-[11px] text-primary">
                        {count}
                    </span>
                )}
            </Link>
        </SidebarMenuSubButton>
    </SidebarMenuSubItem>
);
