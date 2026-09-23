import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";

export interface StandingOrderChipProps {
    /** What the standing order was last set up for, monthly. */
    wasMonthly: number;
    money: MoneyFormat;
    pending: boolean;
    /** "Done, I've updated the bank" — clears the alert until a bill moves again. */
    onAcknowledge: () => void;
}

/** Shown only on a pot whose standing order has gone stale: a bill changed, so
 *  the amount standing at the real bank no longer covers it. */
export const StandingOrderChip = ({
    wasMonthly,
    money,
    pending,
    onAcknowledge,
}: StandingOrderChipProps) => (
    <button
        onClick={onAcknowledge}
        disabled={pending}
        title="Mark the standing order as updated at the bank"
        className="inline-flex h-5 shrink-0 items-center gap-1 rounded-xs bg-attention-tint px-1.5 text-xs text-attention-fg disabled:opacity-50"
    >
        SO {formatMoney(wasMonthly, money)} &rarr; update
    </button>
);
