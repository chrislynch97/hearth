/** Pot interest rates, entered as AER and held in hundredths of a percent
 *  (450 = 4.50%), like money in minor units. */

const RATE = /^\d{1,3}(\.\d{1,2})?$/;

const bare = (text: string): string => text.trim().replace(/\s*%$/, "");

/** Hundredths of a percent → the text a rate field starts with. */
export const rateInput = (bp: number | null): string =>
    bp === null ? "" : (bp / 100).toFixed(2);

/** A rate field: blank, or up to 100 with at most two decimals; a `%` is fine. */
export const validRate = (text: string): true | string => {
    const value = bare(text);
    if (value === "") return true;
    return (
        (RATE.test(value) && Number(value) <= 100) ||
        "Enter a rate like 4.5, up to 100."
    );
};

/** A rate field's text → hundredths of a percent. Blank or 0 is no interest. */
export const parseRate = (text: string): number | null => {
    const value = bare(text);
    const bp = value === "" ? 0 : Math.round(Number(value) * 100);
    return bp > 0 ? bp : null;
};

export const formatAer = (bp: number): string =>
    `${(bp / 100).toFixed(2)}% AER`;
