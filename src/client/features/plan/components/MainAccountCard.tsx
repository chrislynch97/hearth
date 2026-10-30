import { formatMoney } from "@shared/money";
import type { PeriodFrequency } from "@shared/period";
import type { MoneyFormat } from "@/useMoney";
import { Card } from "@/components/shadcn/card";
import { Button } from "@/components/ui/Button";
import { PlusIcon } from "@/components/ui/PlusIcon";
import { PlanLineRow } from "@/features/plan/components/PlanLineRow";
import {
    mainBillOwnerId,
    perPeriodLabel,
    sumPerPeriod,
} from "@/features/plan/model";
import type { Expense, Member } from "../../../../server/db/schema";

export interface MainAccountCardProps {
    bills: Expense[];
    members: Member[];
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
    members,
    money,
    frequency,
    unit,
    onAddBill,
    onEditBill,
}: MainAccountCardProps) => {
    const total = sumPerPeriod(bills, frequency);
    const memberById = new Map(members.map((member) => [member.id, member]));

    // Joint is the default account, so only a person's own bills say whose.
    const metaFor = (bill: Expense) => {
        const owner = memberById.get(mainBillOwnerId(bill, members) ?? "");
        return owner?.kind === "person"
            ? `${bill.recurrence} · ${owner.displayName}'s account`
            : bill.recurrence;
    };

    return (
        <Card className="gap-0 overflow-hidden border-dashed border-border-strong bg-sunken py-0 shadow-none">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-border px-3.5 py-3">
                <h3 className="font-display text-lg font-medium">
                    Straight from the main account
                </h3>
                <span className="tabular ml-auto text-fig-sm font-semibold text-text">
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
                        meta={metaFor(bill)}
                        amount={formatMoney(bill.amount ?? 0, money)}
                        perPeriod={perPeriodLabel(bill, frequency, money, unit)}
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
        </Card>
    );
};
