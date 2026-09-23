import { PLAN_ICON_PATHS, type PlanIconName } from "@/features/plan/icons";

export interface PlanIconProps {
    name: PlanIconName;
    size?: number;
    className?: string;
}

export const PlanIcon = ({
    name,
    size = 17,
    className = "",
}: PlanIconProps) => (
    <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={["shrink-0", className].join(" ")}
    >
        <path d={PLAN_ICON_PATHS[name]} />
    </svg>
);
