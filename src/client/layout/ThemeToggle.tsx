import {
    ActionIcon,
    type MantineBreakpoint,
    useMantineColorScheme,
} from "@mantine/core";
import { hearthTokens } from "@/theme";

export interface ThemeToggleProps {
    visibleFrom?: MantineBreakpoint;
}

export const ThemeToggle = ({ visibleFrom }: ThemeToggleProps) => {
    const { colorScheme, toggleColorScheme } = useMantineColorScheme();
    const isDark = colorScheme === "dark";

    return (
        <ActionIcon
            variant="subtle"
            size="sm"
            onClick={toggleColorScheme}
            aria-label="Toggle colour scheme"
            visibleFrom={visibleFrom}
            style={{ color: hearthTokens.brand.linen, opacity: 0.65 }}
        >
            {isDark ? "☀" : "☾"}
        </ActionIcon>
    );
};
