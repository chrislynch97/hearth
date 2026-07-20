/** A ms epoch → local `YYYY-MM-DD`, so it can be fed to the household useFormatDate
 *  (en-CA renders the ISO shape in the local timezone). */
export const msToLocalIso = (ms: number): string =>
    new Date(ms).toLocaleDateString("en-CA");
