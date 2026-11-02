import { CALENDAR_KINDS, type CalendarEvent, type CalendarKind } from "@shared/calendar";

export const KIND_LABEL: Record<CalendarKind, string> = {
    bill: "Bills",
    todo: "To-dos",
    savings: "Savings",
    vehicle: "Vehicles",
    maintenance: "Maintenance",
};

/** Each kind's colour, as a dot or a bar. Green is left to today and selection. */
export const KIND_COLOUR: Record<CalendarKind, string> = {
    bill: "bg-(--mc-cat-3)",
    todo: "bg-(--mc-cat-2)",
    savings: "bg-(--mc-cat-4)",
    vehicle: "bg-(--mc-cat-5)",
    maintenance: "bg-(--mc-cat-6)",
};

/** The same colour as a tint with an edge, for anything holding text. */
export const KIND_CHIP: Record<CalendarKind, string> = {
    bill: "border-(--mc-cat-3) bg-(--mc-cat-3)/15",
    todo: "border-(--mc-cat-2) bg-(--mc-cat-2)/15",
    savings: "border-(--mc-cat-4) bg-(--mc-cat-4)/15",
    vehicle: "border-(--mc-cat-5) bg-(--mc-cat-5)/15",
    maintenance: "border-(--mc-cat-6) bg-(--mc-cat-6)/15",
};

const STORAGE_KEY = "hearth.calendar.hiddenKinds";

/** The kinds someone switched off last time. Only a convenience, so a browser
 *  that won't store it just shows everything. */
export const loadHiddenKinds = (): CalendarKind[] => {
    try {
        const stored: unknown = JSON.parse(
            localStorage.getItem(STORAGE_KEY) ?? "[]"
        );

        return Array.isArray(stored)
            ? CALENDAR_KINDS.filter((kind) => stored.includes(kind))
            : [];
    } catch {
        return [];
    }
};

export const saveHiddenKinds = (kinds: CalendarKind[]): void => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(kinds));
    } catch {
        // Private windows can refuse; the toggle still works for this visit.
    }
};

/** Events on each date, kept in the order they came. */
export const eventsByDate = (
    events: CalendarEvent[]
): Map<string, CalendarEvent[]> => {
    const byDate = new Map<string, CalendarEvent[]>();
    for (const event of events) {
        byDate.set(event.date, [...(byDate.get(event.date) ?? []), event]);
    }

    return byDate;
};

const counted = (count: number, one: string, many: string): string =>
    `${count} ${count === 1 ? one : many}`;

/** The month in a line. Only bills get a total: a savings date's amount can be
 *  a target, which isn't money going out. */
export const monthSummary = (
    events: CalendarEvent[],
    format: (amount: number) => string
): string => {
    const ofKind = (kind: CalendarKind) =>
        events.filter((event) => event.kind === kind);
    const bills = ofKind("bill");
    const billTotal = bills.reduce((sum, bill) => sum + (bill.amount ?? 0), 0);
    const todos = ofKind("todo").length;
    const savings = ofKind("savings").length;
    const vehicles = ofKind("vehicle").length;
    const jobs = ofKind("maintenance").length;

    const parts = [
        ...(bills.length > 0
            ? [`${counted(bills.length, "bill", "bills")} worth ${format(billTotal)}`]
            : []),
        ...(todos > 0 ? [counted(todos, "to-do", "to-dos")] : []),
        ...(savings > 0
            ? [counted(savings, "savings date", "savings dates")]
            : []),
        ...(vehicles > 0
            ? [counted(vehicles, "vehicle date", "vehicle dates")]
            : []),
        ...(jobs > 0
            ? [counted(jobs, "maintenance job", "maintenance jobs")]
            : []),
    ];

    return parts.length > 0 ? parts.join(", ") : "Nothing dated this month.";
};

export const isWeekend = (date: string): boolean =>
    [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());

export const weekdayName = (date: string, locale: string): string =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, {
        weekday: "long",
        timeZone: "UTC",
    });
