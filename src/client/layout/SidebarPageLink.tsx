import { Link } from "@tanstack/react-router";
import {
    SidebarMenuSubButton,
    SidebarMenuSubItem,
} from "@/components/shadcn/sidebar";
import { isCurrent, type NavItem } from "@/layout/nav-config";
import { SoonBadge } from "@/components/ui/SoonBadge";

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
                {item.planned && <SoonBadge />}
                {count !== undefined && (
                    // A count is a fact, not an alarm — moss, never apricot.
                    <span className="tabular flex h-[18px] min-w-5 shrink-0 items-center justify-center rounded-full bg-primary-tint px-1.5 text-xs font-medium text-primary">
                        {count}
                    </span>
                )}
            </Link>
        </SidebarMenuSubButton>
    </SidebarMenuSubItem>
);
