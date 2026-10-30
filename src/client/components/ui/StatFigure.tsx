import type { ReactNode } from "react";
import { Eyebrow } from "@/components/ui/Eyebrow";
import type { StatTone } from "@/components/ui/StatRow";

export interface StatFigureProps {
    label: ReactNode;
    value: ReactNode;
    /** A line under the figure — what it's made of, or how it compares. */
    hint?: ReactNode;
    tone?: StatTone;
}

const TONES: Record<StatTone, string> = {
    default: "text-text",
    positive: "text-positive-fg",
    danger: "text-danger",
};

/** One headline number with its label — the figures a summary opens with. */
export const StatFigure = ({
    label,
    value,
    hint,
    tone = "default",
}: StatFigureProps) => (
    <div className="flex min-w-0 flex-col gap-1">
        <Eyebrow>{label}</Eyebrow>
        <p
            className={`tabular font-display text-fig-lg font-medium leading-none ${TONES[tone]}`}
        >
            {value}
        </p>
        {hint && <p className="text-sm text-text-muted">{hint}</p>}
    </div>
);
