import { todayIso } from "@shared/dates";
import { useFormatDate } from "@/useMoney";
import { chipClass } from "@/features/plan/chipClass";

export interface ShouldHoldDateChipProps {
    /** `YYYY-MM-DD`; empty reads as today. */
    value: string;
    onChange: (value: string) => void;
}

/** Picks the day every pot's "Should hold" is worked out for. A chip beside the
 *  owner filter because it's one more lens on the same cards. */
export const ShouldHoldDateChip = ({
    value,
    onChange,
}: ShouldHoldDateChipProps) => {
    const formatDate = useFormatDate();

    const today = todayIso();
    const isToday = !value || value === today;

    return (
        <span className="inline-flex items-center gap-1">
            {/* The real date input sits invisibly over the chip: a tap opens the
                native picker on a phone, and showPicker covers desktop clicks. */}
            <span
                className={[
                    "relative inline-flex items-center rounded-full focus-within:shadow-[0_0_0_2px_var(--color-bg),0_0_0_4px_var(--color-ring)]",
                    chipClass(!isToday),
                ].join(" ")}
            >
                Should hold: {isToday ? "today" : formatDate(value)}
                <input
                    type="date"
                    aria-label="Should hold on"
                    value={value || today}
                    onChange={(event) => onChange(event.currentTarget.value)}
                    onClick={(event) => event.currentTarget.showPicker?.()}
                    className="absolute inset-0 cursor-pointer opacity-0"
                />
            </span>
            {!isToday && (
                <button
                    type="button"
                    aria-label="Back to today"
                    onClick={() => onChange(today)}
                    className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-text-muted transition-colors duration-[140ms] ease-out hover:bg-hover"
                >
                    ×
                </button>
            )}
        </span>
    );
};
