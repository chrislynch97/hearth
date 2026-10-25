import { diffDays } from "@shared/dates";
import { formatMoney } from "@shared/money";
import { periodUnitLabel, type PeriodConfig } from "@shared/period";
import {
    outcomeFor,
    type ItemFlag,
    type PlanLine,
    type SavingsOutcome,
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

/** The goal a URL names: by slug, or by id just after a create. */
export const findGoal = (
    goals: GoalPlan[],
    key: string
): GoalPlan | undefined =>
    goals.find(({ slug }) => slug === key) ??
    goals.find(({ goal }) => goal.id === key);

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

/** Plan lines in prose: "the dress, rings and £3,700.00 not itemised". */
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

/** How the money ends up, without ever calling a shortfall "over": being short
 *  on the day, or fine on the day but late for an earlier deadline. */
const shortfall = (
    outcome: SavingsOutcome,
    money: MoneyFormat,
    formatDate: (iso: string) => string,
    targetDate: string
): string =>
    outcome.difference < 0
        ? `${formatMoney(-outcome.difference, money)} short on ${formatDate(targetDate)}`
        : `${formatMoney(outcome.difference, money)} over on ${formatDate(targetDate)} but late for ${formatDate(outcome.short[0]!.due)}`;

/** The lines no payday can reach any more, as a sentence of their own. */
const strandedNote = (
    outcome: SavingsOutcome,
    money: MoneyFormat,
    formatDate: (iso: string) => string
): string => {
    const { stranded } = outcome;
    if (stranded.length === 0) return "";
    const names = lineNames(stranded, money);
    const subject = names.charAt(0).toUpperCase() + names.slice(1);
    return ` ${subject} can't be covered by ${formatDate(stranded[0]!.due)}: there's no payday before then. Record a top-up, or move the date.`;
};

export interface Verdict {
    tone: "over" | "short";
    /** Bold lead-in, then the rest of the sentence. */
    lead: string;
    rest: string;
    /** Set only when a higher per-period figure would actually clear something:
     *  what "Use this" applies. */
    needed: number | null;
}

/** The line under the figures. Over says how low you could go, and stops there;
 *  only short offers to change anything, and only when changing it would help. */
export const verdict = (
    detail: GoalDetail,
    money: MoneyFormat,
    formatDate: (iso: string) => string
): Verdict => {
    const { plan, contribution, goal } = detail;
    const { outcome } = plan;
    const unit = periodUnitLabel(detail.period.frequency);
    const at = `${formatMoney(contribution, money)}${unit}`;
    const required = formatMoney(outcome.required, money);

    if (outcome.short.length === 0) {
        const lower =
            plan.neededPerPeriod < contribution
                ? ` You could drop to ${formatMoney(plan.neededPerPeriod, money)}${unit} and still hit ${required}.`
                : "";
        return {
            tone: "over",
            lead:
                outcome.difference > 0
                    ? `${at} puts you ${formatMoney(outcome.difference, money)} over`
                    : `${at} hits ${required} exactly`,
            rest: ` by ${formatDate(goal.targetDate)}.${lower}`,
            needed: null,
        };
    }

    // `neededPerPeriod` already covers every line a payday can reach, so a
    // higher figure helps only when some short line isn't stranded.
    const reachable = outcome.short.length > outcome.stranded.length;
    const helps = reachable && plan.neededPerPeriod > contribution;
    const fix = helps
        ? ` Needs ${formatMoney(plan.neededPerPeriod, money)}${unit} to cover ${outcome.stranded.length > 0 ? "everything a payday can still reach" : "every item on time"}.`
        : "";
    return {
        tone: "short",
        lead: `${at} leaves you ${shortfall(outcome, money, formatDate, goal.targetDate)}`,
        rest: `.${fix}${strandedNote(outcome, money, formatDate)}`,
        needed: helps ? plan.neededPerPeriod : null,
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
    const required = formatMoney(outcome.required, money);

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
            rest: ` you reach ${required} on ${formatDate(reached)}${early}${over}.`,
        };
    }
    const verb = outcome.short.length > 1 ? "fall" : "falls";
    return {
        lead,
        rest: ` you're ${shortfall(outcome, money, formatDate, input.targetDate)}. The ${lineNames(outcome.short, money)} ${verb} short, first on ${formatDate(outcome.short[0]!.due)}.`,
    };
};
