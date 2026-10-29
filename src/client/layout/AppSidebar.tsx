import type { ComponentProps } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from "@/components/shadcn/sidebar";
import { isCurrent, NAV_SECTIONS } from "@/layout/nav-config";
import { MobileMenuHeader } from "@/layout/MobileMenuHeader";
import { SECTION_ICONS } from "@/layout/sectionIcons";
import { SidebarFeedback } from "@/layout/SidebarFeedback";
import { SidebarSection } from "@/layout/SidebarSection";

export type AppSidebarProps = ComponentProps<typeof Sidebar>;

/** Every page in the app: Overview as a plain link, then each section as an
 *  item that folds its pages. A full-screen sheet on phones. */
export const AppSidebar = (props: AppSidebarProps) => {
    const { pathname } = useLocation();
    const { setOpenMobile, isMobile } = useSidebar();
    const backlogQuery = trpc.reconcile.backlog.useQuery();

    const backlogCount = backlogQuery.data?.perPot?.length ?? 0;
    const counts = backlogCount > 0 ? { "/catchup": backlogCount } : {};
    // Picking a page is the end of a trip through the phone menu.
    const closeMenu = () => setOpenMobile(false);

    return (
        <Sidebar {...props}>
            {isMobile && <MobileMenuHeader />}
            <SidebarContent className="hearth-ds">
                <SidebarGroup>
                    <nav aria-label="Main">
                        <SidebarMenu>
                            {NAV_SECTIONS.map((section) => {
                                const single =
                                    section.to && section.groups[0]?.items[0];
                                if (!single) {
                                    return (
                                        <SidebarSection
                                            key={section.id}
                                            section={section}
                                            pathname={pathname}
                                            counts={counts}
                                            onNavigate={closeMenu}
                                        />
                                    );
                                }

                                const Icon = SECTION_ICONS[section.id];
                                return (
                                    <SidebarMenuItem key={section.id}>
                                        <SidebarMenuButton
                                            asChild
                                            isActive={isCurrent(
                                                single,
                                                pathname
                                            )}
                                            className="text-base font-medium text-text max-md:h-10 max-md:text-md"
                                        >
                                            <Link
                                                to={single.to}
                                                onClick={closeMenu}
                                            >
                                                {Icon && <Icon />}
                                                <span>{single.label}</span>
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                );
                            })}
                        </SidebarMenu>
                    </nav>
                </SidebarGroup>
            </SidebarContent>
            <SidebarFeedback />
        </Sidebar>
    );
};
