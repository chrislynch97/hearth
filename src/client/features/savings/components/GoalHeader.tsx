import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { formatAer } from "@/interestRate";
import { useFormatDate } from "@/useMoney";
import { Separator } from "@/components/shadcn/separator";
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
        <header className="flex flex-col gap-3">
            <Button variant="link" asChild className="self-start text-sm">
                <Link to="/planners">
                    <ArrowLeft />
                    Savings planners
                </Link>
            </Button>
            <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
                <div className="min-w-full flex-1 sm:min-w-0">
                    <h1 className="font-display text-h1 font-medium leading-tight [overflow-wrap:anywhere]">
                        {goal.name}
                    </h1>
                    <p className="mt-1 text-sm text-text-muted">
                        {goal.targetDate === null
                            ? nextDueLabel(plan, formatDate)
                            : formatDate(goal.targetDate)}{" "}
                        · {potName} pot ·{" "}
                        <Button variant="link" onClick={onEditRate}>
                            {interestRateBp
                                ? formatAer(interestRateBp)
                                : "Add interest rate"}
                        </Button>
                        {goal.archivedAt !== null && " · Archived"}
                    </p>
                </div>
                <Button
                    variant="dashed"
                    className="max-sm:h-9 max-sm:flex-1"
                    onClick={onRecordBalance}
                >
                    Record balance
                </Button>
                <ActionMenu
                    label={`Actions for ${goal.name}`}
                    items={[
                        { label: "Edit", onSelect: onEdit },
                        {
                            label:
                                goal.archivedAt === null
                                    ? "Archive"
                                    : "Restore",
                            onSelect: onToggleArchived,
                        },
                        { label: "Delete", onSelect: onDelete, danger: true },
                    ]}
                />
            </div>
            <Separator />
        </header>
    );
};
