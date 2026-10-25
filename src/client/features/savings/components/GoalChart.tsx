import {
    Area,
    CartesianGrid,
    ComposedChart,
    Line,
    ReferenceDot,
    ReferenceLine,
    ResponsiveContainer,
    Scatter,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { formatMoney } from "@shared/money";
import { periodUnitLabel } from "@shared/period";
import {
    neededSteps,
    outcomeFor,
    planLines,
    projection,
    type SavingsPlanBalance,
    type SavingsPlanInput,
} from "@shared/savings";
import type { MoneyFormat } from "@/useMoney";

export interface GoalChartProps {
    input: SavingsPlanInput;
    balanceNow: number;
    /** A second projection to compare, or null when it matches the current one. */
    whatIf: number | null;
    money: MoneyFormat;
    formatDate: (iso: string) => string;
}

interface Row {
    t: number;
    balance?: number;
    projected?: number;
    whatIf?: number;
    needed?: number;
}

const time = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);

const SERIES_LABEL: Record<string, string> = {
    balance: "In the pot",
    projected: "At what's going in",
    whatIf: "What if",
    needed: "Needed by then",
};

/** Recorded balances, the projection from today and the staircase of what each
 *  deadline needs, on one time axis. Kept apart from the page so recharts loads
 *  in its own chunk. */
export const GoalChart = ({
    input,
    balanceNow,
    whatIf,
    money,
    formatDate,
}: GoalChartProps) => {
    const rows = new Map<number, Row>();
    const at = (iso: string): Row => {
        const t = time(iso);
        const row = rows.get(t) ?? { t };
        rows.set(t, row);
        return row;
    };

    const recorded: SavingsPlanBalance[] = input.balances.filter(
        (b) => b.asOfDate <= input.today
    );
    for (const b of recorded) at(b.asOfDate).balance = b.amount;
    if (recorded.length > 0) at(input.today).balance = balanceNow;
    for (const p of projection(input, input.contribution))
        at(p.date).projected = p.amount;
    if (whatIf !== null)
        for (const p of projection(input, whatIf)) at(p.date).whatIf = p.amount;
    for (const step of neededSteps(input)) at(step.date).needed = step.amount;

    const data = [...rows.values()].sort((a, b) => a.t - b.t);
    // Ticks on each January and July: the data's own dates bunch up around today.
    const first = new Date(data[0]!.t).getUTCFullYear();
    const last = data.at(-1)!.t;
    const years = new Date(last).getUTCFullYear() - first + 1;
    const ticks = Array.from({ length: years * 2 }, (_, i) =>
        Date.UTC(first + Math.floor(i / 2), (i % 2) * 6, 1)
    ).filter((t) => t >= data[0]!.t && t <= last);
    const projectedEnd = projection(input, input.contribution).at(-1)!.amount;
    const whatIfEnd =
        whatIf === null ? null : projection(input, whatIf).at(-1)!.amount;
    const { required, short } = outcomeFor(input, input.contribution);
    const missed = new Set(short.map((line) => line.due));
    // A deadline the current amount misses is drawn in the warning colour.
    const deadlines = [...new Set(planLines(input).map((l) => l.due))]
        .filter((due) => due >= input.today)
        .map((due) => ({
            t: time(due),
            y: 0,
            missed: missed.has(due),
            names: planLines(input)
                .filter((l) => l.due === due)
                .map((l) => l.name)
                .join(", "),
        }));
    const unit = periodUnitLabel(input.period.frequency);
    const by = formatDate(input.targetDate);
    // Axis labels in whole units: £15,000, not £15,000.00.
    const whole = (minor: number) =>
        formatMoney(Math.round(minor / 10 ** money.decimalPlaces), {
            ...money,
            decimalPlaces: 0,
        });
    const tickDate = (t: number) =>
        new Date(t).toLocaleDateString(undefined, {
            month: "short",
            year: "2-digit",
            timeZone: "UTC",
        });

    return (
        <div className="flex flex-col gap-1.5">
            <ul className="m-0 grid list-none grid-cols-1 gap-x-5 gap-y-1 p-0 text-xs text-text-secondary sm:grid-cols-2">
                <li className="flex items-center gap-2">
                    <i className="inline-block w-[18px] shrink-0 border-t-2 border-primary" />
                    <span>
                        In the pot{" "}
                        <strong className="tabular font-semibold text-text">
                            {formatMoney(balanceNow, money)}
                        </strong>{" "}
                        now
                    </span>
                </li>
                <li className="flex items-center gap-2">
                    <i className="inline-block h-2.5 w-[18px] shrink-0 border-t-[1.5px] border-text-faint bg-text-faint/15" />
                    <span>
                        Needs{" "}
                        <strong className="tabular font-semibold text-text">
                            {formatMoney(required, money)}
                        </strong>{" "}
                        by {by}, stepping up at each deadline
                    </span>
                </li>
                <li className="flex items-center gap-2">
                    <i className="inline-block w-[18px] shrink-0 border-t-2 border-dashed border-primary" />
                    <span>
                        At {formatMoney(input.contribution, money)}
                        {unit}:{" "}
                        <strong className="tabular font-semibold text-text">
                            {formatMoney(projectedEnd, money)}
                        </strong>{" "}
                        by {by}
                    </span>
                </li>
                {whatIf !== null && whatIfEnd !== null && (
                    <li className="flex items-center gap-2">
                        <i className="inline-block w-[18px] shrink-0 border-t-2 border-dashed border-savings-fg" />
                        <span>
                            What if {formatMoney(whatIf, money)}
                            {unit}:{" "}
                            <strong className="tabular font-semibold text-text">
                                {formatMoney(whatIfEnd, money)}
                            </strong>{" "}
                            by {by}
                        </span>
                    </li>
                )}
            </ul>
            <p className="text-xs text-text-muted">
                On track while a dotted line stays above the shaded steps.
                {missed.size > 0 &&
                    " Orange markers are deadlines the current amount misses."}
            </p>
            <ResponsiveContainer width="100%" height={280}>
                <ComposedChart
                    data={data}
                    margin={{ top: 16, right: 8, bottom: 0, left: 0 }}
                >
                    <CartesianGrid vertical={false} stroke="var(--color-border)" />
                    <XAxis
                        dataKey="t"
                        type="number"
                        scale="time"
                        domain={["dataMin", "dataMax"]}
                        ticks={ticks}
                        tickFormatter={tickDate}
                        tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
                        stroke="var(--color-border-strong)"
                        minTickGap={32}
                    />
                    <YAxis
                        domain={[0, "auto"]}
                        tickFormatter={whole}
                        tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
                        stroke="transparent"
                        width={64}
                    />
                    <Tooltip
                        labelFormatter={(t) =>
                            formatDate(new Date(Number(t)).toISOString().slice(0, 10))
                        }
                        formatter={(value, name, item) =>
                            name === "Deadline"
                                ? [String(item.payload?.names ?? ""), "Due"]
                                : [
                                      formatMoney(Number(value), money),
                                      SERIES_LABEL[String(name)] ?? String(name),
                                  ]
                        }
                        contentStyle={{
                            background: "var(--color-raised)",
                            border: "1px solid var(--color-border)",
                            borderRadius: 4,
                            fontSize: 12,
                        }}
                    />
                    <Area
                        dataKey="needed"
                        type="stepAfter"
                        connectNulls
                        stroke="var(--color-text-faint)"
                        strokeWidth={1.5}
                        fill="var(--color-text-faint)"
                        fillOpacity={0.14}
                        isAnimationActive={false}
                    />
                    <ReferenceLine
                        x={time(input.today)}
                        stroke="var(--color-border-strong)"
                        label={{
                            value: "Today",
                            position: "insideBottomRight",
                            fill: "var(--color-text-muted)",
                            fontSize: 11,
                        }}
                    />
                    {whatIf !== null && (
                        <Line
                            dataKey="whatIf"
                            type="stepAfter"
                            connectNulls
                            stroke="var(--color-savings-fg)"
                            strokeWidth={2}
                            strokeDasharray="5 4"
                            dot={false}
                            isAnimationActive={false}
                        />
                    )}
                    <Line
                        dataKey="projected"
                        type="stepAfter"
                        connectNulls
                        stroke="var(--color-primary)"
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        dot={false}
                        isAnimationActive={false}
                    />
                    {/* Where each dotted line ends up; the legend gives the figure. */}
                    <ReferenceDot
                        x={time(input.targetDate)}
                        y={projectedEnd}
                        r={3.5}
                        fill="var(--color-primary)"
                        stroke="none"
                    />
                    {whatIfEnd !== null && (
                        <ReferenceDot
                            x={time(input.targetDate)}
                            y={whatIfEnd}
                            r={3.5}
                            fill="var(--color-savings-fg)"
                            stroke="none"
                        />
                    )}
                    <Line
                        dataKey="balance"
                        connectNulls
                        stroke="var(--color-primary)"
                        strokeWidth={2.25}
                        dot={{ r: 3, fill: "var(--color-primary)", strokeWidth: 0 }}
                        isAnimationActive={false}
                    />
                    <Scatter
                        data={deadlines.filter((d) => !d.missed)}
                        dataKey="y"
                        name="Deadline"
                        shape="diamond"
                        fill="var(--color-text-faint)"
                        legendType="none"
                        isAnimationActive={false}
                    />
                    <Scatter
                        data={deadlines.filter((d) => d.missed)}
                        dataKey="y"
                        name="Deadline"
                        shape="diamond"
                        fill="var(--color-attention)"
                        legendType="none"
                        isAnimationActive={false}
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
};
