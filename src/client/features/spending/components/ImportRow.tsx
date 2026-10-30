import { formatMoney } from "@shared/money";
import { useFormatDate, type MoneyFormat } from "@/useMoney";
import { Badge } from "@/components/shadcn/badge";
import { Checkbox } from "@/components/shadcn/checkbox";
import { ChoiceField } from "@/components/ui/ChoiceField";
import { isImportable, type Decision, type PreviewRow } from "../importModel";

// Radix Select can't hold an empty value, so "no pot" needs a stand-in.
const NO_POT = "none";

const STATUS: Partial<
    Record<
        PreviewRow["status"],
        {
            label: string;
            variant: "attention" | "secondary" | "destructive";
        }
    >
> = {
    foreign: { label: "Foreign", variant: "attention" },
    excluded: { label: "Internal", variant: "secondary" },
    duplicate: { label: "Duplicate", variant: "secondary" },
    error: { label: "Error", variant: "destructive" },
};

export interface ImportRowProps {
    row: PreviewRow;
    decision: Decision | undefined;
    pots: Array<{ value: string; label: string }>;
    money: MoneyFormat;
    onChange: (patch: Partial<Decision>) => void;
}

/** One line of the statement: whether it comes in, and which pot it counts
 *  against. The pot drops onto its own line on a phone. */
export const ImportRow = ({
    row,
    decision,
    pots,
    money,
    onChange,
}: ImportRowProps) => {
    const formatDate = useFormatDate();

    const importable = isImportable(row);
    const included = decision?.included ?? false;
    const status = STATUS[row.status];

    return (
        <li
            className={`flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:gap-4 ${included ? "" : "opacity-60"}`}
        >
            <div className="flex min-w-0 flex-1 items-start gap-3">
                <Checkbox
                    className="mt-0.5"
                    checked={included}
                    disabled={!importable}
                    aria-label={`Include ${row.description}`}
                    onCheckedChange={(checked) =>
                        onChange({ included: checked === true })
                    }
                />
                <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium text-text">
                        {row.description}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-text-muted">
                        {row.date ? formatDate(row.date) : "No date"}
                        {status && (
                            <Badge variant={status.variant}>
                                {status.label}
                            </Badge>
                        )}
                    </p>
                    {row.error && (
                        <p className="text-sm text-danger">{row.error}</p>
                    )}
                </div>
                <div className="flex shrink-0 flex-col items-end">
                    <span
                        className={`tabular text-base font-medium ${row.amount < 0 ? "text-positive-fg" : "text-text"}`}
                    >
                        {row.amount < 0 ? "+" : ""}
                        {formatMoney(Math.abs(row.amount), money)}
                    </span>
                    {row.foreign && (
                        <span className="text-sm text-text-muted">
                            {row.currency}
                        </span>
                    )}
                </div>
            </div>
            {importable && (
                <ChoiceField
                    label={`Pot for ${row.description}`}
                    hideLabel
                    options={[{ value: NO_POT, label: "No pot yet" }, ...pots]}
                    value={decision?.potId ?? NO_POT}
                    disabled={!included}
                    onChange={(value) =>
                        onChange({ potId: value === NO_POT ? null : value })
                    }
                    className="pl-7 sm:w-48 sm:pl-0"
                />
            )}
        </li>
    );
};
