import { Moon, Sun } from "lucide-react";
import { useColorScheme } from "@/hooks/useColorScheme";

/** Light or dark, one tap from anywhere. Picking a side here replaces "match
 *  the system" in Appearance settings. */
export const ThemeToggle = () => {
    const { scheme, toggle } = useColorScheme();

    const dark = scheme === "dark";

    return (
        <button
            type="button"
            onClick={toggle}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            className="flex size-9 items-center justify-center rounded-md text-text-secondary transition-colors duration-[140ms] ease-out hover:bg-hover hover:text-text"
        >
            {dark ? (
                <Sun size={18} strokeWidth={1.5} />
            ) : (
                <Moon size={18} strokeWidth={1.5} />
            )}
        </button>
    );
};
