/** iPadOS reports itself as a Mac, so touch points give it away. */
export const isIos = (
    userAgent: string,
    platform: string,
    maxTouchPoints: number
): boolean =>
    /iP(hone|ad|od)/.test(userAgent) ||
    (platform === "MacIntel" && maxTouchPoints > 1);

/** Stops iOS zooming in on a focused field, whatever its size. iOS still lets
 *  people pinch with `maximum-scale=1`; Android wouldn't, so only iOS gets it. */
export const lockIosFocusZoom = (): void => {
    if (!isIos(navigator.userAgent, navigator.platform, navigator.maxTouchPoints))
        return;

    const viewport = document.querySelector('meta[name="viewport"]');
    viewport?.setAttribute(
        "content",
        `${viewport.getAttribute("content") ?? ""}, maximum-scale=1`
    );
};
