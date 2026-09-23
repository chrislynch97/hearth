import { formatMoney } from "@shared/money";
import { normaliseToPeriod, type Recurrence } from "@shared/recurrence";
import type { PeriodFrequency } from "@shared/period";
import type { MoneyFormat } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { PlusIcon } from "@/components/ui/PlusIcon";
import { PlanLineRow } from "@/features/plan/components/PlanLineRow";
import type { Expense } from "../../../../server/db/schema";

export interface MainAccountCardProps {
    bills: Expense[];
    money: MoneyFormat;
    frequency: PeriodFrequency;
    unit: string;
    onAddBill: () => void;
    onEditBill: (bill: Expense) => void;
}

/** Bills that come straight out of the main account. They have a category but no
 *  pot, so they can't sit in a pot card — and they still have to be funded, so
 *  they can't be left off the page either. */
export const MainAccountCard = ({
    bills,
    money,
    frequency,
    unit,
    onAddBill,
    onEditBill,
}: MainAccountCardProps) => {
    const total = bills.reduce(
        (acc, bill) =>
            acc +
            normaliseToPeriod(
                bill.amount ?? 0,
                bill.recurrence as Recurrence,
                frequency
            ),
        0
    );

    return (
        <section className="rounded-md border border-dashed border-border-strong bg-sunken">
            <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-3">
                <h3 className="font-display text-lg font-medium">
                    Straight from the main account
                </h3>
                <span className="flex-1" />
                <span className="tabular text-fig-sm font-semibold text-text">
                    {formatMoney(total, money)}
                    <span className="ml-1 text-xs font-normal text-text-muted">
                        {unit}
                    </span>
                </span>
            </div>
            <div className="px-3.5 py-3">
                <p className="mb-2 text-xs text-text-muted">
                    No pot behind these — leave this much in the main account
                    and they look after themselves.
                </p>
                {bills.map((bill) => (
                    <PlanLineRow
                        key={bill.id}
                        name={bill.name}
                        emergencyFund={bill.includeInEmergencyFund !== 0}
                        meta={bill.recurrence}
                        amount={formatMoney(
                            normaliseToPeriod(
                                bill.amount ?? 0,
                                bill.recurrence as Recurrence,
                                frequency
                            ),
                            money
                        )}
                        ariaLabel={`Edit ${bill.name}`}
                        onClick={() => onEditBill(bill)}
                    />
                ))}
                <Button
                    variant="ghost"
                    compact
                    icon={<PlusIcon />}
                    className="mt-2"
                    onClick={onAddBill}
                >
                    Add bill
                </Button>
            </div>
        </section>
    );
};
