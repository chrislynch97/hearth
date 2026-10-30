import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import { Button } from "@/components/ui/Button";

export interface StandingOrderStripProps {
    /** What the standing order was last set up for, monthly. */
    wasMonthly: number;
    money: MoneyFormat;
    pending: boolean;
    /** Clears the alert until a bill moves again. */
    onAcknowledge: () => void;
}

/** Shown only on a pot whose standing order has gone stale: a bill changed, so
 *  the amount standing at the real bank no longer covers it. */
export const StandingOrderStrip = ({
    wasMonthly,
    money,
    pending,
    onAcknowledge,
}: StandingOrderStripProps) => (
    <div className="flex items-center justify-between gap-3 border-b border-border bg-attention-tint px-3.5 py-2">
        <span className="min-w-0 text-sm text-text">
            Standing order is still {formatMoney(wasMonthly, money)}
        </span>
        <Button
            variant="attention"
            compact
            disabled={pending}
            className="max-sm:h-8"
            onClick={onAcknowledge}
        >
            I&apos;ve updated it
        </Button>
    </div>
);
