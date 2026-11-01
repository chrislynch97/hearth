import { useEffect, useState } from "react";

const PHONE = "(max-width: 639px)";
/** Past this it's a drag, not a tap with a shaky thumb. */
const START_PX = 8;
const DISMISS_PX = 120;
const FLICK_PX_PER_MS = 0.6;
const SETTLE_MS = 180;

/** Whether a finished drag means "close": far enough, or a quick flick. */
export const shouldDismiss = (distance: number, velocity: number): boolean =>
    distance > DISMISS_PX || velocity > FLICK_PX_PER_MS;

/** Is anything under the finger, up to the sheet, scrolled down? Pulling then
 *  belongs to that scroller. */
const scrolled = (target: EventTarget | null, sheet: HTMLElement): boolean => {
    let node = target instanceof Element ? target : null;
    while (node) {
        if (node.scrollTop > 0) return true;
        if (node === sheet) return false;
        node = node.parentElement;
    }

    return false;
};

/** Pull a bottom sheet down to dismiss it, on a phone. Returns the ref for the
 *  sheet. Listens natively, as only a non-passive listener can stop the page
 *  rubber-banding, and Escape closes it the way every other route out does. */
export const useSheetDrag = () => {
    const [sheet, setSheet] = useState<HTMLElement | null>(null);

    useEffect(() => {
        if (!sheet) return;

        let startY = 0;
        let startTime = 0;
        let distance = 0;
        let armed = false;
        let dragging = false;

        const start = (event: TouchEvent) => {
            const touch = event.touches[0];
            armed =
                event.touches.length === 1 &&
                window.matchMedia(PHONE).matches &&
                !scrolled(event.target, sheet);
            dragging = false;
            distance = 0;
            startY = touch?.clientY ?? 0;
            startTime = event.timeStamp;
        };

        const move = (event: TouchEvent) => {
            if (!armed) return;

            distance = (event.touches[0]?.clientY ?? startY) - startY;
            if (!dragging && distance < -START_PX) armed = false;
            if (!dragging && distance > START_PX) dragging = true;
            if (!dragging) return;

            event.preventDefault();
            sheet.style.transition = "none";
            sheet.style.transform = `translateY(${Math.max(0, distance)}px)`;
        };

        const end = (event: TouchEvent) => {
            if (!dragging) return;

            dragging = false;
            armed = false;
            const velocity = distance / (event.timeStamp - startTime || 1);
            sheet.style.transition = `transform ${SETTLE_MS}ms ease-out`;
            if (!shouldDismiss(distance, velocity)) {
                sheet.style.transform = "";
                return;
            }

            sheet.style.transform = "translateY(100%)";
            window.setTimeout(() => {
                // It has already slid away; the exit animation would replay it.
                sheet.style.animation = "none";
                document.dispatchEvent(
                    new KeyboardEvent("keydown", {
                        key: "Escape",
                        bubbles: true,
                    })
                );
            }, SETTLE_MS);
        };

        sheet.addEventListener("touchstart", start, { passive: true });
        sheet.addEventListener("touchmove", move, { passive: false });
        sheet.addEventListener("touchend", end);
        sheet.addEventListener("touchcancel", end);

        return () => {
            sheet.removeEventListener("touchstart", start);
            sheet.removeEventListener("touchmove", move);
            sheet.removeEventListener("touchend", end);
            sheet.removeEventListener("touchcancel", end);
        };
    }, [sheet]);

    return setSheet;
};
