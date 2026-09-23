import type { ReactNode } from "react";
import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import { CountChips } from "@/features/plan/components/CountChips";

export interface PlanHeaderProps {
    /** What has to move each period across every category, owner-filtered. */
    total: number;
    unit: string;
    money: MoneyFormat;
    categoryCount: number;
    potCount: number;
    billCount: number;
    setAsideCount: number;
    /** The page-wide filters: the owner chips, and on a phone the category
     *  picker. They narrow everything below, so they live up here rather than
     *  in whichever category happens to come first. */
    children: ReactNode;
}

export const PlanHeader = ({
    total,
    unit,
    money,
    categoryCount,
    potCount,
    billCount,
    setAsideCount,
    children,
}: PlanHeaderProps) => (
    <header className="border-b border-border-strong pb-5 xl:max-w-[1120px]">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
                <h1 className="font-display text-h1 font-medium leading-tight">
                    Plan
                </h1>
                <div className="mt-2">
                    <CountChips
                        categories={categoryCount}
                        pots={potCount}
                        bills={billCount}
                        setAsides={setAsideCount}
                    />
                </div>
            </div>
            <div className="tabular text-fig-lg font-semibold">
                {formatMoney(total, money)}
                <span className="ml-1 text-sm font-normal text-text-muted">
                    {unit}
                </span>
            </div>
        </div>
        <div className="mt-5 flex flex-col gap-3">{children}</div>
    </header>
);
