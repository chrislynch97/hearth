import { X } from "lucide-react";
import { todayIso } from "@shared/dates";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

export interface ShouldHoldDateChipProps {
    /** `YYYY-MM-DD`; empty reads as today. */
    value: string;
    onChange: (value: string) => void;
}

/** Picks the day every pot's "Should hold" is worked out for. Beside the other
 *  filters because it's one more lens on the same cards. */
export const ShouldHoldDateChip = ({
    value,
    onChange,
}: ShouldHoldDateChipProps) => {
    const today = todayIso();

    return (
        <div className="flex items-center gap-1 max-sm:w-full">
            <TextField
                label="Should hold on"
                hideLabel
                prefix="Should hold on"
                type="date"
                value={value || today}
                onChange={(event) => onChange(event.currentTarget.value)}
                className="min-w-0 max-sm:flex-1 sm:w-64"
            />
            {value && value !== today && (
                <Button
                    variant="ghost"
                    className="size-9 px-0"
                    aria-label="Back to today"
                    icon={<X />}
                    onClick={() => onChange(today)}
                />
            )}
        </div>
    );
};
