import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";

/** Where a contribution ends up by the date, and how much of that is interest. */
export interface LegendProjection {
    contribution: number;
    final: number;
    interest: number;
}

export interface GoalChartLegendProps {
    balanceNow: number;
    required: number;
    /** The date everything is measured by, formatted. */
    by: string;
    /** The household's per-period suffix, e.g. `/mo`. */
    unit: string;
    current: LegendProjection;
    whatIf: LegendProjection | null;
    money: MoneyFormat;
}

/** What each line on the chart is, with the figure it ends on. */
export const GoalChartLegend = ({
    balanceNow,
    required,
    by,
    unit,
    current,
    whatIf,
    money,
}: GoalChartLegendProps) => {
    const ending = ({ final, interest }: LegendProjection) => (
        <>
            <strong className="tabular font-semibold text-text">
                {formatMoney(final, money)}
            </strong>{" "}
            by {by}
            {interest > 0 && `, incl. ${formatMoney(interest, money)} interest`}
        </>
    );

    return (
        <ul className="m-0 grid list-none grid-cols-1 gap-x-5 gap-y-1 p-0 text-xs text-text-secondary sm:grid-cols-2">
            <li className="flex items-center gap-2">
                <i className="inline-block w-[18px] shrink-0 border-t-2 border-primary" />
                <span>
                    In the pot now{" "}
                    <strong className="tabular font-semibold text-text">
                        {formatMoney(balanceNow, money)}
                    </strong>
                </span>
            </li>
            <li className="flex items-center gap-2">
                <i className="inline-block w-[18px] shrink-0 border-t-[1.5px] border-text-faint" />
                <span>
                    Needed{" "}
                    <strong className="tabular font-semibold text-text">
                        {formatMoney(required, money)}
                    </strong>{" "}
                    by {by}
                </span>
            </li>
            <li className="flex items-center gap-2">
                <i className="inline-block w-[18px] shrink-0 border-t-2 border-primary/70" />
                <span>
                    At {formatMoney(current.contribution, money)}
                    {unit} {ending(current)}
                </span>
            </li>
            {whatIf && (
                <li className="flex items-center gap-2">
                    <i className="inline-block w-[18px] shrink-0 border-t-2 border-savings-fg" />
                    <span>
                        What if {formatMoney(whatIf.contribution, money)}
                        {unit} {ending(whatIf)}
                    </span>
                </li>
            )}
        </ul>
    );
};
