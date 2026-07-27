import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";

/**
 * A microcharts `format` function for Hearth amounts. Every chart is fed
 * integer minor units, and microcharts interpolates (differences, ratios,
 * decimated envelopes) before formatting — so round back to whole minor units
 * first, or a label reads `£1,234.5600000001`.
 */
export const moneyFormat =
    (money: MoneyFormat) =>
    (minor: number): string =>
        formatMoney(Math.round(minor), money);

/**
 * Accessible summary for a `<Progress>` used as a share-of-total bar. Its
 * generated wording is "42% complete", which reads as progress towards a goal —
 * wrong for "42% of what we spent".
 */
export const shareSummary = (part: number, whole: number, of: string): string =>
    `${whole > 0 ? Math.round((part / whole) * 100) : 0}% of ${of}`;
