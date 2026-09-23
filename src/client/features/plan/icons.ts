/** The sidebar's own glyphs, so a pot or a bill looks the same wherever it
 *  turns up — a chip under the Plan title, a column header on a pot card. */
export const PLAN_ICON_PATHS = {
    categories: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
    pots: "M4 8V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2M5 8h14l-1 11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z",
    bills: "M6 2h9l3 3v17l-2.2-1.3L13.6 22 11 20.7 8.4 22 6 20.7zM9 8h6M9 12h6",
    setAsides:
        "M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3zM5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3",
    review: "M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15zM16 16l5 5M7 12l2-2.2 2 1.6L13.8 8",
} as const;

export type PlanIconName = keyof typeof PLAN_ICON_PATHS;
