export interface FigureRowProps {
    label: string;
    /** Already formatted. */
    amount: string;
    /** A quieter tag after the label, e.g. a monthly equivalent. */
    meta?: string;
    /** The row a group adds up to: bold, with a rule above. */
    total?: boolean;
    negative?: boolean;
}

/** One label-and-amount line. Amounts sit in their own right-aligned column so a
 *  card's figures line up and can be added by eye. */
export const FigureRow = ({
    label,
    amount,
    meta,
    total = false,
    negative = false,
}: FigureRowProps) => (
    <div
        className={[
            "flex items-baseline gap-2 py-1",
            total ? "mt-1 border-t border-border pt-2 font-semibold" : "",
        ].join(" ")}
    >
        <span
            className={[
                "min-w-0 flex-1 truncate text-sm",
                total ? "text-text" : "text-text-secondary",
            ].join(" ")}
        >
            {label}
        </span>
        {meta && (
            <span className="shrink-0 text-xs text-text-faint">{meta}</span>
        )}
        <span
            className={[
                "tabular min-w-[5rem] shrink-0 text-right text-sm",
                negative ? "text-danger" : "text-text",
            ].join(" ")}
        >
            {amount}
        </span>
    </div>
);
