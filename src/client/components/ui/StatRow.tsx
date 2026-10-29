import type { ReactNode } from "react";

export type StatTone = "default" | "positive" | "danger";

export interface StatRowProps {
    label: ReactNode;
    value: ReactNode;
    /** The row that sums up the ones above it: bold, and in full colour. */
    total?: boolean;
    tone?: StatTone;
}

const TONES: Record<StatTone, string> = {
    default: "",
    positive: "text-positive-fg",
    danger: "text-danger",
};

/** A label on the left, its figure on the right — the line a breakdown is
 *  made of. */
export const StatRow = ({
    label,
    value,
    total = false,
    tone = "default",
}: StatRowProps) => (
    <div
        className={[
            "flex items-baseline justify-between gap-3 text-base",
            total ? "font-semibold" : "",
            TONES[tone],
        ].join(" ")}
    >
        <span
            className={total || tone !== "default" ? "" : "text-text-secondary"}
        >
            {label}
        </span>
        <span className="tabular">{value}</span>
    </div>
);
