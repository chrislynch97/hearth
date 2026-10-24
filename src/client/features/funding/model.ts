import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import type {
    FundingPlan,
    PotFunding,
} from "../../../server/features/budget/funding";
import type { Category, Member } from "../../../server/db/schema";

export type { FundingPlan, PotFunding };

/** One account's bills paid straight from it, by category. */
export interface MainAccountGroup {
    /** The owner's member id, or `joint`. */
    key: string;
    label: string;
    rows: Array<{ key: string; name: string; amount: number }>;
    total: number;
}

/** Pots with something to move each period, grouped by owner. */
export const potsByOwner = (plan: FundingPlan): Map<string, PotFunding[]> => {
    const byOwner = new Map<string, PotFunding[]>();
    for (const pot of plan.pots) {
        if (pot.fundingPerPeriod === 0) continue;
        byOwner.set(pot.ownerId, [...(byOwner.get(pot.ownerId) ?? []), pot]);
    }
    return byOwner;
};

/** Main-account bills split by the account that pays them: joint first, then
 *  each person in the plan's order. Each account gets its own total, because
 *  "leave this much in the main account" is only true one account at a time. */
export const mainAccountGroups = (
    plan: FundingPlan,
    members: Member[],
    categories: Category[]
): MainAccountGroup[] => {
    const categoryName = new Map(categories.map((c) => [c.id, c.name]));
    const memberName = new Map(members.map((m) => [m.id, m.displayName]));
    const order = ["joint", ...plan.perPerson.map((p) => p.memberId)];

    const groups = new Map<string, MainAccountGroup>();
    for (const row of plan.mainAccountByCategory) {
        if (row.fundingPerPeriod === 0) continue;
        const key = row.ownerId ?? "joint";
        const group = groups.get(key) ?? {
            key,
            label: row.ownerId
                ? (memberName.get(row.ownerId) ?? "Former member")
                : "Joint",
            rows: [],
            total: 0,
        };
        group.rows.push({
            key: row.categoryId ?? "uncategorised",
            name:
                (row.categoryId && categoryName.get(row.categoryId)) ||
                "Uncategorised",
            amount: row.fundingPerPeriod,
        });
        group.total += row.fundingPerPeriod;
        groups.set(key, group);
    }

    return [...groups.values()].sort(
        (a, b) => rank(order, a.key) - rank(order, b.key)
    );
};

const rank = (order: string[], key: string): number => {
    const i = order.indexOf(key);
    return i === -1 ? order.length : i;
};

/** The per-person standing orders as plaintext, ready to paste into a bank.
 *  `unit` is the household's per-period suffix (e.g. `/mo`, `/4 wks`). */
export const buildPlanText = (
    plan: FundingPlan,
    money: MoneyFormat,
    unit: string
): string => {
    const byOwner = potsByOwner(plan);
    const amount = (minor: number) => `${formatMoney(minor, money)}${unit}`;
    const lines: string[] = ["Hearth — funding plan", ""];

    for (const person of plan.perPerson) {
        lines.push(`${person.displayName}:`);
        for (const pot of byOwner.get(person.memberId) ?? []) {
            lines.push(`  ${pot.name}  ${amount(pot.fundingPerPeriod)}`);
        }
        if (person.jointContribution > 0) {
            lines.push(
                `  To the joint account  ${amount(person.jointContribution)}`
            );
        }
        lines.push(`  → By standing order  ${amount(person.setAside)}`);
        if (person.personalMainAccount > 0) {
            lines.push(
                `  Stays in own account  ${amount(person.personalMainAccount)}`,
                `  → Total spoken for  ${amount(person.setAside + person.personalMainAccount)}`
            );
        }
        lines.push("");
    }
    lines.push(`Joint pots total: ${amount(plan.jointPotFundingTotal)}`);
    return lines.join("\n");
};
