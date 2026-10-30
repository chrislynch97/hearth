import type { ReactNode } from "react";
import type { StatTone } from "@/components/ui/StatRow";

export interface BreakdownRow {
    label: ReactNode;
    /** One cell per column, in column order; `null` leaves it blank. */
    values: Array<ReactNode | null>;
    /** The row that sums up the ones above it: ruled off and bold. */
    total?: boolean;
    tone?: StatTone;
}

export interface BreakdownTableProps {
    /** Column headings over the figures (people, months…). */
    columns: ReactNode[];
    rows: BreakdownRow[];
    /** For assistive tech, e.g. "This period by person". */
    caption: string;
}

const TONES: Record<StatTone, string> = {
    default: "",
    positive: "text-positive-fg",
    danger: "text-danger",
};

/** Labels down the side, a column of figures per person (or per anything) —
 *  for comparing the same breakdown side by side. */
export const BreakdownTable = ({
    columns,
    rows,
    caption,
}: BreakdownTableProps) => (
    <div className="overflow-x-auto">
        <table className="w-full border-collapse text-base">
            <caption className="sr-only">{caption}</caption>
            <thead>
                <tr>
                    <th scope="col" className="w-full" />
                    {columns.map((column, i) => (
                        <th
                            key={i}
                            scope="col"
                            className="whitespace-nowrap pb-2 pl-3 text-right text-sm font-medium text-text-muted sm:pl-6"
                        >
                            {column}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.map((row, i) => (
                    <tr
                        key={i}
                        className={[
                            row.total
                                ? "border-t border-border font-semibold"
                                : "",
                            TONES[row.tone ?? "default"],
                        ].join(" ")}
                    >
                        <th
                            scope="row"
                            className={[
                                "py-1.5 text-left font-normal",
                                row.total
                                    ? "font-semibold"
                                    : "text-text-secondary",
                            ].join(" ")}
                        >
                            {row.label}
                        </th>
                        {row.values.map((value, j) => (
                            <td
                                key={j}
                                className="tabular whitespace-nowrap py-1.5 pl-3 text-right sm:pl-6"
                            >
                                {value}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);
