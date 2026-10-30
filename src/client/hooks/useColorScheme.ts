import { useSyncExternalStore } from "react";

export type ColorSchemeSetting = "light" | "dark" | "auto";

const STORAGE_KEY = "hearth:color-scheme";
// Where the setting was stored before Hearth owned it; read so nobody loses theirs.
const LEGACY_STORAGE_KEY = "mantine-color-scheme-value";

const readSetting = (): ColorSchemeSetting => {
    const stored =
        localStorage.getItem(STORAGE_KEY) ??
        localStorage.getItem(LEGACY_STORAGE_KEY);

    return stored === "light" || stored === "dark" ? stored : "auto";
};

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

let setting = readSetting();

const getSetting = () => setting;

const getScheme = (): "light" | "dark" => {
    if (setting !== "auto") return setting;

    return systemDark.matches ? "dark" : "light";
};

const refresh = () => {
    document.documentElement.dataset.theme = getScheme();
    listeners.forEach((listener) => listener());
};

const save = (next: ColorSchemeSetting) => {
    setting = next;
    localStorage.setItem(STORAGE_KEY, next);
    refresh();
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);

    return () => listeners.delete(listener);
};

systemDark.addEventListener("change", refresh);
// On load rather than in an effect, so the first paint is already the right one.
refresh();

/** The colour scheme: the setting ("auto" follows the device), the scheme
 *  actually showing, and ways to change it. */
export const useColorScheme = () => {
    const current = useSyncExternalStore(subscribe, getSetting);
    const scheme = useSyncExternalStore(subscribe, getScheme);

    const toggle = () => save(scheme === "dark" ? "light" : "dark");

    return { setting: current, scheme, set: save, toggle };
};
