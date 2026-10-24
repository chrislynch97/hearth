export interface FigureProps {
    /** Already formatted. */
    amount: string;
    unit?: string;
    size?: "sm" | "lg";
    negative?: boolean;
}

/** A money figure with its per-period unit trailing in a quieter weight. */
export const Figure = ({
    amount,
    unit,
    size = "sm",
    negative = false,
}: FigureProps) => (
    <span
        className={[
            "tabular shrink-0 font-semibold",
            size === "lg" ? "text-fig-lg" : "text-fig-sm",
            negative ? "text-danger" : "text-text",
        ].join(" ")}
    >
        {amount}
        {unit && (
            <span className="ml-1 text-xs font-normal text-text-muted">
                {unit}
            </span>
        )}
    </span>
);
