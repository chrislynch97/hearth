// ---------------------------------------------------------------------------
// Bill-review ranking (issue #70) — shared so the page and its test agree on it.
// ---------------------------------------------------------------------------
// The figures are computed server-side (see server/plan/billReview.ts); ranking
// is a pure UI concern the page re-runs when the user flips the sort metric.

/** How to rank the review — by annualised £ change or by percent. Both surface
 *  the fast movers; the issue argues for offering both (percent alone misleads on
 *  small bills, £/yr alone hides a big-percent riser on a mid-size bill). */
export type BillReviewSort = "annual" | "percent";

/** The fields ranking needs — a subset of the server's review row. */
export interface BillReviewSortable {
    name: string;
    changeAnnual: number;
    changePct: number | null;
    hasHistory: boolean;
}

/** Rank rows by the chosen metric, biggest increase first. A bill with no
 *  recorded history sinks below an equal-valued one that has some (a genuine
 *  "unchanged for years" is more reassuring than "never recorded"); ties then
 *  break by name. Never mutates `rows`. */
export function sortBillReview<T extends BillReviewSortable>(
    rows: T[],
    metric: BillReviewSort
): T[] {
    const value = (r: T): number =>
        metric === "percent"
            ? (r.changePct ?? Number.NEGATIVE_INFINITY)
            : r.changeAnnual;

    return [...rows].sort((a, b) => {
        const diff = value(b) - value(a);
        if (diff !== 0) return diff;
        if (a.hasHistory !== b.hasHistory) return a.hasHistory ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
}
