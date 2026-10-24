import { diffDays } from "@shared/dates";
import { formatMoney } from "@shared/money";
import { periodUnitLabel, type PeriodConfig } from "@shared/period";
import {
    outcomeFor,
    type ItemFlag,
    type PlanLine,
    type SavingsPlanInput,
} from "@shared/savings";
import type { MoneyFormat } from "@/useMoney";
import type { GoalPlan } from "../../../server/features/savings/savings";

export type { GoalPlan };
export {
    moneyInput,
    parseOptionalMoney,
    validMoney,
} from "@/features/gifts/model";

/** What the goal query carries beyond a list entry: the household's cycle and
 *  the server's today, so a what-if is drawn on the same calendar. */
export interface GoalDetail extends GoalPlan {
    period: PeriodConfig;
    today: string;
}

/** The goal to show: the one asked for if it exists, else the first live one,
 *  else whatever there is. `goals` arrive soonest first. */
export const pickGoal = (
    goals: GoalPlan[],
    requested: string | undefined
): GoalPlan | undefined =>
    goals.find(({ goal }) => goal.id === requested) ??
    goals.find(({ goal }) => goal.archivedAt === null) ??
    goals[0];

/** The planner's input, rebuilt from the goal query so the client can rerun it. */
export const plannerInput = (detail: GoalDetail): SavingsPlanInput => ({
    targetAmount: detail.goal.targetAmount,
    targetDate: detail.goal.targetDate,
    items: detail.items.map((item) => ({
        id: item.id,
        name: item.name,
        amount: item.amount,
        dueDate: item.dueDate,
        paidOn: item.paidOn,
    })),
    balances: detail.balances.map((b) => ({
        asOfDate: b.asOfDate,
        amount: b.amount,
    })),
    contribution: detail.contribution,
    today: detail.today,
    period: detail.period,
});

export const FLAG_LABEL: Record<ItemFlag["kind"], string> = {
    overdue: "Overdue",
    at_risk: "At risk",
};

/** "every item on time", or the short lines in prose. */
const lineNames = (lines: PlanLine[], money: MoneyFormat): string => {
    const names = lines.map((line) =>
        line.itemId === null
            ? `${formatMoney(line.amount, money)} not itemised`
            : line.name.toLowerCase()
    );
    return names.length > 1
        ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
        : (names[0] ?? "");
};

export interface Verdict {
    tone: "over" | "short";
    /** Bold lead-in, then the rest of the sentence. */
    lead: string;
    rest: string;
    /** Set when short: the per-period figure "Use this" would apply. */
    needed: number | null;
}

/** The line under the figures. Over says how low you could go, and stops there;
 *  only short offers to change anything. */
export const verdict = (
    detail: GoalDetail,
    money: MoneyFormat,
    formatDate: (iso: string) => string
): Verdict => {
    const { plan, contribution, goal } = detail;
    const unit = periodUnitLabel(detail.period.frequency);
    const at = `${formatMoney(contribution, money)}${unit}`;
    const by = formatDate(goal.targetDate);
    const target = formatMoney(goal.targetAmount, money);

    if (plan.outcome.short.length === 0) {
        const over = plan.outcome.difference;
        const lower =
            plan.neededPerPeriod < contribution
                ? ` You could drop to ${formatMoney(plan.neededPerPeriod, money)}${unit} and still hit ${target}.`
                : "";
        return {
            tone: "over",
            lead:
                over > 0
                    ? `${at} puts you ${formatMoney(over, money)} over`
                    : `${at} hits ${target} exactly`,
            rest: ` by ${by}.${lower}`,
            needed: null,
        };
    }
    return {
        tone: "short",
        lead: `${at} leaves you ${formatMoney(-plan.outcome.difference, money)} short`,
        rest: ` on ${by}. Needs ${formatMoney(plan.neededPerPeriod, money)}${unit} to cover every item on time.`,
        needed: plan.neededPerPeriod,
    };
};

/** What a different contribution would do, in one sentence. */
export const whatIfSentence = (
    input: SavingsPlanInput,
    amount: number,
    money: MoneyFormat,
    formatDate: (iso: string) => string
): { lead: string; rest: string } => {
    const unit = periodUnitLabel(input.period.frequency);
    const lead = `At ${formatMoney(amount, money)}${unit}`;
    const outcome = outcomeFor(input, amount);
    const target = formatMoney(input.targetAmount, money);

    if (outcome.short.length === 0) {
        const reached = outcome.reachedOn ?? input.targetDate;
        const months = Math.round(diffDays(reached, input.targetDate) / 30.44);
        const early =
            months > 0 ? `, ${months} month${months === 1 ? "" : "s"} early` : "";
        const over =
            outcome.difference > 0
                ? `, and end ${formatMoney(outcome.difference, money)} over`
                : "";
        return {
            lead,
            rest: ` you reach ${target} on ${formatDate(reached)}${early}${over}.`,
        };
    }
    const verb = outcome.short.length > 1 ? "fall" : "falls";
    return {
        lead,
        rest: ` you're ${formatMoney(-outcome.difference, money)} short on ${formatDate(input.targetDate)}. The ${lineNames(outcome.short, money)} ${verb} short, first on ${formatDate(outcome.short[0]!.due)}.`,
    };
};
