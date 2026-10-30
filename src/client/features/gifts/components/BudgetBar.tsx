import { SegmentedBar } from "@microcharts/react/segmented-bar";
import { formatMoney } from "@shared/money";
import { useElementWidth } from "@/useElementWidth";
import { useMoney } from "@/useMoney";
import { Card, CardContent } from "@/components/shadcn/card";
import {
    budgetSegments,
    type BudgetTone,
    type GiftTotals,
} from "@/features/gifts/model";

export interface BudgetBarProps {
    totals: GiftTotals;
    /** What the people's own budgets add up to. */
    allocated: number;
}

// Fills go through microcharts' `colors`, which it applies as CSS, so the
// tokens follow the theme.
const FILL: Record<BudgetTone, string> = {
    spent: "var(--color-primary)",
    over: "var(--color-attention)",
    idea: "var(--color-border-strong)",
    left: "var(--color-sunken)",
};

const KEY: Record<BudgetTone, string> = {
    spent: "bg-primary",
    over: "bg-attention",
    idea: "bg-border-strong",
    left: "border border-border-strong bg-sunken",
};

/** The occasion at a glance: one bar for where the budget has gone, and the
 *  figures under it. */
export const BudgetBar = ({ totals, allocated }: BudgetBarProps) => {
    const money = useMoney();
    const { ref, width } = useElementWidth<HTMLDivElement>();

    const segments = budgetSegments(totals);
    const over = totals.left !== null && totals.left < 0;
    const figures = [
        { tone: "spent" as const, label: "Spent", value: totals.spent },
        ...(over
            ? [{ tone: "over" as const, label: "Over", value: -totals.left! }]
            : []),
        { tone: "idea" as const, label: "Ideas", value: totals.planned },
    ];

    return (
        <Card>
            <CardContent className="flex flex-col gap-2">
                <div
                    ref={ref}
                    className="h-2.5 overflow-hidden rounded-xs bg-sunken"
                >
                    {width > 0 && segments.length > 0 && (
                        <SegmentedBar
                            data={segments}
                            colors={segments.map(
                                (segment) => FILL[segment.tone]
                            )}
                            label="none"
                            className="block"
                            width={width}
                            height={10}
                            title="Where the budget has gone"
                            summary={segments
                                .map(
                                    (segment) =>
                                        `${segment.label} ${formatMoney(segment.value, money)}`
                                )
                                .join(", ")}
                        />
                    )}
                </div>
                <dl className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-secondary">
                    {figures.map((figure) => (
                        <div
                            key={figure.label}
                            className="flex items-center gap-1.5"
                        >
                            <span
                                aria-hidden="true"
                                className={`h-2 w-2 rounded-xs ${KEY[figure.tone]}`}
                            />
                            <dt>{figure.label}</dt>
                            <dd
                                className={`m-0 tabular font-semibold ${figure.tone === "over" ? "text-attention-fg" : "text-text"}`}
                            >
                                {formatMoney(figure.value, money)}
                            </dd>
                        </div>
                    ))}
                    {totals.budget === null ? (
                        <div className="text-text-muted">No budget set</div>
                    ) : (
                        <div className="flex items-center gap-1.5">
                            <span
                                aria-hidden="true"
                                className={`h-2 w-2 rounded-xs ${KEY.left}`}
                            />
                            <dt>Left</dt>
                            <dd className="m-0 tabular font-semibold text-text">
                                {formatMoney(
                                    Math.max(0, totals.left ?? 0),
                                    money
                                )}
                            </dd>
                            <dd className="m-0 tabular text-text-muted">
                                of {formatMoney(totals.budget, money)}
                            </dd>
                        </div>
                    )}
                    {allocated > 0 && (
                        <div className="flex items-center gap-1.5 text-text-muted">
                            <dt>Given to people</dt>
                            <dd className="m-0 tabular">
                                {formatMoney(allocated, money)}
                            </dd>
                        </div>
                    )}
                </dl>
            </CardContent>
        </Card>
    );
};
