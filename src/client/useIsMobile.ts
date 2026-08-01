import { useMediaQuery } from "@mantine/hooks";

/** True on phone-sized viewports — Mantine's `sm` breakpoint, the same 48em
 *  `mobile.css` keys its form-control sizing off.
 *
 *  Use this for behaviour that differs on touch (a row that opens a sheet
 *  instead of showing hover-scale icons, a table that becomes cards). For pure
 *  show/hide, prefer Mantine's `visibleFrom`/`hiddenFrom` — those don't need a
 *  re-render. Resolved on first render rather than in an effect: the app is
 *  client-only, so there's no hydration to mismatch, and a frame of the desktop
 *  layout on a phone is worse than the check. */
export const useIsMobile = (): boolean =>
    useMediaQuery("(max-width: 48em)", false, {
        getInitialValueInEffect: false,
    }) ?? false;
