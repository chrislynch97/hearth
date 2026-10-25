import { addMonths, diffDays } from "@shared/dates";
import {
    neededSteps,
    planLines,
    projectedAt,
    projection,
    type PlanPoint,
    type SavingsPlanInput,
} from "@shared/savings";
import type { MoneyFormat } from "@/useMoney";

/** The goal chart's model: what it draws and what it can be read at. Pure,
 *  so the drawing stays a function of these. Times are UTC-midnight epoch ms. */

export const time = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);

export interface ChartPoint {
    t: number;
    value: number;
}

export interface ChartSeries {
    /** Recorded balances, ending on today's. Empty until one is recorded. */
    history: ChartPoint[];
    /** From today at what's going in now, payday by payday. */
    projected: ChartPoint[];
    whatIf: ChartPoint[] | null;
    /** What's needed by each deadline, as steps from today. */
    needed: ChartPoint[];
    start: number;
    end: number;
}

const point = (p: PlanPoint): ChartPoint => ({ t: time(p.date), value: p.amount });

export const chartSeries = (
    input: SavingsPlanInput,
    balanceNow: number,
    whatIf: number | null
): ChartSeries => {
    const recorded = input.balances
        .filter((b) => b.asOfDate <= input.today)
        .sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
    const history =
        recorded.length === 0
            ? []
            : [
                  ...recorded.map((b) => ({ t: time(b.asOfDate), value: b.amount })),
                  { t: time(input.today), value: balanceNow },
              ];
    const projected = projection(input, input.contribution).map(point);
    const needed = neededSteps(input).map(point);
    const times = [...history, ...projected, ...needed].map((p) => p.t);

    return {
        history,
        projected,
        whatIf: whatIf === null ? null : projection(input, whatIf).map(point),
        needed,
        start: Math.min(...times),
        end: Math.max(...times),
    };
};

/** A date the chart can be read at: today, a deadline, or the goal date. */
export interface ChartMoment {
    date: string;
    kind: "today" | "deadline" | "goal";
    /** What falls due that day; on today, anything already overdue too. */
    due: { name: string; amount: number }[];
    /** Everything due by then, all told. */
    needed: number;
    /** What the pot holds by then at what's going in now, and at the what-if. */
    pot: number;
    whatIf: number | null;
}

export const chartMoments = (
    input: SavingsPlanInput,
    whatIf: number | null
): ChartMoment[] => {
    const lines = planLines(input);
    const dates = [
        ...new Set([input.today, ...lines.map((l) => l.due), input.targetDate]),
    ]
        .filter((date) => date >= input.today)
        .sort();
    const pots = projectedAt(input, input.contribution, dates);
    const whatIfs = whatIf === null ? null : projectedAt(input, whatIf, dates);

    return dates.map((date, i) => ({
        date,
        kind:
            date === input.today
                ? "today"
                : lines.some((l) => l.due === date)
                  ? "deadline"
                  : "goal",
        due: lines
            .filter((l) => (date === input.today ? l.due <= date : l.due === date))
            .map((l) => ({ name: l.name, amount: l.amount })),
        needed: lines
            .filter((l) => l.due <= date)
            .reduce((sum, l) => sum + l.amount, 0),
        pot: pots[i]!,
        whatIf: whatIfs?.[i] ?? null,
    }));
};

/** Where the chart opens: the first deadline the money misses, else the next one. */
export const defaultMoment = (moments: ChartMoment[]): ChartMoment | undefined =>
    moments.find((m) => m.kind !== "today" && m.pot < m.needed) ??
    moments.find((m) => m.kind !== "today") ??
    moments[0];

/** "in 3 weeks", "in 7 months": how far off a date is, roughly. */
export const inTime = (today: string, date: string): string => {
    const days = diffDays(today, date);
    if (days <= 0) return "today";
    if (days === 1) return "tomorrow";
    if (days < 14) return `in ${days} days`;
    if (days < 61) return `in ${Math.round(days / 7)} weeks`;
    if (days < 730) return `in ${Math.round(days / 30.44)} months`;
    return `in ${Math.round(days / 365.25)} years`;
};

/** Round steps from 0 that cover `max` in about `count` gaps: 0, 5k, 10k, 15k. */
export const niceTicks = (max: number, count = 4): number[] => {
    if (max <= 0) return [0, 1];
    const rough = max / count;
    const power = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 2.5, 5, 10]
        .map((factor) => factor * power)
        .find((s) => s >= rough)!;

    return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
};

/** A money axis label: £800, £2.5k, £15k. */
export const compactMoney = (minor: number, money: MoneyFormat): string => {
    const units = minor / 10 ** money.decimalPlaces;
    const text =
        units >= 1000
            ? `${Number((units / 1000).toFixed(units % 1000 === 0 ? 0 : 1))}`.replace(
                  ".",
                  money.decimalSeparator
              ) + "k"
            : String(Math.round(units));

    return money.symbolPosition === "prefix"
        ? `${money.symbol}${text}`
        : `${text}\u00A0${money.symbol}`;
};

const DAY = 86_400_000;

/** Room a date label needs on the axis, and from the plot's right edge. */
const LABEL_GAP = 56;
const RIGHT_EDGE = 20;

export type TickTier = "week" | "month" | "quarter" | "year";

/** The chart's date labels: weekly, monthly, quarterly or yearly by the span
 *  shown, thinned to fit `plotWidth`. Today is kept whenever it's in view, so
 *  the axis always says where now is. */
export const axisTicks = (
    start: number,
    end: number,
    today: number,
    plotWidth: number
): { ticks: number[]; tier: TickTier } => {
    const days = (end - start) / DAY;
    const tier: TickTier =
        days <= 100 ? "week" : days <= 548 ? "month" : days <= 1461 ? "quarter" : "year";

    const candidates: number[] = [];
    if (tier === "week") {
        for (let t = start + 7 * DAY; t <= end; t += 7 * DAY) candidates.push(t);
    } else {
        const months = { month: 1, quarter: 3, year: 12 }[tier];
        const from = new Date(start);
        // Months counted from year 0, starting at the first 1st on or after `start`.
        const first =
            from.getUTCFullYear() * 12 +
            from.getUTCMonth() +
            (from.getUTCDate() === 1 ? 0 : 1);
        for (
            let index = Math.ceil(first / months) * months;
            Date.UTC(Math.floor(index / 12), index % 12, 1) <= end;
            index += months
        )
            candidates.push(Date.UTC(Math.floor(index / 12), index % 12, 1));
    }

    const x = (t: number) => ((t - start) / (end - start || 1)) * plotWidth;
    const kept = today >= start && today <= end ? [today] : [];
    for (const t of candidates) {
        if (x(t) > plotWidth - RIGHT_EDGE) continue;
        if (kept.every((k) => Math.abs(x(k) - x(t)) >= LABEL_GAP)) kept.push(t);
    }

    return { ticks: kept.sort((a, b) => a - b), tier };
};

/** Labels for {@link axisTicks}: "Today", then each date at the tier's grain,
 *  in the household's locale. A month carries its year whenever the year turns
 *  from the label before, so "Jul … Apr" can't hide a year going by — and
 *  never as "Dec 26", a day. */
export const tickLabels = (
    ticks: number[],
    tier: TickTier,
    today: number,
    locale: string
): string[] =>
    ticks.map((t, i) => {
        if (t === today) return "Today";
        const year = new Date(t).getUTCFullYear();
        const before = i === 0 ? null : new Date(ticks[i - 1]!).getUTCFullYear();
        const options: Intl.DateTimeFormatOptions =
            tier === "week"
                ? { day: "numeric", month: "short" }
                : tier === "year"
                  ? { year: "numeric" }
                  : year === before
                    ? { month: "short" }
                    : { month: "short", year: "numeric" };

        return new Date(t).toLocaleDateString(locale, {
            ...options,
            timeZone: "UTC",
        });
    });

/** Where the "Deadlines" zoom starts: a month before the first deadline still
 *  to come before the goal date. Null when that window isn't under a quarter
 *  of the plan, as there's nothing bunched up to zoom in on. */
export const deadlineWindow = (input: SavingsPlanInput): string | null => {
    const first = planLines(input)
        .map((line) => line.due)
        .filter((due) => due > input.today && due < input.targetDate)
        .sort()[0];
    if (!first) return null;

    const start = addMonths(first, -1);
    const from = start > input.today ? start : input.today;
    return diffDays(from, input.targetDate) * 4 <
        diffDays(input.today, input.targetDate)
        ? from
        : null;
};
