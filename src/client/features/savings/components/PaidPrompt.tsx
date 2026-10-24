import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import { Button } from "@/components/ui/Button";

export interface PaidPromptProps {
    amount: number;
    target: number;
    money: MoneyFormat;
    pending: boolean;
    onReduce: () => void;
    onKeep: () => void;
    onCancel: () => void;
}

/** The step after a tick: does paying this shrink the target, or does its
 *  money stay in the plan as headroom? Nothing is saved until one is picked. */
export const PaidPrompt = ({
    amount,
    target,
    money,
    pending,
    onReduce,
    onKeep,
    onCancel,
}: PaidPromptProps) => (
    <div
        role="group"
        aria-label="Adjust the target"
        onKeyDown={(event) => event.key === "Escape" && onCancel()}
        className="col-span-2 col-start-2 mt-1.5 flex flex-wrap items-center gap-2 rounded-sm bg-primary-tint-weak px-2.5 py-2"
    >
        <p className="min-w-0 flex-[1_1_240px] text-sm">
            Marked paid. Take {formatMoney(amount, money)} off the target?{" "}
            <span className="tabular text-text-secondary">
                {formatMoney(target, money)} →{" "}
                {formatMoney(Math.max(0, target - amount), money)}
            </span>
        </p>
        <Button variant="solid" compact disabled={pending} onClick={onReduce}>
            Take it off
        </Button>
        <Button compact disabled={pending} onClick={onKeep}>
            Keep {formatMoney(target, money)}
        </Button>
        <Button variant="ghost" compact disabled={pending} onClick={onCancel}>
            Cancel
        </Button>
    </div>
);
