import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/shadcn/card";
import {
    BreakdownTable,
    type BreakdownRow,
} from "@/components/ui/BreakdownTable";
import { StatFigure } from "@/components/ui/StatFigure";
import type { DashboardSummary } from "@/features/home/model";

export interface PeriodSnapshotProps {
    funding: DashboardSummary["funding"];
    coupleSurplus: number;
    money: MoneyFormat;
}

/** This period in one card: what comes in, what's spoken for and what's left,
 *  then the same split person by person. */
export const PeriodSnapshot = ({
    funding,
    coupleSurplus,
    money,
}: PeriodSnapshotProps) => {
    const { perPerson, jointFundingModel, jointPool, jointPotFundingTotal } =
        funding;

    if (perPerson.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>This period</CardTitle>
                    <CardDescription>
                        Add your income and outgoings to see what's coming in
                        and what's left.
                    </CardDescription>
                </CardHeader>
            </Card>
        );
    }

    const pooled = jointFundingModel === "pooled";
    const together = perPerson.length > 1;
    const fmt = (amount: number) => formatMoney(amount, money);
    // A person column per member, plus a household one when there's more
    // than one of them.
    const cells = (pick: (p: (typeof perPerson)[number]) => number) => {
        const values = perPerson.map(pick);
        const sum = values.reduce((a, b) => a + b, 0);
        return [...values, ...(together ? [sum] : [])].map((v) => (
            <span className={v < 0 ? "text-danger" : undefined}>{fmt(v)}</span>
        ));
    };
    const householdOnly = (amount: number) => [
        ...perPerson.map(() => null),
        ...(together ? [fmt(amount)] : []),
    ];

    const income = perPerson.reduce((sum, p) => sum + p.periodIncome, 0);
    const rows: BreakdownRow[] = [
        { label: "Income", values: cells((p) => p.periodIncome) },
        ...(perPerson.some((p) => p.personalMainAccount > 0)
            ? [
                  {
                      label: "Paid from own account",
                      values: cells((p) => p.personalMainAccount),
                  },
              ]
            : []),
        ...(pooled
            ? [
                  {
                      label: "Personal set aside",
                      values: cells((p) => p.personalPotFunding),
                  },
                  {
                      label: "Into joint",
                      values: cells((p) => p.jointContribution),
                      total: true,
                  },
                  {
                      label: "Joint costs",
                      values: householdOnly(jointPool.jointCosts),
                  },
              ]
            : [
                  { label: "Set aside", values: cells((p) => p.setAside) },
                  {
                      label: "Remainder",
                      values: cells((p) => p.remainder),
                      total: true,
                  },
              ]),
    ];

    return (
        <Card>
            <CardHeader>
                <CardTitle>This period</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
                <div className="grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-4">
                    <StatFigure label="Coming in" value={fmt(income)} />
                    <StatFigure
                        label="Spoken for"
                        value={fmt(income - coupleSurplus)}
                        hint={
                            pooled
                                ? undefined
                                : `${fmt(jointPotFundingTotal)} to joint pots`
                        }
                    />
                    <StatFigure
                        label="Left over"
                        value={fmt(coupleSurplus)}
                        tone={coupleSurplus < 0 ? "danger" : "positive"}
                    />
                </div>
                <BreakdownTable
                    caption="This period by person"
                    columns={[
                        ...perPerson.map((p) => p.displayName),
                        ...(together ? ["Together"] : []),
                    ]}
                    rows={rows}
                />
            </CardContent>
        </Card>
    );
};
