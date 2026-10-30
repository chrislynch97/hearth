import { formatMoney } from "@shared/money";
import { useFormatDate, type MoneyFormat } from "@/useMoney";
import { ListRow } from "@/components/ui/ListRow";
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
        <ul className="m-0 flex list-none flex-col divide-y divide-border px-1.5 py-1">
            {[...balances].reverse().map((balance) => (
                <ListRow
                    key={balance.id}
                    title={formatDate(balance.asOfDate)}
                    details={balance.note}
                    value={formatMoney(balance.amount, money)}
                    onClick={() => onEdit(balance)}
                />
            ))}
        </ul>
    );
};
