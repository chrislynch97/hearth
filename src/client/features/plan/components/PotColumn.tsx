import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { PlusIcon } from "@/components/ui/PlusIcon";
import { EmptyLine } from "@/features/plan/components/EmptyLine";
import { PlanIcon } from "@/features/plan/components/PlanIcon";

export interface PotColumnProps {
    /** Out drains the pot, in fills it — the halves of what it needs. */
    direction: "out" | "in";
    label: string;
    /** This column's share of the pot's per-period figure, already formatted. */
    subtotal: string;
    /** Shown in place of the rows when there are none. */
    empty: string;
    addLabel: string;
    onAdd: () => void;
    children: ReactNode;
    isEmpty: boolean;
}

// Both tints at the same strength: at full strength the apricot one reads as a
// warning band rather than a label, and the two halves stop looking like a pair.
const TONES = {
    out: {
        strip: "bg-attention-tint/60",
        icon: "text-attention-fg",
        name: "bills" as const,
    },
    in: {
        strip: "bg-primary-tint/60",
        icon: "text-primary",
        name: "setAsides" as const,
    },
};

/** One half of a pot card. The tinted strip does the work the old coloured
 *  square was trying to: says which direction this is at a glance, and carries
 *  the subtotal, so the two halves visibly add up to the pot's own figure. */
export const PotColumn = ({
    direction,
    label,
    subtotal,
    empty,
    addLabel,
    onAdd,
    children,
    isEmpty,
}: PotColumnProps) => {
    const tone = TONES[direction];

    return (
        <div className="flex flex-col">
            <div
                className={[
                    "flex items-center gap-2 px-3.5 py-2",
                    "border-b border-border",
                    tone.strip,
                ].join(" ")}
            >
                <PlanIcon name={tone.name} size={15} className={tone.icon} />
                <span className="flex-1 text-sm font-medium text-text-secondary">
                    {label}
                </span>
                <span className="tabular text-sm font-semibold text-text">
                    {subtotal}
                </span>
            </div>

            <div className="flex flex-1 flex-col px-3.5 pb-3 pt-2.5">
                <div className="mb-3 flex flex-col">
                    {isEmpty ? <EmptyLine>{empty}</EmptyLine> : children}
                </div>
                {/* Pinned to the foot of the column, so the two sides line up
                    however many rows each of them has. */}
                <Button
                    variant="dashed"
                    compact
                    icon={<PlusIcon />}
                    className="mt-auto w-full"
                    onClick={onAdd}
                >
                    {addLabel}
                </Button>
            </div>
        </div>
    );
};
