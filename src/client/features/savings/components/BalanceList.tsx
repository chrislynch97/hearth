import { formatMoney } from "@shared/money";
import { useFormatDate, type MoneyFormat } from "@/useMoney";
import type { SavingsBalance } from "../../../../server/db/schema";

export interface BalanceListProps {
    balances: SavingsBalance[];
    money: MoneyFormat;
    onEdit: (balance: SavingsBalance) => void;
}

/** What was in the pot, as recorded, newest first. A row opens it to correct
 *  or delete. */
export const BalanceList = ({ balances, money, onEdit }: BalanceListProps) => {
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
                    className="border-t border-border first:border-t-0"
                >
                    <button
                        type="button"
                        onClick={() => onEdit(balance)}
                        aria-label={`Edit the ${formatDate(balance.asOfDate)} balance`}
                        className="flex w-full flex-wrap items-center gap-x-2.5 px-3.5 py-2 text-left transition-colors duration-[140ms] ease-out hover:bg-hover"
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
                    </button>
                </li>
            ))}
        </ul>
    );
};
