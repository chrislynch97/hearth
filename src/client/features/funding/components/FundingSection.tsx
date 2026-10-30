import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import { StatRow } from "@/components/ui/StatRow";

export interface FundingSectionProps {
    /** Left out where the card's headline already is this figure. */
    title?: string;
    total?: number;
    /** What the total is made of, each on a quieter line under it. */
    rows?: Array<{ key: string; name: string; amount: number }>;
    money: MoneyFormat;
    /** Red, for a pool that's come up short. */
    negative?: boolean;
}

/** A figure and what makes it up: one of the moves an account has to make. */
export const FundingSection = ({
    title,
    total,
    rows = [],
    money,
    negative = false,
}: FundingSectionProps) => (
    <section className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
        {title && total !== undefined && (
            <StatRow
                label={title}
                value={formatMoney(total, money)}
                tone={negative ? "danger" : "default"}
                total
            />
        )}
        {rows.length > 0 && (
            <div className="grid gap-x-8 gap-y-1 sm:has-[>:nth-child(7)]:grid-cols-2">
                {rows.map((row) => (
                    <StatRow
                        key={row.key}
                        label={row.name}
                        value={formatMoney(row.amount, money)}
                    />
                ))}
            </div>
        )}
    </section>
);
