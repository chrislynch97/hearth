export interface PlusIconProps {
    size?: number;
}

export const PlusIcon = ({ size = 13 }: PlusIconProps) => (
    <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        aria-hidden="true"
        // A flex child with no basis of its own gets squashed by the label
        // beside it — 15px wide becomes 4 in a tight button.
        className="shrink-0"
    >
        <path d="M12 5v14M5 12h14" />
    </svg>
);
