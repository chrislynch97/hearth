import { fromMinor, toMinor } from "@shared/money";
import type {
    GiftStatus,
    GiftTotals,
} from "../../../server/features/gifts/gifts";
import type {
    OccasionDetail,
    OccasionSummary,
    RecipientWithGifts,
} from "../../../server/features/gifts/gifts.router";

import type { Gift } from "../../../server/db/schema";

export type {
    GiftStatus,
    GiftTotals,
    OccasionDetail,
    OccasionSummary,
    RecipientWithGifts,
};

export const STATUS_LABEL: Record<GiftStatus, string> = {
    idea: "Idea",
    bought: "Bought",
    given: "Given",
};

export const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as GiftStatus[]).map(
    (value) => ({ value, label: STATUS_LABEL[value] })
);

/** What one tap moves a gift on to. Given is the end; going back is an edit. */
export const nextStatus = (status: GiftStatus): GiftStatus | null =>
    status === "idea" ? "bought" : status === "bought" ? "given" : null;

/** Drag data type for a gift card, so a column ignores anything else dropped
 *  on it (a file, selected text). Carries the gift id. */
export const GIFT_DRAG_TYPE = "application/x-hearth-gift";

/** The shopping-list columns, in the order a gift travels through them. */
export const COLUMN_TITLE: Record<GiftStatus, string> = {
    idea: "To buy",
    bought: "Bought",
    given: "Given",
};

export interface GiftWithRecipient {
    gift: Gift;
    recipient: RecipientWithGifts;
}

export interface GiftColumnData {
    status: GiftStatus;
    gifts: GiftWithRecipient[];
    total: number;
}

/** Every gift on the occasion sorted into its status column, people in their
 *  own order and each person's gifts oldest first. */
export const giftsByStatus = (
    recipients: RecipientWithGifts[]
): GiftColumnData[] =>
    (Object.keys(COLUMN_TITLE) as GiftStatus[]).map((status) => {
        const gifts = recipients.flatMap((recipient) =>
            recipient.gifts
                .filter((gift) => gift.status === status)
                .map((gift) => ({ gift, recipient }))
        );
        return {
            status,
            gifts,
            total: gifts.reduce((sum, { gift }) => sum + gift.amount, 0),
        };
    });

export type BudgetTone = "spent" | "over" | "idea" | "left";

export interface BudgetSegment {
    tone: BudgetTone;
    label: string;
    value: number;
}

/** The budget bar, left to right: what's spent (up to the budget), any
 *  overspend, the ideas still to buy, then what's free. Empty parts are left
 *  out so the bar never draws a zero-width sliver. */
export const budgetSegments = (totals: GiftTotals): BudgetSegment[] => {
    const { budget, spent, planned } = totals;
    const segments: BudgetSegment[] =
        budget === null
            ? [{ tone: "spent", label: "Spent", value: spent }]
            : [
                  {
                      tone: "spent",
                      label: "Spent",
                      value: Math.min(spent, budget),
                  },
                  {
                      tone: "over",
                      label: "Over budget",
                      value: Math.max(0, spent - budget),
                  },
              ];
    segments.push({ tone: "idea", label: "Ideas", value: planned });
    if (budget !== null) {
        segments.push({
            tone: "left",
            label: "Free",
            value: Math.max(0, budget - spent - planned),
        });
    }
    return segments.filter((segment) => segment.value > 0);
};

/** The occasion to show: the one asked for if it exists, else the next one
 *  coming up (today counts), else an undated one, else the latest past one
 *  not yet archived, else anything. `occasions` arrive soonest-dated first. */
export const pickOccasion = (
    occasions: OccasionSummary[],
    requested: string | undefined,
    today: string
): OccasionSummary | undefined => {
    const live = occasions.filter((occasion) => occasion.archivedAt === null);

    return (
        occasions.find((occasion) => occasion.id === requested) ??
        live.find(
            (occasion) => occasion.date !== null && occasion.date >= today
        ) ??
        live.find((occasion) => occasion.date === null) ??
        live.at(-1) ??
        occasions[0]
    );
};

/** A gift's "where from" as a link, when it is a web address. Anything else
 *  (a shop name, a javascript: URL) stays plain text. */
export const giftLink = (
    text: string | null
): { href: string; label: string } | null => {
    if (!text) return null;
    try {
        const url = new URL(text.trim());
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;
        return { href: url.href, label: url.hostname.replace(/^www\./, "") };
    } catch {
        return null;
    }
};

/** The occasion budget saving this person's budget would raise it to, or
 *  null when it still fits (or the occasion has no budget). `allocated` is
 *  everyone's total as saved, `previous` this person's saved budget. */
export const raisedOccasionBudget = (
    occasionBudget: number | null,
    allocated: number,
    previous: number | null,
    next: number | null
): number | null => {
    const total = allocated - (previous ?? 0) + (next ?? 0);
    return occasionBudget !== null && total > occasionBudget ? total : null;
};

/** A money field's text → minor units. Blank is "no budget", so null. */
export const parseOptionalMoney = (
    text: string,
    decimalPlaces: number
): number | null =>
    text.trim() === "" ? null : toMinor(Number(text), decimalPlaces);

/** Minor units → the text a money field starts with. */
export const moneyInput = (
    minor: number | null,
    decimalPlaces: number
): string => (minor === null ? "" : String(fromMinor(minor, decimalPlaces)));

/** Validation shared by every money field on the page. */
export const validMoney = (text: string, required: boolean): true | string => {
    if (text.trim() === "") return required ? "Enter a price." : true;
    const value = Number(text);
    return (Number.isFinite(value) && value >= 0) || "Enter an amount.";
};
