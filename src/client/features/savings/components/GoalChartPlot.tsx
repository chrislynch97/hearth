import { useId, type KeyboardEvent, type PointerEvent } from "react";
import type { MoneyFormat } from "@/useMoney";
import {
    axisTicks,
    compactMoney,
    niceTicks,
    tickLabels,
    time,
    type ChartMoment,
    type ChartPoint,
    type ChartSeries,
} from "@/features/savings/chart";

export interface GoalChartPlotProps {
    width: number;
    series: ChartSeries;
    /** The dates it can be read at, all within `start`–`end`. */
    moments: ChartMoment[];
    selected: ChartMoment | undefined;
    onSelect: (moment: ChartMoment) => void;
    /** Move the selection one date earlier (-1) or later (1). */
    onStep: (delta: number) => void;
    start: number;
    end: number;
    today: number;
    money: MoneyFormat;
    /** The id of the readout that says what's selected. */
    describedBy: string;
}

// Room for the money labels on the left and the date labels underneath.
const MARGIN = { top: 10, right: 12, bottom: 24, left: 44 };

/** Below this width the plot is shorter, as on a phone. */
const NARROW = 480;

const STEP_KEYS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };

const round = (n: number) => Math.round(n * 10) / 10;

/** The goal over time: the pot (recorded, then projected), what's needed by
 *  each deadline, and a crosshair on the selected date. Pointer, touch and the
 *  arrow keys all move the selection to the nearest date it can be read at. */
export const GoalChartPlot = ({
    width,
    series,
    moments,
    selected,
    onSelect,
    onStep,
    start,
    end,
    today,
    money,
    describedBy,
}: GoalChartPlotProps) => {
    const clipId = `plot-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;

    const height = width < NARROW ? 200 : 260;
    const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
    const plotHeight = height - MARGIN.top - MARGIN.bottom;
    const values = [
        ...series.history,
        ...series.projected,
        ...(series.whatIf ?? []),
        ...series.needed,
    ].map((p) => p.value);
    const yTicks = niceTicks(Math.max(0, ...values));
    const yMax = yTicks.at(-1)!;
    const { ticks, tier } = axisTicks(start, end, today, plotWidth);
    const labels = tickLabels(ticks, tier, today, money.locale);

    const x = (t: number) =>
        MARGIN.left + ((t - start) / (end - start || 1)) * plotWidth;
    const y = (value: number) =>
        MARGIN.top + plotHeight - (value / yMax) * plotHeight;
    const baseline = round(y(0));

    const line = (points: ChartPoint[]) =>
        points
            .map((p, i) => `${i === 0 ? "M" : "L"}${round(x(p.t))},${round(y(p.value))}`)
            .join("");
    // Money lands on a payday and stays until the next, so these hold level between points.
    const steps = (points: ChartPoint[]) =>
        points
            .map((p, i) =>
                i === 0
                    ? `M${round(x(p.t))},${round(y(p.value))}`
                    : `H${round(x(p.t))}V${round(y(p.value))}`
            )
            .join("");
    const wash = (path: string, points: ChartPoint[]) =>
        `${path}V${baseline}H${round(x(points[0]!.t))}Z`;

    const pick = (event: PointerEvent<SVGSVGElement>) => {
        if (moments.length === 0) return;
        const pointer = event.clientX - event.currentTarget.getBoundingClientRect().left;
        const distance = (m: ChartMoment) => Math.abs(x(time(m.date)) - pointer);
        const nearest = moments.reduce((best, m) => (distance(m) < distance(best) ? m : best));
        if (nearest.date !== selected?.date) onSelect(nearest);
    };

    const step = (event: KeyboardEvent<SVGSVGElement>) => {
        const delta = STEP_KEYS[event.key];
        if (delta === undefined) return;
        event.preventDefault();
        onStep(delta);
    };

    const selectedX = selected ? round(x(time(selected.date))) : null;

    return (
        <svg
            width={width}
            height={height}
            role="group"
            aria-label="Savings chart. Use the arrow keys to step through the dates."
            aria-describedby={describedBy}
            tabIndex={0}
            onPointerDown={pick}
            onPointerMove={pick}
            onKeyDown={step}
            className="block touch-pan-y select-none rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-ring"
        >
            <defs>
                <clipPath id={clipId}>
                    {/* A little past the plot, so a dot on its edge isn't cut in half. */}
                    <rect
                        x={MARGIN.left - 6}
                        y={MARGIN.top - 6}
                        width={plotWidth + 12}
                        height={plotHeight + 12}
                    />
                </clipPath>
            </defs>

            {yTicks.map((value) => (
                <g key={value}>
                    <line
                        x1={MARGIN.left}
                        x2={MARGIN.left + plotWidth}
                        y1={round(y(value))}
                        y2={round(y(value))}
                        shapeRendering="crispEdges"
                        className={value === 0 ? "stroke-border-strong" : "stroke-border"}
                    />
                    <text
                        x={MARGIN.left - 8}
                        y={y(value)}
                        dy="0.32em"
                        textAnchor="end"
                        className="tabular fill-text-muted text-[11px]"
                    >
                        {compactMoney(value, money)}
                    </text>
                </g>
            ))}
            {ticks.map((t, i) => (
                <text
                    key={t}
                    x={x(t)}
                    y={height - 6}
                    textAnchor="middle"
                    className={
                        t === today
                            ? "fill-text-secondary text-[11px] font-semibold"
                            : "fill-text-muted text-[11px]"
                    }
                >
                    {labels[i]}
                </text>
            ))}
            {/* A tick, not a full line: the crosshair is the one line across the plot. */}
            {today >= start && today <= end && (
                <line
                    x1={round(x(today))}
                    x2={round(x(today))}
                    y1={baseline}
                    y2={baseline + 5}
                    shapeRendering="crispEdges"
                    className="stroke-text-secondary"
                />
            )}

            <g clipPath={`url(#${clipId})`}>
                {series.history.length > 1 && (
                    <path d={wash(line(series.history), series.history)} className="fill-primary/10" />
                )}
                <path
                    d={wash(steps(series.projected), series.projected)}
                    className="fill-primary/10"
                />
                <path
                    d={`${steps(series.needed)}H${round(x(end))}`}
                    strokeWidth={1.5}
                    className="fill-none stroke-text-faint"
                />
                {series.history.length > 1 && (
                    <path
                        d={line(series.history)}
                        strokeWidth={2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        className="fill-none stroke-primary"
                    />
                )}
                {series.whatIf && (
                    <path
                        d={steps(series.whatIf)}
                        strokeWidth={2}
                        className="fill-none stroke-savings-fg"
                    />
                )}
                {/* Lighter than the recorded line before it: projected, not yet real. */}
                <path
                    d={steps(series.projected)}
                    strokeWidth={2}
                    className="fill-none stroke-primary/70"
                />
                {moments
                    .filter((m) => m.kind === "deadline")
                    .map((m) => (
                        <circle
                            key={m.date}
                            cx={round(x(time(m.date)))}
                            cy={round(y(m.needed))}
                            r={4}
                            strokeWidth={2}
                            className={
                                m.pot < m.needed
                                    ? "fill-attention stroke-raised"
                                    : "fill-text-muted stroke-raised"
                            }
                        />
                    ))}
            </g>

            {selected && selectedX !== null && (
                <g aria-hidden="true">
                    <line
                        x1={selectedX}
                        x2={selectedX}
                        y1={MARGIN.top}
                        y2={baseline}
                        shapeRendering="crispEdges"
                        className="stroke-text-muted"
                    />
                    {selected.needed > 0 && (
                        <circle
                            cx={selectedX}
                            cy={round(y(selected.needed))}
                            r={5.5}
                            strokeWidth={2}
                            className={
                                selected.pot < selected.needed
                                    ? "fill-attention stroke-raised"
                                    : "fill-text-muted stroke-raised"
                            }
                        />
                    )}
                    {selected.whatIf !== null && (
                        <circle
                            cx={selectedX}
                            cy={round(y(selected.whatIf))}
                            r={5}
                            strokeWidth={2}
                            className="fill-savings-fg stroke-raised"
                        />
                    )}
                    <circle
                        cx={selectedX}
                        cy={round(y(selected.pot))}
                        r={5}
                        strokeWidth={2}
                        className="fill-primary stroke-raised"
                    />
                </g>
            )}
        </svg>
    );
};
