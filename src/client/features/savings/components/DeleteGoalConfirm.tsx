import { Button } from "@/components/ui/Button";
import type { GoalPlan } from "@/features/savings/model";

export interface DeleteGoalConfirmProps {
    plan: GoalPlan;
    pending: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

/** The one question before a goal goes for good. */
export const DeleteGoalConfirm = ({
    plan,
    pending,
    onConfirm,
    onCancel,
}: DeleteGoalConfirmProps) => (
    <div className="flex flex-col gap-5">
        <p className="text-base">
            This deletes {plan.goal.name} with its items and recorded balances.
            The {plan.potName} pot and its set-aside stay on Plan. This can't be
            undone.
        </p>
        <p className="text-sm text-text-muted">
            Done with it but want to keep the history? Archive it instead.
        </p>
        <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel}>
                Cancel
            </Button>
            <Button
                variant="danger"
                className="border-danger"
                disabled={pending}
                onClick={onConfirm}
            >
                Delete {plan.goal.name}
            </Button>
        </div>
    </div>
);
