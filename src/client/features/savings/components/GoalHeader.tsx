import { Link } from "@tanstack/react-router";
import { formatAer } from "@/interestRate";
import { useFormatDate } from "@/useMoney";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { Button } from "@/components/ui/Button";
import { nextDueLabel, type GoalPlan } from "@/features/savings/model";

export interface GoalHeaderProps {
    plan: GoalPlan;
    onEdit: () => void;
    /** Opens Edit goal on the interest rate. */
    onEditRate: () => void;
    onToggleArchived: () => void;
    onDelete: () => void;
    onRecordBalance: () => void;
}

/** The goal's name with the way back to the list and its own actions. */
export const GoalHeader = ({
    plan,
    onEdit,
    onEditRate,
    onToggleArchived,
    onDelete,
    onRecordBalance,
}: GoalHeaderProps) => {
    const formatDate = useFormatDate();

    const { goal, potName, interestRateBp } = plan;

    return (
        <header className="flex flex-col gap-2 border-b border-border-strong pb-5">
            <Link
                to="/planners"
                className="self-start text-sm font-semibold text-primary"
            >
                ← Savings planners
            </Link>
            <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1">
                    <h1 className="font-display text-h1 font-medium leading-tight [overflow-wrap:anywhere]">
                        {goal.name}
                    </h1>
                    <p className="mt-1 text-sm text-text-muted">
                        {goal.targetDate === null
                            ? nextDueLabel(plan, formatDate)
                            : formatDate(goal.targetDate)}{" "}
                        · {potName} pot ·{" "}
                        <button
                            type="button"
                            onClick={onEditRate}
                            className="font-semibold text-primary hover:underline"
                        >
                            {interestRateBp ? formatAer(interestRateBp) : "Add interest rate"}
                        </button>
                        {goal.archivedAt !== null && " · Archived"}
                    </p>
                </div>
                <Button variant="dashed" onClick={onRecordBalance}>
                    Record balance
                </Button>
                <ActionMenu
                    label={`Actions for ${goal.name}`}
                    items={[
                        { label: "Edit", onSelect: onEdit },
                        {
                            label: goal.archivedAt === null ? "Archive" : "Restore",
                            onSelect: onToggleArchived,
                        },
                        { label: "Delete", onSelect: onDelete, danger: true },
                    ]}
                />
            </div>
        </header>
    );
};
