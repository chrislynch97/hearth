import { useState } from "react";
import { NAV_ITEMS } from "@/layout/nav-config";

const STORAGE_KEY = "hearth.nav.openSection";

// One section open at a time. Money is the default because it's the daily path:
// from Overview, every page anyone actually opens is one click away. The cost is
// that Money is taller than the sidebar, so Home and Lists start below the fold
// — collapsing Money once is remembered, which is the cheaper fix of the two.
const DEFAULT_SECTION = "money";

const read = (): string | null => {
    // Private windows and blocked site data throw on access rather than
    // returning null, so this can't be a bare localStorage.getItem.
    try {
        return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_SECTION;
    } catch {
        return DEFAULT_SECTION;
    }
};

const write = (id: string | null) => {
    try {
        if (id === null) localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, id);
    } catch {
        // A remembered sidebar isn't worth failing a render over.
    }
};

/** Which nav section is expanded. The current route decides by default, so
 *  navigating into a collapsed section opens it; a manual toggle overrides that
 *  until you navigate somewhere else, and is remembered per browser for the
 *  routes (Overview) that don't belong to a section at all.
 *
 *  Derived during render rather than synced in an effect — the route is already
 *  the source of truth, and mirroring it into state means rendering the wrong
 *  section first and correcting it. */
export const useOpenNavSection = (pathname: string) => {
    const [remembered, setRemembered] = useState(read);
    const [manual, setManual] = useState<{
        pathname: string;
        id: string | null;
    } | null>(null);

    const owner = NAV_ITEMS.find(
        ({ item }) => pathname === item.to || pathname.startsWith(item.to + "/")
    )?.section;
    // A title-less section (Overview) has no header to expand.
    const routeSection = owner?.title ? owner.id : null;

    const openSection =
        manual?.pathname === pathname
            ? manual.id
            : (routeSection ?? remembered);

    const toggleSection = (id: string) => {
        const next = openSection === id ? null : id;
        setManual({ pathname, id: next });
        setRemembered(next);
        write(next);
    };

    return { openSection, toggleSection };
};
