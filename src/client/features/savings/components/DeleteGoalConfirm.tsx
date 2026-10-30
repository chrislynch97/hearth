import { Button } from "@/components/ui/Button";
import type { GoalPlan } from "@/features/savings/model";

export interface DeleteGoalConfirmProps {
    plan: GoalPlan;
    pending: boolean;
    onConfirm: () => void;
}

/** The one question before a goal goes for good. */
export const DeleteGoalConfirm = ({
    plan,
    pending,
    onConfirm,
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
        <div className="flex justify-end">
            <Button
                variant="destructive"
                className="max-sm:h-9 max-sm:w-full"
                disabled={pending}
                onClick={onConfirm}
            >
                Delete {plan.goal.name}
            </Button>
        </div>
    </div>
);
