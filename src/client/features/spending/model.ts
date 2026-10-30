import type { inferRouterOutputs } from "@trpc/server";
import { diffDays } from "@shared/dates";
import { toMinor } from "@shared/money";
import type { AppRouter } from "../../../server/trpc/router";

type Outputs = inferRouterOutputs<AppRouter>;

export type Spend = Outputs["spends"]["list"][number];
export type RecentBill = Outputs["plan"]["recentlyDue"][number];
export type Member = Outputs["members"]["list"][number];
export type Pot = Outputs["pots"]["list"][number];
export type Category = Outputs["categories"]["list"][number];

export type StatusFilter = "all" | "needs-pot" | "pending" | "reconciled";

/** What the register asks the server for, given the status picked. */
export const statusInput = (
    status: StatusFilter
): { needsPot?: boolean; reconciled?: boolean } => {
    if (status === "needs-pot") return { needsPot: true };
    if (status === "all") return {};
    return { reconciled: status === "reconciled" };
};

export interface SpendDay {
    date: string;
    total: number;
    spends: Spend[];
}

/** Rows arrive newest first, so a day is a run of the same date. */
export const groupByDay = (spends: Spend[]): SpendDay[] => {
    const days: SpendDay[] = [];
    for (const spend of spends) {
        const day = days.at(-1);
        if (day?.date === spend.date) {
            day.total += spend.amount;
            day.spends.push(spend);
        } else {
            days.push({
                date: spend.date,
                total: spend.amount,
                spends: [spend],
            });
        }
    }
    return days;
};

/** "Today", "Yesterday" or "Wed 28 Oct", with the year only once it's not this
 *  one: a heading to scan down, so it stays short. */
export const dayHeading = (
    date: string,
    today: string,
    locale: string
): string => {
    const age = diffDays(date, today);
    if (age === 0) return "Today";
    if (age === 1) return "Yesterday";
    return new Date(`${date}T00:00:00`).toLocaleDateString(locale, {
        weekday: "short",
        day: "numeric",
        month: "short",
        ...(date.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
    });
};

export interface SpendFunding {
    potId: string | null;
    categoryId: string | null;
    settledAtSource: boolean;
}

export interface SpendDraft {
    amount: string;
    refund: boolean;
    description: string;
    date: string;
    ownerId: string | null;
    funding: SpendFunding;
}

export const draftError = (draft: SpendDraft): string | null => {
    if (!(Number(draft.amount) > 0)) return "Enter an amount above zero.";
    if (!draft.description.trim()) return "Enter a description.";
    if (!draft.ownerId) return "Choose who paid.";
    return null;
};

/** Signed as Hearth stores it: spending positive, refunds negative. */
export const draftAmount = (
    draft: SpendDraft,
    decimalPlaces: number
): number => {
    const minor = toMinor(Number(draft.amount), decimalPlaces);
    return draft.refund ? -minor : minor;
};

/** A pot-less spend settled at source came straight from the main account; one
 *  that isn't settled still needs a pot. */
export const needsPot = (spend: Spend): boolean =>
    spend.potId === null && spend.settledAtSource === 0;
