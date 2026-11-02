import { diffDays } from "@shared/dates";

/** How a deadline reads today. */
export type DueStatus = "overdue" | "today" | "soon" | "later";

/** Anything due inside a week is "soon"; past that it's just a date. */
export const SOON_DAYS = 7;

export const dueStatus = (dueDate: string, today: string): DueStatus => {
    const days = diffDays(today, dueDate);
    if (days < 0) return "overdue";
    if (days === 0) return "today";

    return days <= SOON_DAYS ? "soon" : "later";
};

/** Relative wording while it's near enough to act on, then the date itself. */
export const dueLabel = (
    dueDate: string,
    today: string,
    formatted: string
): string => {
    const days = diffDays(today, dueDate);
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    if (days === -1) return "Yesterday";
    if (days < 0) return `${Math.abs(days)} days late`;

    return days <= SOON_DAYS ? `In ${days} days` : formatted;
};
