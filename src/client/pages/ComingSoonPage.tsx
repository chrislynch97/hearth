import { useLocation } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/shadcn/card";
import { PageHeader } from "@/components/ui/PageHeader";
import { SoonBadge } from "@/components/ui/SoonBadge";
import { NavIcon } from "@/layout/NavIcon";
import { NAV_ITEMS } from "@/layout/nav-config";

/** The page behind every nav item still marked `planned`. There's one of these
 *  rather than a stub file per domain: it reads the same nav config the sidebar
 *  does, so a planned page can never describe itself differently from the item
 *  that links to it. */
export const ComingSoonPage = () => {
    const { pathname } = useLocation();

    const entry = NAV_ITEMS.find(({ item }) => item.to === pathname);

    if (!entry?.item.planned) {
        return (
            <div className="hearth-ds mx-auto max-w-[1000px]">
                <PageHeader
                    title="Not built yet"
                    description="This page is planned but has nothing to show."
                />
            </div>
        );
    }

    const { item, section, group } = entry;
    const trail = [section.title, group.title].filter(Boolean).join(" → ");

    return (
        <div className="hearth-ds mx-auto flex max-w-[1000px] flex-col gap-5">
            <PageHeader
                title={
                    <span className="flex items-center gap-2.5">
                        {item.label}
                        <SoonBadge />
                    </span>
                }
                description={trail}
            />
            <Card>
                <CardContent className="flex items-start gap-3 text-md text-text">
                    <NavIcon name={item.icon} color="currentColor" size={22} />
                    <p>{item.planned}</p>
                </CardContent>
            </Card>
            <p className="text-base text-text-muted">
                Nothing here works yet — the page exists so the idea has
                somewhere to live until it does.
            </p>
        </div>
    );
};
