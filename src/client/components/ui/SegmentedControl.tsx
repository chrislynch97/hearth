import { ToggleGroup, ToggleGroupItem } from "@/components/shadcn/toggle-group";

export interface SegmentedOption<T extends string> {
    value: T;
    label: string;
}

export interface SegmentedControlProps<T extends string> {
    /** Names the group for assistive tech. */
    label: string;
    options: SegmentedOption<T>[];
    value: T;
    onChange: (value: T) => void;
    className?: string;
}

/** Two or three mutually exclusive choices in one sunken track, the chosen one
 *  raised on a card. shadcn's ToggleGroup underneath: arrow keys move between
 *  the options, and only the chosen one is a tab stop. */
export const SegmentedControl = <T extends string>({
    label,
    options,
    value,
    onChange,
    className = "",
}: SegmentedControlProps<T>) => (
    <ToggleGroup
        type="single"
        aria-label={label}
        value={value}
        // Pressing the chosen option again would clear it; a segmented
        // control always has one, so ignore that.
        onValueChange={(next) => next && onChange(next as T)}
        className={`gap-0.5 rounded-md border border-border bg-sunken p-0.5 ${className}`}
    >
        {options.map((option) => (
            <ToggleGroupItem
                key={option.value}
                value={option.value}
                className="h-7 rounded-sm! px-3 text-sm text-text-secondary hover:bg-hover hover:text-text data-[state=on]:bg-raised data-[state=on]:font-semibold data-[state=on]:text-text data-[state=on]:shadow-raised"
            >
                {option.label}
            </ToggleGroupItem>
        ))}
    </ToggleGroup>
);
