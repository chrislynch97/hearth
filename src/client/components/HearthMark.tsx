export interface HearthMarkProps {
    size?: number;
    /** The house stroke. The window stays apricot either way. */
    color?: string;
}

export const HearthMark = ({
    size = 24,
    color = "currentColor",
}: HearthMarkProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        className="-mt-[3px] shrink-0"
    >
        <polyline
            points="8,25 24,10 40,25"
            stroke={color}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M14 25 V40 H34 V25"
            stroke={color}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <circle cx="24" cy="32" r="3.8" fill="var(--color-attention)" />
    </svg>
);
