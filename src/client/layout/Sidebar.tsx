import { useLocation } from "@tanstack/react-router";
import { owningSection, type NavSectionConfig } from "@/layout/nav-config";
import { SidebarPageList } from "@/layout/SidebarPageList";
import { SidebarRail } from "@/layout/SidebarRail";
import { UserMenu } from "@/layout/UserMenu";

export interface SidebarProps {
    /** The section whose page list should show — null on Overview, which is a
     *  single page and has no list. The rail still lights up for it. */
    section: NavSectionConfig | null;
}

/** The two-tier sidebar: a 72px section rail on Canvas, a 212px page list on
 *  Paper. Both follow the route and nothing else. */
export const Sidebar = ({ section }: SidebarProps) => {
    const { pathname } = useLocation();

    return (
        <div className="hearth-ds flex h-full">
            <SidebarRail
                activeSectionId={owningSection(pathname)?.id}
                footer={section ? undefined : <UserMenu compact />}
            />
            {section && (
                <div className="flex h-full w-[212px] shrink-0 flex-col border-r border-border bg-surface">
                    <SidebarPageList section={section} />
                    <div className="shrink-0 border-t border-border p-2">
                        <UserMenu />
                    </div>
                </div>
            )}
        </div>
    );
};
