import {
    ActionIcon,
    type MantineBreakpoint,
    useMantineColorScheme,
} from "@mantine/core";
import { hearthTokens } from "@/theme";

export interface ThemeToggleProps {
    visibleFrom?: MantineBreakpoint;
}

// Same hand-rolled line-icon family as NavIcon, so the chrome stays consistent
// instead of mixing a raw text glyph in with the SVG nav icons.
const SUN = (
    <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
);
const MOON = <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />;

export const ThemeToggle = ({ visibleFrom }: ThemeToggleProps) => {
    const { colorScheme, toggleColorScheme } = useMantineColorScheme();
    const isDark = colorScheme === "dark";

    return (
        <ActionIcon
            variant="subtle"
            size="sm"
            onClick={toggleColorScheme}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            visibleFrom={visibleFrom}
            style={{ color: hearthTokens.brand.linen, opacity: 0.65 }}
        >
            <svg
                width={18}
                height={18}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                {isDark ? SUN : MOON}
            </svg>
        </ActionIcon>
    );
};
