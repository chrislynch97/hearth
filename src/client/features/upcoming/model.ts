import type { inferRouterOutputs } from "@trpc/server";
import { addDays, addMonths } from "@shared/dates";
import type { AppRouter } from "../../../server/trpc/router";

export type Payment =
    inferRouterOutputs<AppRouter>["plan"]["upcoming"]["payments"][number];

/** `2026-10-30` → `2026-10`. */
export const monthOf = (date: string): string => date.slice(0, 7);

export const shiftMonth = (month: string, delta: number): string =>
    monthOf(addMonths(`${month}-01`, delta));

export const totalOf = (payments: Payment[]): number =>
    payments.reduce((sum, p) => sum + p.amount, 0);

export const inMonth = (payments: Payment[], month: string): Payment[] =>
    payments.filter((p) => monthOf(p.date) === month);

/** Payments from today through the next `days` days. */
export const dueWithin = (
    payments: Payment[],
    today: string,
    days: number
): Payment[] => {
    const last = addDays(today, days - 1);
    return payments.filter((p) => p.date <= last);
};

/** A month's cells for a calendar grid: blanks up to its first weekday, then
 *  every date. `firstDay` is 0 for a Sunday start, 1 for Monday. */
export const monthCells = (
    month: string,
    firstDay: 0 | 1
): Array<string | null> => {
    const [year = 0, monthNumber = 1] = month.split("-").map(Number);
    const first = new Date(Date.UTC(year, monthNumber - 1, 1));
    const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const blanks = (first.getUTCDay() - firstDay + 7) % 7;
    return [
        ...new Array<null>(blanks).fill(null),
        ...Array.from(
            { length: days },
            (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`
        ),
    ];
};

/** Short weekday names in calendar order. */
export const weekdayNames = (firstDay: 0 | 1, locale: string): string[] =>
    Array.from({ length: 7 }, (_, i) =>
        // 2023-01-01 was a Sunday, so the offsets land on known weekdays.
        new Date(Date.UTC(2023, 0, 1 + firstDay + i)).toLocaleDateString(
            locale,
            { weekday: "short", timeZone: "UTC" }
        )
    );

export const monthName = (month: string, locale: string): string =>
    new Date(`${month}-01T00:00:00Z`).toLocaleDateString(locale, {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    });

export const dayName = (date: string, locale: string): string =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
    });

export const dueLabel = (daysUntil: number): string => {
    if (daysUntil === 0) return "Today";
    return daysUntil === 1 ? "Tomorrow" : `In ${daysUntil} days`;
};
