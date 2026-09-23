import { useMediaQuery } from "@/useMediaQuery";

/** Mantine's `sm` breakpoint, the same 48em `mobile.css` keys its form-control
 *  sizing off. */
const PHONE = "(max-width: 48em)";

/** True on phone-sized viewports. Use it for behaviour that differs on touch —
 *  a row that opens a sheet instead of showing hover-only icons, a table that
 *  becomes cards. For pure show/hide, prefer an `md:` variant. */
export const useIsMobile = (): boolean => useMediaQuery(PHONE);
