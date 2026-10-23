/** The Plan page's filter chips: the owner picker and the should-hold date. */
export const chipClass = (active: boolean) =>
    [
        "h-[26px] rounded-full border px-2.5 text-xs transition-colors duration-[140ms] ease-out",
        active
            ? "border-primary bg-primary-tint font-semibold text-primary"
            : "border-border text-text-secondary hover:bg-hover",
    ].join(" ");
