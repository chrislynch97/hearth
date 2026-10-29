import { ChevronRight } from "lucide-react";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/shadcn/collapsible";
import {
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
} from "@/components/shadcn/sidebar";
import {
    opensByDefault,
    owningSection,
    type AppRoutePath,
    type NavGroupConfig,
    type NavSectionConfig,
} from "@/layout/nav-config";
import { SECTION_ICONS } from "@/layout/sectionIcons";
import { SidebarPageLink } from "@/layout/SidebarPageLink";
import { useSectionOpen } from "@/layout/useSectionOpen";

export interface SidebarSectionProps {
    section: NavSectionConfig;
    pathname: string;
    counts: Partial<Record<AppRoutePath, number>>;
    onNavigate: () => void;
}

/** A group's items minus the retired ones — pages folded into another page
 *  keep their route and their place in the go-to palette, but leave the list. */
const visible = (group: NavGroupConfig) =>
    group.items.filter((item) => !item.hidden);

/** A top-level item that folds its pages away. The section you're in opens by
 *  itself until you fold it; then it turns green so you can still see where
 *  you are. */
export const SidebarSection = ({
    section,
    pathname,
    counts,
    onNavigate,
}: SidebarSectionProps) => {
    const current = owningSection(pathname)?.id === section.id;
    const [open, toggle] = useSectionOpen(
        section.id,
        current || opensByDefault(section)
    );

    const Icon = SECTION_ICONS[section.id];

    return (
        <Collapsible
            asChild
            open={open}
            onOpenChange={toggle}
            className="group/collapsible"
        >
            <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                        className={[
                            "text-base font-medium max-md:h-10 max-md:text-md",
                            current && !open ? "text-primary" : "text-text",
                        ].join(" ")}
                    >
                        {Icon && <Icon />}
                        <span>{section.title}</span>
                        <ChevronRight className="ml-auto text-text-faint transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <SidebarMenuSub className="mr-0 pr-0">
                        {section.groups.flatMap((group) => {
                            const items = visible(group);
                            if (items.length === 0) return [];

                            const links = items.map((item) => (
                                <SidebarPageLink
                                    key={item.to}
                                    item={item}
                                    pathname={pathname}
                                    count={counts[item.to]}
                                    onNavigate={onNavigate}
                                />
                            ));
                            return group.title
                                ? [
                                      <li
                                          key={`caption-${group.title}`}
                                          className="px-2 pt-2 pb-0.5 text-xs font-medium text-text-faint first:pt-1"
                                      >
                                          {group.title}
                                      </li>,
                                      ...links,
                                  ]
                                : links;
                        })}
                    </SidebarMenuSub>
                </CollapsibleContent>
            </SidebarMenuItem>
        </Collapsible>
    );
};
