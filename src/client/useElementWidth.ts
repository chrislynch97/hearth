import { useCallback, useState } from "react";

/** An element's rendered width, kept current as it resizes. For charts that
 *  draw to a pixel width (microcharts) inside a fluid layout. Zero until the
 *  element has been measured. */
export const useElementWidth = <T extends HTMLElement>() => {
    const [width, setWidth] = useState(0);

    const ref = useCallback((element: T | null) => {
        if (!element) return;

        const observer = new ResizeObserver(([entry]) => {
            if (entry) setWidth(Math.floor(entry.contentRect.width));
        });
        observer.observe(element);

        return () => observer.disconnect();
    }, []);

    return { ref, width };
};
