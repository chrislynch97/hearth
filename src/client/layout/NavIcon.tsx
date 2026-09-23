import type { IconName } from "@/layout/nav-config";
import { hearthTokens } from "@/theme";
import type { ReactElement } from "react";

// Hand-rolled line icons (24×24, stroke = currentColor) so we stay dependency-free
// and match the app's existing inline-SVG style.
const NAV_ICONS: Record<IconName, ReactElement> = {
    home: <path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" />,
    plan: <path d="M4 4.5h16v15H4zM9.5 4.5v15M12.5 9.5h5M12.5 13.5h3" />,
    categories: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
    pots: (
        <path d="M4 8V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2M5 8h14l-1 11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" />
    ),
    bills: (
        <path d="M6 2h9l3 3v17l-2.2-1.3L13.6 22 11 20.7 8.4 22 6 20.7zM9 8h6M9 12h6" />
    ),
    review: (
        <path d="M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15zM16 16l5 5M7 12l2-2.2 2 1.6L13.8 8" />
    ),
    funding: (
        <path d="M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3zM5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
    ),
    upcoming: (
        <path d="M3 4.5h18a0 0 0 0 1 0 0v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 9h18M8 3v3M16 3v3" />
    ),
    spending: <path d="M2.5 5h19a0 0 0 0 1 0 0v14H2.5zM2.5 9.5h19M6 15h4" />,
    catchup: <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v3.5h-3.5" />,
    import: (
        <path d="M12 3v11m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    ),
    income: <path d="M3 6h18v13H3zM3 10h18M16 14.5h2" />,
    payslips: <path d="M6 2h8l4 4v16H6zM14 2v4h4M9 12h6M9 16h6" />,
    raises: <path d="M3 17l6-6 4 4 7-7M17 8h4v4" />,
    networth: (
        <path d="M3 9.5 12 4l9 5.5M3 21h18M5 10v8M10 10v8M14 10v8M19 10v8" />
    ),
    reports: <path d="M3 21h18M6.5 18v-6M12 18V7M17.5 18v-9" />,
    renewals: (
        <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8M20 4v4h-4M20 12a8 8 0 0 1-13.7 5.6L4 16M4 20v-4h4" />
    ),
    planners: <path d="M12 21a9 9 0 1 1 9-9M12 7v5l3 2M15.5 18.5l2 2 4-4" />,
    rooms: (
        <path d="M3 21V7l9-4 9 4v14M3 21h18M10 21v-6h4v6M7 11h.01M17 11h.01" />
    ),
    inventory: (
        <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5 12 12m0 0 9-4.5M12 12v9" />
    ),
    maintenance: (
        <path d="M14.5 3.5a4.5 4.5 0 0 0-5.9 5.9L3 15v5h5l5.6-5.6a4.5 4.5 0 0 0 5.9-5.9L17 11l-3-1-1-3z" />
    ),
    quotes: (
        <path d="M7 3h10a2 2 0 0 1 2 2v16l-3.5-2-3.5 2-3.5-2L5 21V5a2 2 0 0 1 2-2zM9 8h6M9 12h6M9 16h3" />
    ),
    diy: <path d="M3 20h18M6 20V9l6-5 6 5v11M9.5 20v-5h5v5M12 4V2" />,
    trades: (
        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0M17 3l3 2-3 2" />
    ),
    warranties: (
        <path d="M12 3l7 3v5.5c0 4.3-2.9 8.2-7 9.5-4.1-1.3-7-5.2-7-9.5V6zM9 12l2 2 4-4" />
    ),
    vehicles: <path d="M3 13.5 5 8h14l2 5.5V18h-3v-2H6v2H3zM6.5 13.5h11" />,
    todos: <path d="M4 6.5 6 8.5 9.5 5M4 17.5l2 2 3.5-3.5M13 7h7M13 17h7" />,
    chores: <path d="M12 21a9 9 0 1 1 6.4-2.6M21 13v5h-5M9 12l2 2 4-4" />,
    wishlists: (
        <path d="M12 20.5 4.5 13a4.5 4.5 0 0 1 7.5-4.8A4.5 4.5 0 0 1 19.5 13z" />
    ),
    meals: (
        <path d="M6 3v8a2 2 0 0 0 4 0V3M8 11v10M17 3c-1.5 2-2 4-2 6h4c0-2-.5-4-2-6zM17 9v12" />
    ),
};

export interface NavIconProps {
    name: IconName;
    /** Defaults to the sidebar's linen, which is invisible on a page body —
     *  pass `currentColor` when rendering one outside the navbar. */
    color?: string;
    size?: number;
}

export const NavIcon = ({
    name,
    color = hearthTokens.brand.linen,
    size = 18,
}: NavIconProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color, flexShrink: 0 }}
    >
        {NAV_ICONS[name]}
    </svg>
);
