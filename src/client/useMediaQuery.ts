import { useEffect, useState } from "react";

/** Subscribes to a media query. Resolved on first render rather than in an
 *  effect: the app is client-only, so there's no hydration to mismatch, and a
 *  frame of the wrong layout is worse than the check.
 *
 *  Only for behaviour that differs — which component to render, which mode to
 *  open in. For pure show/hide, use a responsive variant: no re-render. */
export const useMediaQuery = (query: string): boolean => {
    const [matches, setMatches] = useState(
        () => window.matchMedia(query).matches
    );

    useEffect(() => {
        const list = window.matchMedia(query);
        const sync = () => setMatches(list.matches);

        // Re-read on mount too: the viewport can have changed between the
        // first render and this effect.
        sync();
        list.addEventListener("change", sync);

        return () => list.removeEventListener("change", sync);
    }, [query]);

    return matches;
};
