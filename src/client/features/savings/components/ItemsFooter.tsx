import { formatMoney } from "@shared/money";
import { unpaidTotal } from "@shared/savings";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import type { MoneyFormat } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import type { GoalPlan } from "@/features/savings/model";

export interface ItemsFooterProps {
    plan: GoalPlan;
    money: MoneyFormat;
}

/** What the unpaid items come to against the target, with a way to raise it
 *  when they've gone past. An item-by-item goal has only its items to add up. */
export const ItemsFooter = ({ plan, money }: ItemsFooterProps) => {
    const utils = trpc.useUtils();
    const update = trpc.savings.updateGoal.useMutation();

    const { goal, items } = plan;
    const allocated = unpaidTotal(items);

    const raise = async () => {
        try {
            await update.mutateAsync({
                id: goal.id,
                expectedUpdatedAt: goal.updatedAt,
                targetAmount: allocated,
            });
        } catch {
            return; // surfaced by the global error handler
        }
        await utils.savings.invalidate();
        notifySuccess(`Raised the target to ${formatMoney(allocated, money)}.`);
    };

    const total = (
        <strong className="tabular font-semibold text-text">
            {formatMoney(allocated, money)}
        </strong>
    );

    if (goal.targetAmount === null) {
        const unpaid = items.filter((item) => item.paidOn === null).length;

        return (
            <p className="border-t border-border px-3.5 py-2.5 text-sm text-text-secondary">
                {unpaid === 0 ? (
                    "All paid"
                ) : (
                    <>
                        {unpaid} {unpaid === 1 ? "item" : "items"} · {total}{" "}
                        still to pay
                    </>
                )}
            </p>
        );
    }

    const left = goal.targetAmount - allocated;

    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-border px-3.5 py-2.5 text-sm text-text-secondary">
            <span>
                Items {total} of{" "}
                <span className="tabular">
                    {formatMoney(goal.targetAmount, money)}
                </span>{" "}
                target
            </span>
            {left > 0 && (
                <span className="text-text-muted">
                    · {formatMoney(left, money)} left to allocate
                </span>
            )}
            {left === 0 && <span className="text-text-muted">· fully allocated</span>}
            {left < 0 && (
                <>
                    <span className="font-semibold text-attention-fg">
                        · {formatMoney(-left, money)} over target
                    </span>
                    <span className="flex-1" />
                    <Button
                        compact
                        disabled={update.isPending}
                        onClick={() => void raise()}
                    >
                        Raise target to {formatMoney(allocated, money)}
                    </Button>
                </>
            )}
        </div>
    );
};
