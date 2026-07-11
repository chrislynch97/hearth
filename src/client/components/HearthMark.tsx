import { hearthTokens } from "@/theme";

export interface HearthMarkProps {
    size?: number;
}

export const HearthMark = ({ size = 24 }: HearthMarkProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        style={{ marginTop: -3, flexShrink: 0 }}
    >
        <polyline
            points="8,25 24,10 40,25"
            stroke={hearthTokens.brand.linen}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M14 25 V40 H34 V25"
            stroke={hearthTokens.brand.linen}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <circle cx="24" cy="32" r="3.8" fill={hearthTokens.brand.apricot} />
    </svg>
);
