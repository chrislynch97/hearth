import { useComputedColorScheme, useMantineColorScheme } from "@mantine/core";

/** The scheme actually showing, and a flip to the other one. Mantine still owns
 *  the setting (Appearance writes it too), so this is the one seam to replace
 *  when Mantine goes. */
export const useColorScheme = () => {
    const { setColorScheme } = useMantineColorScheme();
    const scheme = useComputedColorScheme("light");

    const toggle = () => setColorScheme(scheme === "dark" ? "light" : "dark");

    return { scheme, toggle };
};
