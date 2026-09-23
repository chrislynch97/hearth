import { formatMoney } from "@shared/money";
import {
    normaliseToPeriod,
    roundMinor,
    type Recurrence,
} from "@shared/recurrence";
import type { PeriodFrequency } from "@shared/period";
import type { MoneyFormat } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { OwnerChip } from "@/features/plan/components/OwnerChip";
import { PlanLineRow } from "@/features/plan/components/PlanLineRow";
import { PotColumn } from "@/features/plan/components/PotColumn";
import { StandingOrderChip } from "@/features/plan/components/StandingOrderChip";
import { fundingOf, type PlanPot } from "@/features/plan/model";
import type { Expense, SetAside } from "../../../../server/db/schema";

export interface PotCardProps {
    planPot: PlanPot;
    money: MoneyFormat;
    frequency: PeriodFrequency;
    /** The household's per-period suffix, e.g. `/mo`. */
    unit: string;
    /** Set when this pot's standing order has gone stale. */
    staleStandingOrder: { wasMonthly: number } | undefined;
    acknowledging: boolean;
    onAcknowledge: () => void;
    onEditPot: () => void;
    onAddBill: () => void;
    onEditBill: (bill: Expense) => void;
    onAddSetAside: () => void;
    onEditSetAside: (setAside: SetAside) => void;
}

/** One pot, with what drains it and what fills it side by side. The two columns
 *  are the point of the page: money out and money in used to live on different
 *  screens, one pot's worth of context apart. */
export const PotCard = ({
    planPot,
    money,
    frequency,
    unit,
    staleStandingOrder,
    acknowledging,
    onAcknowledge,
    onEditPot,
    onAddBill,
    onEditBill,
    onAddSetAside,
    onEditSetAside,
}: PotCardProps) => {
    const { pot, owner, bills, setAsides, perPeriod } = planPot;

    const perPeriodOf = (row: { amount: number | null; recurrence: string }) =>
        normaliseToPeriod(
            row.amount ?? 0,
            row.recurrence as Recurrence,
            frequency
        );

    const periodAmount = (row: { amount: number | null; recurrence: string }) =>
        formatMoney(perPeriodOf(row), money);

    /** A column's own share of what the pot needs; the two add up to its total. */
    const periodTotal = (
        rows: { amount: number | null; recurrence: string }[]
    ) => roundMinor(rows.reduce((acc, row) => acc + perPeriodOf(row), 0));

    const billMeta = (bill: Expense) =>
        fundingOf(bill) === "pot_auto" ? "auto" : bill.recurrence;

    // A single unnamed contribution is stored under the pot's own name; showing
    // "Rent — Rent" would be nonsense.
    const setAsideLabel = (row: SetAside) =>
        row.name === pot.name ? "Contribution" : row.name;

    return (
        <section className="rounded-md border border-border bg-raised">
            <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-3">
                <h3 className="font-display text-lg font-medium">{pot.name}</h3>
                <OwnerChip owner={owner} />
                <span className="flex-1" />
                {staleStandingOrder && (
                    <StandingOrderChip
                        wasMonthly={staleStandingOrder.wasMonthly}
                        money={money}
                        pending={acknowledging}
                        onAcknowledge={onAcknowledge}
                    />
                )}
                <span className="tabular text-fig-sm font-semibold text-text">
                    {formatMoney(perPeriod, money)}
                    <span className="ml-1 text-xs font-normal text-text-muted">
                        {unit}
                    </span>
                </span>
                <Button
                    variant="ghost"
                    compact
                    onClick={onEditPot}
                    aria-label={`Edit ${pot.name}`}
                >
                    Edit
                </Button>
            </div>

            <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                <PotColumn
                    direction="out"
                    label="Bills out"
                    subtotal={formatMoney(periodTotal(bills), money)}
                    empty="No bills yet"
                    addLabel="Add bill"
                    onAdd={onAddBill}
                    isEmpty={bills.length === 0}
                >
                    {bills.map((bill) => (
                        <PlanLineRow
                            key={bill.id}
                            name={bill.name}
                            emergencyFund={bill.includeInEmergencyFund !== 0}
                            meta={billMeta(bill)}
                            amount={periodAmount(bill)}
                            ariaLabel={`Edit ${bill.name}`}
                            onClick={() => onEditBill(bill)}
                        />
                    ))}
                </PotColumn>

                <PotColumn
                    direction="in"
                    label="Set aside"
                    subtotal={formatMoney(periodTotal(setAsides), money)}
                    empty="Nothing set aside yet"
                    addLabel="Add set-aside"
                    onAdd={onAddSetAside}
                    isEmpty={setAsides.length === 0}
                >
                    {setAsides.map((row) => (
                        <PlanLineRow
                            key={row.id}
                            name={setAsideLabel(row)}
                            emergencyFund={row.includeInEmergencyFund !== 0}
                            meta={row.recurrence}
                            amount={periodAmount(row)}
                            ariaLabel={`Edit ${setAsideLabel(row)}`}
                            onClick={() => onEditSetAside(row)}
                        />
                    ))}
                </PotColumn>
            </div>
        </section>
    );
};
