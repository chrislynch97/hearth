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

/** Two or three mutually exclusive choices, joined in one track. */
export const SegmentedControl = <T extends string>({
    label,
    options,
    value,
    onChange,
    className = "",
}: SegmentedControlProps<T>) => (
    <div
        role="group"
        aria-label={label}
        className={[
            "inline-flex gap-0.5 rounded-sm border border-border-strong bg-sunken p-0.5",
            className,
        ].join(" ")}
    >
        {options.map((option) => {
            const selected = option.value === value;

            return (
                <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onChange(option.value)}
                    className={[
                        "h-6 rounded-xs px-2.5 text-xs transition-colors duration-[140ms] ease-out",
                        selected
                            ? "bg-raised font-semibold text-text shadow-raised"
                            : "text-text-secondary hover:bg-hover",
                    ].join(" ")}
                >
                    {option.label}
                </button>
            );
        })}
    </div>
);
