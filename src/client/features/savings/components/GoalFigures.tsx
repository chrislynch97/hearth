import { formatMoney } from "@shared/money";
import { periodUnitLabel } from "@shared/period";
import { useFormatDate, type MoneyFormat } from "@/useMoney";
import type { GoalDetail } from "@/features/savings/model";

export interface GoalFiguresProps {
    detail: GoalDetail;
    money: MoneyFormat;
}

interface Figure {
    label: string;
    value: string;
    sub: string;
}

/** The four numbers the page is about, in one strip. */
export const GoalFigures = ({ detail, money }: GoalFiguresProps) => {
    const formatDate = useFormatDate();

    const { goal, target, plan, contribution, potName, interestRateBp } = detail;
    const difference = plan.outcome.difference;
    const unpaid = detail.items.filter((item) => item.paidOn === null).length;
    const figures: Figure[] = [
        {
            label: "In the pot now",
            value: formatMoney(plan.balanceNow, money),
            sub: plan.anchor
                ? `Last recorded ${formatDate(plan.anchor.asOfDate)}${interestRateBp ? ", plus interest" : ""}`
                : "No balance recorded yet",
        },
        goal.targetAmount === null
            ? {
                  label: "Still to pay",
                  value: formatMoney(target.targetAmount, money),
                  sub:
                      unpaid === 0
                          ? "Nothing left to pay"
                          : `${unpaid} ${unpaid === 1 ? "item" : "items"}, the last on ${formatDate(target.targetDate)}`,
              }
            : {
                  label: "Target",
                  value: formatMoney(goal.targetAmount, money),
                  sub: `By ${formatDate(target.targetDate)}`,
              },
        {
            label: "Going in",
            value: `${formatMoney(contribution, money)}${periodUnitLabel(detail.period.frequency)}`,
            sub: `${potName} pot set-aside`,
        },
        {
            label:
                goal.targetAmount === null
                    ? `By ${formatDate(target.targetDate)}`
                    : "By the date",
            value: formatMoney(plan.outcome.final, money),
            sub:
                difference >= 0
                    ? `${formatMoney(difference, money)} over`
                    : `${formatMoney(-difference, money)} short`,
        },
    ];

    return (
        <dl className="m-0 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-4">
            {figures.map((figure) => (
                <div
                    key={figure.label}
                    className="flex flex-col gap-0.5 bg-raised px-3.5 py-3"
                >
                    <dt className="text-sm text-text-muted">{figure.label}</dt>
                    <dd className="tabular m-0 text-fig font-semibold text-text">
                        {figure.value}
                    </dd>
                    <dd className="m-0 text-xs text-text-secondary">
                        {figure.sub}
                    </dd>
                </div>
            ))}
        </dl>
    );
};
