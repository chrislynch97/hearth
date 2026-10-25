export interface ChevronIconProps {
    direction: "left" | "right";
    size?: number;
}

export const ChevronIcon = ({ direction, size = 16 }: ChevronIconProps) => (
    <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0"
    >
        <path d={direction === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
);
