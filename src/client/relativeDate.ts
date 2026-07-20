/** How long ago a date was, in words. Bands the gap so an old date reads as
 *  "1y ago" rather than an unhelpfully precise day count. Future dates read as
 *  "today" — callers show staleness, and "in 3 days" is never the answer. */
export const ageLabel = (days: number): string => {
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 31) return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
};
