import { Link, useNavigate } from "@tanstack/react-router";
import { Progress } from "@microcharts/react/progress";
import { formatMoney } from "@shared/money";
import { useElementWidth } from "@/useElementWidth";
import { useFormatDate, type MoneyFormat } from "@/useMoney";
import { Card } from "@/components/shadcn/card";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { nextDueLabel, type GoalPlan } from "@/features/savings/model";

export interface GoalCardProps {
    plan: GoalPlan;
    money: MoneyFormat;
    onEdit: () => void;
    onToggleArchived: () => void;
    onDelete: () => void;
}

/** One goal in the list: how far the pot has got, whether it's on track, and
 *  a way in, with its other actions behind the row's menu. */
export const GoalCard = ({
    plan,
    money,
    onEdit,
    onToggleArchived,
    onDelete,
}: GoalCardProps) => {
    const formatDate = useFormatDate();
    const navigate = useNavigate();
    const { ref, width } = useElementWidth<HTMLSpanElement>();

    const { goal, slug, potName } = plan;
    const { balanceNow, outcome, flags } = plan.plan;
    const trouble = Object.keys(flags).length;
    const status =
        outcome.short.length > 0
            ? outcome.difference < 0
                ? `${formatMoney(-outcome.difference, money)} short`
                : "Misses a deadline"
            : `${formatMoney(outcome.difference, money)} over`;

    return (
        <li>
            <Card className="flex-row items-center gap-2 py-0 pr-2 transition-colors duration-[140ms] ease-out hover:bg-hover">
            <Link
                to="/planners/$goal"
                params={{ goal: slug }}
                className="flex min-w-0 flex-1 flex-col gap-1.5 px-3.5 py-3"
            >
                <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                    <span className="font-display text-lg font-medium">
                        {goal.name}
                    </span>
                    <span className="text-xs text-text-muted">
                        {goal.targetDate === null
                            ? nextDueLabel(plan, formatDate)
                            : formatDate(goal.targetDate)}{" "}
                        · {potName} pot
                    </span>
                </span>
                <span ref={ref} className="block h-1 rounded-xs bg-sunken">
                    {width > 0 && (
                        <Progress
                            value={Math.min(balanceNow, outcome.required)}
                            max={Math.max(1, outcome.required)}
                            width={width}
                            height={4}
                            className="block"
                            color="var(--color-primary)"
                            title={`${goal.name} so far`}
                            summary={`${formatMoney(balanceNow, money)} of ${formatMoney(outcome.required, money)}`}
                        />
                    )}
                </span>
                <span className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
                    <span className="tabular text-text-secondary">
                        <span className="font-semibold text-text">
                            {formatMoney(balanceNow, money)}
                        </span>{" "}
                        of {formatMoney(outcome.required, money)}
                    </span>
                    <span
                        className={
                            outcome.short.length > 0
                                ? "font-semibold text-attention-fg"
                                : "text-text-secondary"
                        }
                    >
                        {status}
                        {trouble > 0 &&
                            ` · ${trouble} item${trouble === 1 ? "" : "s"} at risk`}
                    </span>
                </span>
            </Link>
            <ActionMenu
                label={`Actions for ${goal.name}`}
                items={[
                    {
                        label: "Open",
                        onSelect: () =>
                            void navigate({
                                to: "/planners/$goal",
                                params: { goal: slug },
                            }),
                    },
                    { label: "Edit", onSelect: onEdit },
                    {
                        label: goal.archivedAt === null ? "Archive" : "Restore",
                        onSelect: onToggleArchived,
                    },
                    { label: "Delete", onSelect: onDelete, danger: true },
                ]}
            />
            </Card>
        </li>
    );
};
