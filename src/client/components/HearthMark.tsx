import { hearthTokens } from "@/theme";

export interface HearthMarkProps {
    size?: number;
    /** The house stroke. Defaults to linen for the dark mobile header; the light
     *  sidebar rail passes moss. The window stays apricot either way. */
    color?: string;
}

export const HearthMark = ({
    size = 24,
    color = hearthTokens.brand.linen,
}: HearthMarkProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        style={{ marginTop: -3, flexShrink: 0 }}
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
        <circle cx="24" cy="32" r="3.8" fill={hearthTokens.brand.apricot} />
    </svg>
);
