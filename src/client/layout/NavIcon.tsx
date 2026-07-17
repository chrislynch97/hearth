import type { IconName } from "@/layout/nav-config";
import { hearthTokens } from "@/theme";
import type { ReactElement } from "react";

// Hand-rolled line icons (24×24, stroke = currentColor) so we stay dependency-free
// and match the app's existing inline-SVG style.
const NAV_ICONS: Record<IconName, ReactElement> = {
    home: <path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" />,
    categories: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
    pots: (
        <path d="M4 8V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2M5 8h14l-1 11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" />
    ),
    bills: (
        <path d="M6 2h9l3 3v17l-2.2-1.3L13.6 22 11 20.7 8.4 22 6 20.7zM9 8h6M9 12h6" />
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
    // Sliders, not a gear: gear teeth blur into a ring at 18px, whereas the
    // handles-on-rails read cleanly and don't collide with the sun theme toggle.
    settings: <path d="M4 6h16M4 12h16M4 18h16M9 4v4M15 10v4M7 16v4" />,
};

export interface NavIconProps {
    name: IconName;
}

export const NavIcon = ({ name }: { name: IconName }) => (
    <svg
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: hearthTokens.brand.linen, flexShrink: 0 }}
    >
        {NAV_ICONS[name]}
    </svg>
);
