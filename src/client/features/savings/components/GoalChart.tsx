import { useId, useState } from "react";
import { periodUnitLabel } from "@shared/period";
import { outcomeFor, type SavingsPlanInput } from "@shared/savings";
import { useElementWidth } from "@/useElementWidth";
import type { MoneyFormat } from "@/useMoney";
import {
    SegmentedControl,
    type SegmentedOption,
} from "@/components/ui/SegmentedControl";
import { GoalChartLegend } from "@/features/savings/components/GoalChartLegend";
import { GoalChartPlot } from "@/features/savings/components/GoalChartPlot";
import { GoalChartReadout } from "@/features/savings/components/GoalChartReadout";
import {
    chartMoments,
    chartSeries,
    deadlineWindow,
    defaultMoment,
    time,
} from "@/features/savings/chart";

export interface GoalChartProps {
    input: SavingsPlanInput;
    balanceNow: number;
    /** A second projection to compare, or null when it matches the current one. */
    whatIf: number | null;
    money: MoneyFormat;
    formatDate: (iso: string) => string;
}

type Range = "plan" | "deadlines";

const RANGES: SegmentedOption<Range>[] = [
    { value: "plan", label: "Whole plan" },
    { value: "deadlines", label: "Deadlines" },
];

/** Recorded balances, the projection from today and what each deadline needs,
 *  on one time axis, read at one date at a time in the panel underneath. */
export const GoalChart = ({
    input,
    balanceNow,
    whatIf,
    money,
    formatDate,
}: GoalChartProps) => {
    const [range, setRange] = useState<Range>("plan");
    const [picked, setPicked] = useState<string | null>(null);
    // The chart fills its column, so the column's width is the plot's.
    const { ref, width } = useElementWidth<HTMLDivElement>();
    const readoutId = useId();

    const series = chartSeries(input, balanceNow, whatIf);
    const windowStart = deadlineWindow(input);
    const zoomed = range === "deadlines" && windowStart !== null;
    const start = zoomed ? time(windowStart) : series.start;
    const end = zoomed ? time(input.targetDate) : series.end;
    const moments = chartMoments(input, whatIf).filter(
        (m) => time(m.date) >= start && time(m.date) <= end
    );
    const selected =
        moments.find((m) => m.date === picked) ?? defaultMoment(moments);
    const index = selected ? moments.indexOf(selected) : -1;
    const step = (delta: number) => {
        const next = moments[index + delta];
        if (next) setPicked(next.date);
    };

    const outcome = outcomeFor(input, input.contribution);
    const whatIfOutcome = whatIf === null ? null : outcomeFor(input, whatIf);
    const unit = periodUnitLabel(input.period.frequency);
    const missed = moments.some((m) => m.kind === "deadline" && m.pot < m.needed);

    return (
        <div ref={ref} className="flex flex-col gap-2">
            <GoalChartLegend
                balanceNow={balanceNow}
                required={outcome.required}
                by={formatDate(input.targetDate)}
                unit={unit}
                current={{
                    contribution: input.contribution,
                    final: outcome.final,
                    interest: outcome.interest,
                }}
                whatIf={
                    whatIf === null || whatIfOutcome === null
                        ? null
                        : {
                              contribution: whatIf,
                              final: whatIfOutcome.final,
                              interest: whatIfOutcome.interest,
                          }
                }
                money={money}
            />
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                <p className="text-xs text-text-muted">
                    On track while the pot's line stays above the grey steps.
                    {missed && " Orange dots are deadlines the current amount misses."}
                </p>
                {windowStart !== null && (
                    <SegmentedControl
                        label="Chart range"
                        options={RANGES}
                        value={zoomed ? "deadlines" : "plan"}
                        onChange={setRange}
                    />
                )}
            </div>
            {width > 0 ? (
                <GoalChartPlot
                    width={width}
                    series={series}
                    moments={moments}
                    selected={selected}
                    onSelect={(moment) => setPicked(moment.date)}
                    onStep={step}
                    start={start}
                    end={end}
                    today={time(input.today)}
                    money={money}
                    describedBy={readoutId}
                />
            ) : (
                <div className="h-[260px]" />
            )}
            {selected && (
                <GoalChartReadout
                    id={readoutId}
                    moment={selected}
                    hasPrevious={index > 0}
                    hasNext={index < moments.length - 1}
                    onStep={step}
                    today={input.today}
                    contribution={input.contribution}
                    whatIfAmount={whatIf}
                    unit={unit}
                    money={money}
                    formatDate={formatDate}
                />
            )}
        </div>
    );
};
