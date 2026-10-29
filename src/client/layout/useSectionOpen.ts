import { useState } from "react";

const storageKey = (sectionId: string) => `hearth.nav.open.${sectionId}`;

// Storage can be missing or throw (private mode, blocked site data); the sidebar
// then just falls back to its defaults.
const readStored = (sectionId: string): boolean | null => {
    try {
        const value = localStorage.getItem(storageKey(sectionId));
        return value === null ? null : value === "1";
    } catch {
        return null;
    }
};

/** Whether a sidebar section is unfolded. A toggle is remembered per browser;
 *  until there is one, `fallback` decides. */
export const useSectionOpen = (
    sectionId: string,
    fallback: boolean
): [boolean, () => void] => {
    const [stored, setStored] = useState(() => readStored(sectionId));

    const open = stored ?? fallback;

    const toggle = () => {
        setStored(!open);
        try {
            localStorage.setItem(storageKey(sectionId), open ? "0" : "1");
        } catch {
            // Not remembered past this visit; nothing else depends on it.
        }
    };

    return [open, toggle];
};
