import { SegmentedBar } from "@microcharts/react/segmented-bar";
import { formatMoney } from "@shared/money";
import { moneyFormat } from "@/microcharts";
import type { MoneyFormat } from "@/useMoney";
import { useElementWidth } from "@/useElementWidth";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/shadcn/card";
import { allocationShares } from "@/features/home/allocationShares";
import type { DashboardSummary } from "@/features/home/model";

export interface AllocationCardProps {
    allocation: DashboardSummary["allocation"];
    householdIncome: number;
    money: MoneyFormat;
}

// Static so Tailwind sees them; index N matches the bar's Nth segment.
const SWATCHES = [
    "bg-[var(--mc-cat-1)]",
    "bg-[var(--mc-cat-2)]",
    "bg-[var(--mc-cat-3)]",
    "bg-[var(--mc-cat-4)]",
    "bg-[var(--mc-cat-5)]",
    "bg-[var(--mc-cat-6)]",
];

// Used until the first measurement lands, and anywhere ResizeObserver never
// fires (a hidden tab, say) — the bar is narrow but never broken.
const FALLBACK_WIDTH = 300;

const percent = (share: number) => `${Math.round(share * 100)}%`;

/** Where the income goes: one bar split by category, and a legend giving each
 *  its amount and share of income. */
export const AllocationCard = ({
    allocation,
    householdIncome,
    money,
}: AllocationCardProps) => {
    const { ref, width } = useElementWidth<HTMLDivElement>();

    const shares = allocationShares(allocation.perCategory, householdIncome);
    if (shares.length === 0) return null;

    const allocated =
        householdIncome > 0 ? allocation.total / householdIncome : 0;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Allocation by category</CardTitle>
                <CardDescription className="tabular">
                    {formatMoney(allocation.total, money)} allocated
                    {householdIncome > 0 &&
                        ` · ${percent(allocated)} of ${formatMoney(householdIncome, money)} income`}
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <div ref={ref}>
                    <SegmentedBar
                        data={shares.map((s) => ({
                            label: s.label,
                            value: s.amount,
                        }))}
                        order="data"
                        maxSegments={SWATCHES.length}
                        label="none"
                        width={width || FALLBACK_WIDTH}
                        height={14}
                        format={moneyFormat(money)}
                        title="Allocation by category"
                    />
                </div>
                <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                    {shares.map((s, i) => (
                        <li
                            key={s.label}
                            className="flex items-center gap-2 text-base"
                        >
                            <span
                                aria-hidden="true"
                                className={`size-2.5 shrink-0 rounded-xs ${SWATCHES[i]}`}
                            />
                            <span className="min-w-0 flex-1 truncate text-text-secondary">
                                {s.label}
                            </span>
                            <span className="tabular">
                                {formatMoney(s.amount, money)}
                            </span>
                            <span className="tabular w-9 text-right text-sm text-text-muted">
                                {percent(s.share)}
                            </span>
                        </li>
                    ))}
                </ul>
            </CardContent>
        </Card>
    );
};
