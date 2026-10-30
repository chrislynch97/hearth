import { Progress } from "@microcharts/react/progress";
import { Sparkline } from "@microcharts/react/sparkline";
import { formatMoney, fromMinor } from "@shared/money";
import { downloadCsv } from "@/csv";
import { moneyFormat, shareSummary } from "@/microcharts";
import type { MoneyFormat } from "@/useMoney";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/shadcn/card";
import {
    Table,
    TableBody,
    TableCell,
    TableFooter,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/shadcn/table";
import {
    PeriodStepper,
    type PeriodStepperProps,
} from "@/components/ui/PeriodStepper";
import { categorySpend, monthLabel, pct, type Report } from "../model";
import { ExportButton } from "./ExportButton";

export interface CategorySpendCardProps {
    report: Report;
    money: MoneyFormat;
    /** The plan is the household's, so it only compares with everyone's spend. */
    showPlan: boolean;
    period: PeriodStepperProps;
}

/** Where one period's money went: each category against its plan and its own
 *  recent trend. */
export const CategorySpendCard = ({
    report,
    money,
    showPlan,
    period,
}: CategorySpendCardProps) => {
    const rows = categorySpend(report);
    const { total } = report.categoryBreakdown;
    const { months } = report.monthOverMonth;
    const fmt = moneyFormat(money);
    const dp = money.decimalPlaces;

    const exportCsv = () =>
        downloadCsv("spending-by-category.csv", [
            ["Category", "Spent", "Planned", "% of spend", ...months],
            ...rows.map((r) => [
                r.name,
                fromMinor(r.spent, dp),
                fromMinor(r.planned, dp),
                pct(r.spent, total),
                ...r.byMonth.map((v) => fromMinor(v, dp)),
            ]),
        ]);

    return (
        <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex w-full flex-col gap-2 sm:w-auto">
                    <CardTitle>Where it went</CardTitle>
                    <PeriodStepper {...period} />
                </div>
                <ExportButton onClick={exportCsv} />
            </CardHeader>
            <CardContent>
                {rows.length === 0 ? (
                    <p className="text-base text-text-muted">
                        No spending in this period.
                    </p>
                ) : (
                    <Table className="text-base">
                        <TableHeader>
                            <TableRow className="hover:bg-transparent">
                                <TableHead>Category</TableHead>
                                <TableHead className="hidden sm:table-cell">
                                    Trend
                                </TableHead>
                                <TableHead className="hidden sm:table-cell">
                                    Share
                                </TableHead>
                                {showPlan && (
                                    <TableHead className="hidden text-right sm:table-cell">
                                        Planned
                                    </TableHead>
                                )}
                                <TableHead className="text-right">
                                    Spent
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((r) => {
                                const over =
                                    showPlan &&
                                    r.planned > 0 &&
                                    r.spent > r.planned;
                                return (
                                    <TableRow
                                        key={r.categoryId ?? "uncategorised"}
                                    >
                                        <TableCell className="whitespace-normal">
                                            <span className="text-text">
                                                {r.name}
                                            </span>
                                            {showPlan && r.planned > 0 && (
                                                <span className="block text-sm text-text-muted sm:hidden">
                                                    of{" "}
                                                    {formatMoney(
                                                        r.planned,
                                                        money
                                                    )}{" "}
                                                    planned
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="hidden sm:table-cell">
                                            {/* Each row fits its own scale: the
                                                read is "is this creeping up?". */}
                                            <Sparkline
                                                data={r.byMonth}
                                                width={64}
                                                height={18}
                                                fill
                                                format={fmt}
                                                title={`${r.name}, ${monthLabel(months[0] ?? "")} to ${monthLabel(months.at(-1) ?? "")}`}
                                            />
                                        </TableCell>
                                        <TableCell className="hidden sm:table-cell">
                                            <Progress
                                                value={r.spent}
                                                max={Math.max(1, total)}
                                                width={80}
                                                height={14}
                                                title={r.name}
                                                summary={shareSummary(
                                                    r.spent,
                                                    total,
                                                    "spending this period"
                                                )}
                                            />
                                        </TableCell>
                                        {showPlan && (
                                            <TableCell className="tabular hidden text-right text-text-muted sm:table-cell">
                                                {r.planned > 0
                                                    ? formatMoney(
                                                          r.planned,
                                                          money
                                                      )
                                                    : "—"}
                                            </TableCell>
                                        )}
                                        <TableCell
                                            className={`tabular text-right font-medium ${over ? "text-danger" : "text-text"}`}
                                        >
                                            {formatMoney(r.spent, money)}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                        <TableFooter className="border-t-2 border-border-strong bg-transparent font-semibold">
                            <TableRow className="bg-sunken hover:bg-sunken">
                                {/* One spanning cell would hold the hidden columns' width on a phone. */}
                                <TableCell className="sm:hidden">
                                    Total
                                </TableCell>
                                <TableCell
                                    colSpan={showPlan ? 4 : 3}
                                    className="hidden sm:table-cell"
                                >
                                    Total
                                </TableCell>
                                <TableCell className="tabular text-right">
                                    {formatMoney(total, money)}
                                </TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
};
