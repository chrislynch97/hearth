import { useSyncExternalStore } from "react";

const subscribe = (onChange: () => void) => {
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", onChange);
    viewport?.addEventListener("scroll", onChange);
    return () => {
        viewport?.removeEventListener("resize", onChange);
        viewport?.removeEventListener("scroll", onChange);
    };
};

const measure = () => {
    const viewport = window.visualViewport;
    // Pinch zoom shrinks the visual viewport too, and isn't a keyboard.
    if (!viewport || Math.abs(viewport.scale - 1) > 0.01) return 0;
    const hidden = window.innerHeight - viewport.height - viewport.offsetTop;
    return Math.max(0, Math.round(hidden));
};

/** How many pixels the on-screen keyboard covers at the bottom of the screen.
 *  On iOS it sits over the page, so anything pinned to the bottom has to lift
 *  itself clear. On Android this reads 0: the viewport meta resizes the page. */
export const useKeyboardInset = () => useSyncExternalStore(subscribe, measure);
