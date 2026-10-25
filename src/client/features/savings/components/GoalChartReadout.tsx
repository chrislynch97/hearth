import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { ChevronIcon } from "@/components/ui/ChevronIcon";
import { inTime, type ChartMoment } from "@/features/savings/chart";

export interface GoalChartReadoutProps {
    id: string;
    moment: ChartMoment;
    hasPrevious: boolean;
    hasNext: boolean;
    /** Move one date earlier (-1) or later (1). */
    onStep: (delta: number) => void;
    today: string;
    /** What's going in now and the what-if amount, per period, to name the rows. */
    contribution: number;
    whatIfAmount: number | null;
    /** The household's per-period suffix, e.g. `/mo`. */
    unit: string;
    money: MoneyFormat;
    formatDate: (iso: string) => string;
}

/** The chart read at one date, in words and figures: nothing on the chart
 *  needs a hover, and the arrows step through every date on a phone too. */
export const GoalChartReadout = ({
    id,
    moment,
    hasPrevious,
    hasNext,
    onStep,
    today,
    contribution,
    whatIfAmount,
    unit,
    money,
    formatDate,
}: GoalChartReadoutProps) => {
    const isToday = moment.kind === "today";
    const title = isToday
        ? "Today"
        : `${formatDate(moment.date)} · ${inTime(today, moment.date)}`;

    const status = (pot: number) =>
        moment.needed === 0 ? null : pot >= moment.needed ? (
            <span className="text-xs text-text-muted">✓ covered</span>
        ) : (
            <span className="whitespace-nowrap rounded-xs bg-attention-tint px-1.5 text-xs font-semibold text-attention-fg">
                {formatMoney(moment.needed - pot, money)} short
            </span>
        );

    return (
        <section
            id={id}
            aria-live="polite"
            className="mx-auto flex w-full max-w-md flex-col gap-2 rounded-md border border-border bg-bg px-2.5 py-2"
        >
            <div className="flex items-center gap-1">
                <Button
                    variant="ghost"
                    aria-label="Previous date"
                    icon={<ChevronIcon direction="left" />}
                    disabled={!hasPrevious}
                    onClick={() => onStep(-1)}
                    className="px-2"
                />
                <p className="min-w-0 flex-1 text-center text-sm font-semibold text-text">
                    {title}
                </p>
                <Button
                    variant="ghost"
                    aria-label="Next date"
                    icon={<ChevronIcon direction="right" />}
                    disabled={!hasNext}
                    onClick={() => onStep(1)}
                    className="px-2"
                />
            </div>

            {moment.due.length > 0 && (
                <ul className="m-0 flex list-none flex-col gap-0.5 px-1 text-sm">
                    {isToday && (
                        <li className="text-xs text-text-muted">Due by now</li>
                    )}
                    {moment.due.map((due, i) => (
                        <li key={`${due.name}-${i}`} className="flex justify-between gap-3">
                            <span className="min-w-0 [overflow-wrap:anywhere]">
                                {due.name}
                            </span>
                            <span className="tabular">{formatMoney(due.amount, money)}</span>
                        </li>
                    ))}
                </ul>
            )}
            {moment.kind === "goal" && (
                <p className="px-1 text-sm text-text-muted">
                    The goal date. Nothing else falls due on it.
                </p>
            )}

            <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1 border-t border-border px-1 pt-2 text-sm">
                <dt className="flex items-center gap-2 text-text-secondary">
                    <i className="inline-block w-3.5 shrink-0 border-t-[1.5px] border-text-faint" />
                    {isToday ? "Needed by now" : "Needed by then"}
                </dt>
                <dd className="tabular m-0 text-right font-semibold text-text">
                    {formatMoney(moment.needed, money)}
                </dd>
                <dd className="m-0" />

                <dt className="flex items-center gap-2 text-text-secondary">
                    <i className="inline-block w-3.5 shrink-0 border-t-2 border-primary/70" />
                    {isToday
                        ? "In the pot now"
                        : `At ${formatMoney(contribution, money)}${unit}`}
                </dt>
                <dd className="tabular m-0 text-right font-semibold text-text">
                    {formatMoney(moment.pot, money)}
                </dd>
                <dd className="m-0 text-right">{status(moment.pot)}</dd>

                {!isToday && moment.whatIf !== null && whatIfAmount !== null && (
                    <>
                        <dt className="flex items-center gap-2 text-text-secondary">
                            <i className="inline-block w-3.5 shrink-0 border-t-2 border-savings-fg" />
                            What if {formatMoney(whatIfAmount, money)}
                            {unit}
                        </dt>
                        <dd className="tabular m-0 text-right font-semibold text-text">
                            {formatMoney(moment.whatIf, money)}
                        </dd>
                        <dd className="m-0 text-right">{status(moment.whatIf)}</dd>
                    </>
                )}
            </dl>
        </section>
    );
};
