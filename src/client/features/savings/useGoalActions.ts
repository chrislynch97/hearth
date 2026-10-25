import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import type { GoalPlan } from "@/features/savings/model";

/** Archive, restore and delete for a goal, shared by the list's row menu and
 *  the goal page's menu. Each resolves true once done, false on an error
 *  (which the global handler has already shown). */
export const useGoalActions = () => {
    const utils = trpc.useUtils();
    const setArchived = trpc.savings.setArchived.useMutation();
    const remove = trpc.savings.removeGoal.useMutation();

    const toggleArchived = async ({ goal }: GoalPlan): Promise<boolean> => {
        const archived = goal.archivedAt === null;
        try {
            await setArchived.mutateAsync({ id: goal.id, archived });
        } catch {
            return false;
        }
        await utils.savings.invalidate();
        notifySuccess(archived ? `Archived ${goal.name}.` : `Restored ${goal.name}.`);
        return true;
    };

    const removeGoal = async ({ goal, potName }: GoalPlan): Promise<boolean> => {
        try {
            await remove.mutateAsync({ id: goal.id });
        } catch {
            return false;
        }
        // Just the list: a page showing the goal moves off it rather than
        // refetching it and getting a not-found.
        await utils.savings.goals.invalidate();
        notifySuccess(`Deleted ${goal.name}. The ${potName} pot is still on Plan.`);
        return true;
    };

    return { toggleArchived, removeGoal, removing: remove.isPending };
};
