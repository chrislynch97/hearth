import { ShieldIcon } from "@/components/ui/ShieldIcon";

export interface PlanLineRowProps {
    name: string;
    /** Marked with a shield — it counts toward the emergency-fund target. */
    emergencyFund: boolean;
    /** The small tag — a recurrence, or `auto` for a self-deducting pot. */
    meta: string;
    /** Already formatted, in the household's currency and budget period. */
    amount: string;
    ariaLabel: string;
    onClick: () => void;
}

/** One bill or one set-aside inside a pot card. The whole row opens its editor —
 *  there is nothing else to do with a line, so a separate ✎ would be noise. */
export const PlanLineRow = ({
    name,
    emergencyFund,
    meta,
    amount,
    ariaLabel,
    onClick,
}: PlanLineRowProps) => (
    <button
        onClick={onClick}
        aria-label={ariaLabel}
        className="flex h-7 w-full items-center gap-2 rounded-xs px-1 text-left transition-colors duration-[140ms] ease-out hover:bg-hover"
    >
        {/* Leading, and held open whether or not there is a shield in it.
            Tucked beside the name it sat in a different place on every row, and
            anything right of the name floats with the width of the amount. */}
        <span className="flex w-4 shrink-0 justify-center">
            {emergencyFund && (
                <span
                    role="img"
                    aria-label="Counts toward the emergency fund"
                    title="Counts toward the emergency fund"
                    className="flex text-text-faint"
                >
                    <ShieldIcon />
                </span>
            )}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">
            {name}
        </span>
        <span className="shrink-0 text-xs capitalize text-text-faint">
            {meta}
        </span>
        {/* A column of its own, so the tags beside it line up down the card. */}
        <span className="tabular min-w-[4.25rem] shrink-0 text-right text-sm text-text">
            {amount}
        </span>
    </button>
);
