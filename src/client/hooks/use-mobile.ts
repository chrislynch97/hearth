import { useSyncExternalStore } from "react";

// Tailwind's `md`: below it the sidebar is the phone menu.
const QUERY = "(max-width: 767px)";

const subscribe = (onChange: () => void) => {
    const mql = window.matchMedia(QUERY);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
};

/** Whether the viewport is phone-sized. Read straight from the media query, so
 *  the first render is already right rather than a desktop frame then a flip. */
export const useIsMobile = () =>
    useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches);
