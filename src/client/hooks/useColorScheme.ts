import { useComputedColorScheme, useMantineColorScheme } from "@mantine/core";

export type ColorSchemeSetting = "light" | "dark" | "auto";

/** The colour scheme: the setting ("auto" follows the device), the scheme
 *  actually showing, and ways to change it. Mantine still owns the setting, so
 *  this is the one seam to replace when Mantine goes. */
export const useColorScheme = () => {
    const { colorScheme, setColorScheme } = useMantineColorScheme();
    const scheme = useComputedColorScheme("light");

    const toggle = () => setColorScheme(scheme === "dark" ? "light" : "dark");

    return {
        setting: colorScheme as ColorSchemeSetting,
        scheme,
        set: (setting: ColorSchemeSetting) => setColorScheme(setting),
        toggle,
    };
};
