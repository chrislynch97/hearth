import { formatMoney } from "@shared/money";
import {
    normaliseToMonthly,
    roundMinor,
    type Recurrence,
} from "@shared/recurrence";
import type { MoneyFormat } from "@/useMoney";
import { Badge } from "@/components/shadcn/badge";
import { ListRow } from "@/components/ui/ListRow";
import { RECURRENCES, type IncomeSource } from "../model";

export interface IncomeSourceRowProps {
    source: IncomeSource;
    ownerName: string | undefined;
    money: MoneyFormat;
    onOpen: () => void;
}

/** One income source, as what it adds up to in a month. */
export const IncomeSourceRow = ({
    source,
    ownerName,
    money,
    onOpen,
}: IncomeSourceRowProps) => {
    const recurrence = source.recurrence as Recurrence;
    const monthly = roundMinor(normaliseToMonthly(source.amount, recurrence));
    const often = RECURRENCES.find((r) => r.value === recurrence)?.label;

    return (
        <ListRow
            title={source.name}
            details={[
                ownerName,
                recurrence === "monthly"
                    ? often
                    : `${formatMoney(source.amount, money)} ${often?.toLowerCase()}`,
            ]
                .filter(Boolean)
                .join(" · ")}
            value={formatMoney(monthly, money)}
            meta={
                source.basis === "gross" ? (
                    <Badge
                        variant="secondary"
                        title="Gross income isn't counted as spendable"
                    >
                        Not counted
                    </Badge>
                ) : source.active === 0 ? (
                    <Badge variant="secondary">Inactive</Badge>
                ) : (
                    <span className="text-sm text-text-muted">a month</span>
                )
            }
            onClick={onOpen}
        />
    );
};
