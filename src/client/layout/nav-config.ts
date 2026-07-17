export type IconName =
    | "home"
    | "categories"
    | "pots"
    | "bills"
    | "funding"
    | "upcoming"
    | "spending"
    | "catchup"
    | "import"
    | "income"
    | "payslips"
    | "raises"
    | "networth"
    | "reports";

export interface NavSectionConfig {
    title: string | null;
    items: NavItem[];
}

interface NavItem {
    to: string;
    label: string;
    icon: IconName;
}

export const NAV_SECTIONS: NavSectionConfig[] = [
    { title: null, items: [{ to: "/", label: "Overview", icon: "home" }] },
    {
        title: "Plan",
        items: [
            { to: "/categories", label: "Categories", icon: "categories" },
            { to: "/pots", label: "Pots", icon: "pots" },
            { to: "/outgoings", label: "Bills", icon: "bills" },
            { to: "/funding", label: "Funding", icon: "funding" },
            { to: "/upcoming", label: "Upcoming", icon: "upcoming" },
        ],
    },
    {
        title: "Track",
        items: [
            { to: "/spending", label: "Spending", icon: "spending" },
            { to: "/catchup", label: "Catch-up", icon: "catchup" },
            { to: "/import", label: "Import", icon: "import" },
        ],
    },
    {
        title: "People & income",
        items: [
            { to: "/income", label: "Income", icon: "income" },
            { to: "/payslips", label: "Payslips", icon: "payslips" },
            { to: "/raises", label: "Raises", icon: "raises" },
        ],
    },
    {
        title: "Wealth",
        items: [{ to: "/accounts", label: "Net worth", icon: "networth" }],
    },
    {
        title: null,
        items: [{ to: "/reports", label: "Reports", icon: "reports" }],
    },
];

export const GO_TO: Record<string, string> = {
    d: "/",
    p: "/pots",
    o: "/outgoings",
    f: "/funding",
    u: "/upcoming",
    s: "/spending",
    c: "/catchup",
    i: "/income",
    w: "/accounts",
    r: "/reports",
};
