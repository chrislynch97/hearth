export type IconName =
    | "home"
    | "categories"
    | "pots"
    | "bills"
    | "review"
    | "renewals"
    | "funding"
    | "upcoming"
    | "spending"
    | "catchup"
    | "import"
    | "income"
    | "payslips"
    | "raises"
    | "networth"
    | "planners"
    | "reports"
    | "rooms"
    | "inventory"
    | "maintenance"
    | "diy"
    | "trades"
    | "warranties"
    | "vehicles"
    | "todos"
    | "chores"
    | "wishlists"
    | "meals";

// The app's route paths, kept in step with the route tree in `router.tsx`. Typed
// as a literal union (rather than derived from the router) so nav config stays
// assignable to TanStack's typed `to`, without a circular dependency back
// through the router that these components help build.
export type AppRoutePath =
    | "/"
    | "/categories"
    | "/pots"
    | "/outgoings"
    | "/review"
    | "/renewals"
    | "/funding"
    | "/upcoming"
    | "/spending"
    | "/catchup"
    | "/import"
    | "/income"
    | "/payslips"
    | "/raises"
    | "/accounts"
    | "/planners"
    | "/reports"
    | "/rooms"
    | "/inventory"
    | "/maintenance"
    | "/diy"
    | "/trades"
    | "/warranties"
    | "/vehicles"
    | "/todos"
    | "/chores"
    | "/wishlists"
    | "/meals";

export interface NavItem {
    to: AppRoutePath;
    label: string;
    icon: IconName;
    /** Set on a domain that isn't built yet. One field does three jobs: the nav
     *  item dims and gains a "Soon" badge, and its route renders this line on a
     *  ComingSoon page — so the three can't drift apart. Promoting a domain is
     *  deleting this property. */
    planned?: string;
}

export interface NavGroupConfig {
    title: string | null;
    items: NavItem[];
}

export interface NavSectionConfig {
    id: string;
    /** null for the section-less block at the top of the sidebar, which renders
     *  its items bare — no header, no collapse. */
    title: string | null;
    groups: NavGroupConfig[];
}

export const NAV_SECTIONS: NavSectionConfig[] = [
    {
        id: "overview",
        title: null,
        groups: [
            {
                title: null,
                items: [{ to: "/", label: "Overview", icon: "home" }],
            },
        ],
    },
    {
        id: "money",
        title: "Money",
        groups: [
            {
                title: "Plan",
                items: [
                    {
                        to: "/categories",
                        label: "Categories",
                        icon: "categories",
                    },
                    { to: "/pots", label: "Pots", icon: "pots" },
                    { to: "/outgoings", label: "Bills", icon: "bills" },
                    { to: "/review", label: "Bill review", icon: "review" },
                    {
                        to: "/renewals",
                        label: "Renewals",
                        icon: "renewals",
                        planned:
                            "Insurance, broadband, mobile and energy contracts with their renewal dates and current price, so nothing auto-renews at the loyalty penalty.",
                    },
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
                items: [
                    { to: "/accounts", label: "Net worth", icon: "networth" },
                    {
                        to: "/planners",
                        label: "Savings planners",
                        icon: "planners",
                        planned:
                            "A goal — a wedding, a new kitchen — broken into line items with their own costs and deadlines, funded from pots and ticked off as they're paid for.",
                    },
                ],
            },
            {
                title: null,
                items: [{ to: "/reports", label: "Reports", icon: "reports" }],
            },
        ],
    },
    {
        id: "home",
        title: "Home",
        groups: [
            {
                title: "Property",
                items: [
                    {
                        to: "/rooms",
                        label: "Rooms",
                        icon: "rooms",
                        planned:
                            "Room dimensions, layouts and blueprints, so buying furniture stops involving a tape measure and a guess.",
                    },
                    {
                        to: "/inventory",
                        label: "Inventory",
                        icon: "inventory",
                        planned:
                            "What's in the house and what it's worth — the record you want to already have after a fire or a burglary.",
                    },
                ],
            },
            {
                title: "Upkeep",
                items: [
                    {
                        to: "/maintenance",
                        label: "Maintenance",
                        icon: "maintenance",
                        planned:
                            "Boiler services, gutters, smoke alarms and filters on a recurring schedule, so the jobs that only come round once a year still happen.",
                    },
                    {
                        to: "/diy",
                        label: "DIY log",
                        icon: "diy",
                        planned:
                            "What was done to a room, and the details you need two years later: paint colour, supplier, product code.",
                    },
                    {
                        to: "/trades",
                        label: "Trades & suppliers",
                        icon: "trades",
                        planned:
                            "Who we used, what they charged, and whether we'd have them back.",
                    },
                ],
            },
            {
                title: "Records",
                items: [
                    {
                        to: "/warranties",
                        label: "Warranties & documents",
                        icon: "warranties",
                        planned:
                            "Receipts, warranty expiry dates, manuals and serial numbers — the things you always need about an appliance and never have to hand.",
                    },
                    {
                        to: "/vehicles",
                        label: "Vehicles",
                        icon: "vehicles",
                        planned:
                            "MOT, tax, insurance and service dates, on the same recurring schedule as the rest of the house.",
                    },
                ],
            },
        ],
    },
    {
        id: "lists",
        title: "Lists",
        groups: [
            {
                title: null,
                items: [
                    {
                        to: "/todos",
                        label: "To-dos",
                        icon: "todos",
                        planned:
                            "Tasks with a priority, an assignee, a due date and a done state. The plainest thing in the app.",
                    },
                    {
                        to: "/chores",
                        label: "Chores rota",
                        icon: "chores",
                        planned:
                            "Recurring tasks that rotate between the people in the household, rather than settling on whoever notices first.",
                    },
                    {
                        to: "/wishlists",
                        label: "Wish lists",
                        icon: "wishlists",
                        planned:
                            "Things we want to buy — link, price, who wants it, how badly.",
                    },
                    {
                        to: "/meals",
                        label: "Meal planning",
                        icon: "meals",
                        planned:
                            "A week of meals that knows what it needs, feeding the shopping list at one end and the grocery budget at the other.",
                    },
                ],
            },
        ],
    },
];

export interface FlatNavItem {
    item: NavItem;
    section: NavSectionConfig;
    group: NavGroupConfig;
}

/** Every nav item, flattened, carrying the section and group it came from — for
 *  the palette's trail and for a ComingSoon page looking up its own blurb. */
export const NAV_ITEMS: FlatNavItem[] = NAV_SECTIONS.flatMap((section) =>
    section.groups.flatMap((group) =>
        group.items.map((item) => ({ item, section, group }))
    )
);
