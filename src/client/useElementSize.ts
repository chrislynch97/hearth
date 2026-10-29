import { useCallback, useState } from "react";

/** An element's rendered size, kept current as it resizes — for a chart that
 *  draws to pixels (microcharts) but should fill a fluid box both ways. Zero
 *  until the element has been measured. */
export const useElementSize = <T extends HTMLElement>() => {
    const [size, setSize] = useState({ width: 0, height: 0 });

    const ref = useCallback((element: T | null) => {
        if (!element) return;

        const observer = new ResizeObserver(([entry]) => {
            if (!entry) return;
            setSize({
                width: Math.floor(entry.contentRect.width),
                height: Math.floor(entry.contentRect.height),
            });
        });
        observer.observe(element);

        return () => observer.disconnect();
    }, []);

    return { ref, ...size };
};
