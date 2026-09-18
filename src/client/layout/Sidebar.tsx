import { useLocation } from "@tanstack/react-router";
import { NAV_ITEMS } from "@/layout/nav-config";
import { SidebarPageList } from "@/layout/SidebarPageList";
import { SidebarRail } from "@/layout/SidebarRail";
import { UserMenu } from "@/layout/UserMenu";
import { useSelectedSection } from "@/layout/useSelectedSection";

/** The two-tier sidebar: a 72px section rail on Canvas, a 212px page list on
 *  Paper. Nothing collapses, so nothing is more than two clicks away and there's
 *  no open/closed state to persist. */
export const Sidebar = () => {
    const { pathname } = useLocation();
    const { section, selectedSection, selectSection } =
        useSelectedSection(pathname);

    const activeSectionId = NAV_ITEMS.find(
        ({ item }) => pathname === item.to || pathname.startsWith(item.to + "/")
    )?.section.id;

    return (
        <div className="hearth-ds flex h-full">
            <SidebarRail
                selectedSection={selectedSection}
                activeSectionId={activeSectionId}
                onSelect={selectSection}
            />
            <div className="flex h-full w-[212px] shrink-0 flex-col border-r border-border bg-surface">
                <SidebarPageList
                    section={section}
                    showsActiveRoute={activeSectionId === section.id}
                />
                <div className="shrink-0 border-t border-border p-2">
                    <UserMenu />
                </div>
            </div>
        </div>
    );
};
