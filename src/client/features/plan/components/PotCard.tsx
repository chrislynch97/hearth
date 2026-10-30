import { Link } from "@tanstack/react-router";
import { formatMoney } from "@shared/money";
import type { PeriodFrequency } from "@shared/period";
import { formatAer } from "@/interestRate";
import type { MoneyFormat } from "@/useMoney";
import { Badge } from "@/components/shadcn/badge";
import { Card } from "@/components/shadcn/card";
import { Button } from "@/components/ui/Button";
import { OwnerChip } from "@/features/plan/components/OwnerChip";
import { PlanLineRow } from "@/features/plan/components/PlanLineRow";
import { PotColumn } from "@/features/plan/components/PotColumn";
import { ShouldHold } from "@/features/plan/components/ShouldHold";
import { StandingOrderStrip } from "@/features/plan/components/StandingOrderStrip";
import {
    fundingOf,
    perPeriodLabel,
    sumPerPeriod,
    type PlanPot,
    type PotBalance,
    type RecurringRow,
} from "@/features/plan/model";
import type { Expense, SetAside } from "../../../../server/db/schema";

export interface PotCardProps {
    planPot: PlanPot;
    money: MoneyFormat;
    frequency: PeriodFrequency;
    /** The household's per-period suffix, e.g. `/mo`. */
    unit: string;
    /** Set when this pot's standing order has gone stale. */
    staleStandingOrder: { wasMonthly: number } | undefined;
    /** What the pot should hold on the page's chosen day; absent while loading. */
    shouldHold: PotBalance | undefined;
    /** The savings goal this pot backs, if any. */
    goal?: { slug: string; name: string };
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
    shouldHold,
    goal,
    acknowledging,
    onAcknowledge,
    onEditPot,
    onAddBill,
    onEditBill,
    onAddSetAside,
    onEditSetAside,
}: PotCardProps) => {
    const { pot, owner, bills, setAsides, perPeriod } = planPot;

    const paidAmount = (row: RecurringRow) =>
        formatMoney(row.amount ?? 0, money);

    const periodShare = (row: RecurringRow) =>
        perPeriodLabel(row, frequency, money, unit);

    const billMeta = (bill: Expense) =>
        fundingOf(bill) === "pot_auto"
            ? `${bill.recurrence} · auto`
            : bill.recurrence;

    // A single unnamed contribution is stored under the pot's own name; showing
    // "Rent — Rent" would be nonsense.
    const setAsideLabel = (row: SetAside) =>
        row.name === pot.name ? "Contribution" : row.name;

    return (
        <Card className="gap-0 overflow-hidden py-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-border px-3.5 py-3">
                <h3 className="min-w-0 truncate font-display text-lg font-medium">
                    {pot.name}
                </h3>
                <OwnerChip owner={owner} />
                {pot.interestRateBp ? (
                    <Badge variant="secondary">
                        {formatAer(pot.interestRateBp)}
                    </Badge>
                ) : null}
                <span className="tabular ml-auto text-fig-sm font-semibold text-text">
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
                    className="max-sm:h-8"
                >
                    Edit
                </Button>
            </div>

            {staleStandingOrder && (
                <StandingOrderStrip
                    wasMonthly={staleStandingOrder.wasMonthly}
                    money={money}
                    pending={acknowledging}
                    onAcknowledge={onAcknowledge}
                />
            )}

            {goal && (
                <Link
                    to="/planners/$goal"
                    params={{ goal: goal.slug }}
                    className="flex items-center gap-2 border-b border-border px-3.5 py-2 text-sm font-semibold text-primary hover:bg-hover"
                >
                    Savings goal: {goal.name} →
                </Link>
            )}

            {shouldHold && shouldHold.lines.length > 0 && (
                <ShouldHold balance={shouldHold} money={money} />
            )}

            <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                <PotColumn
                    direction="out"
                    label="Bills out"
                    subtotal={formatMoney(
                        sumPerPeriod(bills, frequency),
                        money
                    )}
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
                            amount={paidAmount(bill)}
                            perPeriod={periodShare(bill)}
                            ariaLabel={`Edit ${bill.name}`}
                            onClick={() => onEditBill(bill)}
                        />
                    ))}
                </PotColumn>

                <PotColumn
                    direction="in"
                    label="Set aside"
                    subtotal={formatMoney(
                        sumPerPeriod(setAsides, frequency),
                        money
                    )}
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
                            amount={paidAmount(row)}
                            perPeriod={periodShare(row)}
                            ariaLabel={`Edit ${setAsideLabel(row)}`}
                            onClick={() => onEditSetAside(row)}
                        />
                    ))}
                </PotColumn>
            </div>
        </Card>
    );
};
