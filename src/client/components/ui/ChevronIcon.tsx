export interface ChevronIconProps {
    size?: number;
    className?: string;
}

/** Points right; rotate it with a class for open or down. */
export const ChevronIcon = ({ size = 13, className = "" }: ChevronIconProps) => (
    <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={`shrink-0 ${className}`}
    >
        <path d="M9 6l6 6-6 6" />
    </svg>
);
