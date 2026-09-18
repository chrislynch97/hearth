import { useState } from "react";
import { NAV_ITEMS, NAV_SECTIONS } from "@/layout/nav-config";

// The list shown when the route doesn't pick one — i.e. on Overview, which
// navigates from the rail rather than owning a list. nav-config.test.ts fails
// if Money ever stops being declared.
const DEFAULT_SECTION = NAV_SECTIONS.find((s) => s.id === "money")!;

/** Which section's page list the sidebar is showing.
 *
 *  Deliberately two pieces of state, not one: `selectedSection` is what you're
 *  *looking at*, the route is what's *rendered*. Picking a section in the rail
 *  swaps the list without navigating, so glancing into Home from a Money page
 *  costs nothing and doesn't lose your place. When they disagree, no row in the
 *  visible list shows as active — correct, you're browsing rather than lost.
 *
 *  Not persisted: it derives from the route on load, back/forward and deep link.
 *  A manual pick lasts until the route changes, which is what hands control back. */
export const useSelectedSection = (pathname: string) => {
    const [picked, setPicked] = useState<{
        pathname: string;
        id: string;
    } | null>(null);

    const owner = NAV_ITEMS.find(
        ({ item }) => pathname === item.to || pathname.startsWith(item.to + "/")
    )?.section;
    // Overview navigates from the rail and owns no list, so landing there leaves
    // whichever list was already up rather than blanking the tier.
    const routeSection = owner && !owner.to ? owner.id : null;

    const selectedSection =
        picked?.pathname === pathname
            ? picked.id
            : (routeSection ?? DEFAULT_SECTION.id);

    const selectSection = (id: string) => setPicked({ pathname, id });

    const section =
        NAV_SECTIONS.find((s) => s.id === selectedSection) ?? DEFAULT_SECTION;

    return { section, selectedSection, selectSection };
};
