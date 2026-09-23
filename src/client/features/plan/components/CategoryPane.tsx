import { formatMoney } from "@shared/money";
import type { PeriodFrequency } from "@shared/period";
import type { MoneyFormat } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { PlusIcon } from "@/components/ui/PlusIcon";
import { MainAccountCard } from "@/features/plan/components/MainAccountCard";
import { CountChips } from "@/features/plan/components/CountChips";
import { PotCard } from "@/features/plan/components/PotCard";
import {
    countBills,
    countSetAsides,
    type PlanGroup,
} from "@/features/plan/model";
import type { Expense, Pot, SetAside } from "../../../../server/db/schema";

export interface CategoryPaneProps {
    group: PlanGroup;
    money: MoneyFormat;
    frequency: PeriodFrequency;
    unit: string;
    /** Stale standing orders, by pot id. */
    staleByPot: Map<string, { wasMonthly: number }>;
    acknowledgingPotId: string | null;
    onAcknowledge: (potId: string) => void;
    onEditCategory: () => void;
    onAddPot: () => void;
    onEditPot: (pot: Pot) => void;
    onAddSetAside: (pot: Pot) => void;
    onEditSetAside: (pot: Pot, setAside: SetAside) => void;
    onAddBill: (potId: string | null) => void;
    onEditBill: (bill: Expense) => void;
}

export const CategoryPane = ({
    group,
    money,
    frequency,
    unit,
    staleByPot,
    acknowledgingPotId,
    onAcknowledge,
    onEditCategory,
    onAddPot,
    onEditPot,
    onAddSetAside,
    onEditSetAside,
    onAddBill,
    onEditBill,
}: CategoryPaneProps) => {
    const isEmpty = group.pots.length === 0 && group.mainBills.length === 0;

    return (
        <section>
            {/* A band rather than a bare heading, so each category reads as the
                start of a section on the All view and as a header on its own.
                Laid out like a pot card's header — name left, total and Edit
                right — one level up. */}
            <header className="flex items-center gap-3 rounded-md border border-border bg-sunken px-4 py-3">
                <div className="min-w-0 flex-1">
                    <h2 className="font-display text-h3 font-medium leading-tight">
                        {group.name}
                    </h2>
                    <div className="mt-1.5">
                        <CountChips
                            pots={group.pots.length}
                            bills={countBills(group)}
                            setAsides={countSetAsides(group)}
                        />
                    </div>
                </div>
                <div className="tabular shrink-0 text-fig font-semibold">
                    {formatMoney(group.perPeriod, money)}
                    <span className="ml-1 text-xs font-normal text-text-muted">
                        {unit}
                    </span>
                </div>
                {group.categoryId && (
                    <Button
                        variant="ghost"
                        compact
                        aria-label={`Edit ${group.name} category`}
                        onClick={onEditCategory}
                    >
                        Edit
                    </Button>
                )}
            </header>

            <div className="mt-3 flex flex-col md:flex-row md:justify-end">
                {/* On a phone each button gets a full-width row — "Bill with no
                    pot" is too long to share one. From md they sit right, sized
                    to their labels. */}
                <div className="flex flex-col gap-2 md:flex-row">
                    <Button icon={<PlusIcon />} onClick={onAddPot}>
                        New pot
                    </Button>
                    {group.mainBills.length === 0 && (
                        <Button
                            variant="dashed"
                            icon={<PlusIcon />}
                            onClick={() => onAddBill(null)}
                        >
                            Bill with no pot
                        </Button>
                    )}
                </div>
            </div>

            <div className="mt-4 flex flex-col gap-3">
                {group.pots.map((planPot) => (
                    <PotCard
                        key={planPot.pot.id}
                        planPot={planPot}
                        money={money}
                        frequency={frequency}
                        unit={unit}
                        staleStandingOrder={staleByPot.get(planPot.pot.id)}
                        acknowledging={acknowledgingPotId === planPot.pot.id}
                        onAcknowledge={() => onAcknowledge(planPot.pot.id)}
                        onEditPot={() => onEditPot(planPot.pot)}
                        onAddBill={() => onAddBill(planPot.pot.id)}
                        onEditBill={onEditBill}
                        onAddSetAside={() => onAddSetAside(planPot.pot)}
                        onEditSetAside={(setAside) =>
                            onEditSetAside(planPot.pot, setAside)
                        }
                    />
                ))}

                {group.mainBills.length > 0 && (
                    <MainAccountCard
                        bills={group.mainBills}
                        money={money}
                        frequency={frequency}
                        unit={unit}
                        onAddBill={() => onAddBill(null)}
                        onEditBill={onEditBill}
                    />
                )}

                {isEmpty && (
                    <p className="text-sm text-text-muted">
                        Nothing here yet — add a pot, or a bill that comes
                        straight out of the main account.
                    </p>
                )}
            </div>
        </section>
    );
};
