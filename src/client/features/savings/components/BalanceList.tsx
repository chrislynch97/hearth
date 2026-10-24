import { formatMoney } from "@shared/money";
import { useFormatDate, type MoneyFormat } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import type { SavingsBalance } from "../../../../server/db/schema";

export interface BalanceListProps {
    balances: SavingsBalance[];
    money: MoneyFormat;
    removingId: string | null;
    onRemove: (balance: SavingsBalance) => void;
}

/** What was in the pot, as recorded, newest first. */
export const BalanceList = ({
    balances,
    money,
    removingId,
    onRemove,
}: BalanceListProps) => {
    const formatDate = useFormatDate();

    if (balances.length === 0) {
        return (
            <p className="px-3.5 py-3 text-sm text-text-muted">
                Nothing recorded yet. Record what's in the pot from your banking
                app, and the plan starts from there.
            </p>
        );
    }

    return (
        <ul className="m-0 list-none p-0">
            {[...balances].reverse().map((balance) => (
                <li
                    key={balance.id}
                    className="flex flex-wrap items-center gap-x-2.5 border-t border-border px-3.5 py-1.5 first:border-t-0"
                >
                    <span className="tabular w-24 shrink-0 text-sm text-text-muted">
                        {formatDate(balance.asOfDate)}
                    </span>
                    {/* On a phone the note takes its own line under the figures. */}
                    <span className="order-last min-w-0 basis-full text-sm text-text-secondary [overflow-wrap:anywhere] sm:order-none sm:flex-1 sm:basis-auto">
                        {balance.note}
                    </span>
                    <span className="flex-1 sm:hidden" />
                    <span className="tabular font-semibold">
                        {formatMoney(balance.amount, money)}
                    </span>
                    <Button
                        variant="ghost"
                        compact
                        disabled={removingId === balance.id}
                        aria-label={`Remove the ${formatDate(balance.asOfDate)} balance`}
                        onClick={() => onRemove(balance)}
                    >
                        Remove
                    </Button>
                </li>
            ))}
        </ul>
    );
};
