import { annualise, normaliseToMonthly, roundMinor, type Recurrence } from '../../shared/recurrence'
import { subtractMonths } from '../../shared/dates'

// ---------------------------------------------------------------------------
// Subscription / bill review (issue #70)
// ---------------------------------------------------------------------------
// Rank bills by *what's growing*, not by size — the fastest-climbing bill is the
// one worth cancelling and it's invisible in a list sorted by amount. Each bill
// is reduced to a dated series of its per-recurrence price, from which we derive
// the 12-month change (percent + annualised £) and a "creep" summary (how many
// times it has risen, and by how much since it was first recorded).
//
// Two price sources per bill (issue's data-sources note):
//   * ACTUAL payments — spend_transaction rows linked via expenseId (#67): what
//     was really paid, the truth. Preferred when the bill has a couple of them.
//   * STATED prices — bill_price effective-dated history (#68): the bill's
//     recorded amount over time. The fallback for bills with no linked spends.
// They diverge (you pay a new price for months before updating the bill, or
// never update it), so actuals win where they exist.
// ---------------------------------------------------------------------------

/** Which price series drove a row's figures. */
export type BillReviewSource = 'actual' | 'stated'

export interface BillReviewBillInput {
    id: string
    name: string
    recurrence: Recurrence
    /** The bill's current per-recurrence amount (minor units). */
    currentAmount: number
    /** Actual payments logged against this bill (spend_transaction.expenseId). */
    actuals: { date: string; amount: number }[]
    /** Effective-dated stated prices (bill_price), any order. */
    priceHistory: { effectiveDate: string; amount: number }[]
}

export interface BillReviewRow {
    id: string
    name: string
    recurrence: Recurrence
    /** Which series the figures came from. */
    source: BillReviewSource
    /** Current per-recurrence price (minor units). */
    currentAmount: number
    /** Current monthly-equivalent (minor units, rounded) — the comparable cost now. */
    currentMonthly: number
    /** Per-recurrence price in effect 12 months ago — the change baseline. */
    baselineAmount: number
    /** Percent change over the last 12 months; null when the baseline is zero. */
    changePct: number | null
    /** Annualised change in spend over the last 12 months (minor units, signed). */
    changeAnnual: number
    /** Number of price rises across the whole recorded series (the creep signal). */
    riseCount: number
    /** Total percent change since the first recorded price; null when it was zero. */
    creepPct: number | null
    /** Date of the first recorded price (YYYY-MM-DD); null with no real history. */
    firstObserved: string | null
    /** Whether there's more than one observation — i.e. a trend exists at all. */
    hasHistory: boolean
}

interface Point {
    date: string
    amount: number
}

const byDate = (a: Point, b: Point): number => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)

/** Pick the series to review: prefer actuals once a bill has at least two logged
 *  payments (one payment tells you nothing about change). Otherwise fall back to
 *  the stated price history, ensuring the bill's current amount is its last point
 *  so an edit not yet reflected in history still counts. */
function chooseSeries(bill: BillReviewBillInput, today: string): { source: BillReviewSource; points: Point[] } {
    const actuals = bill.actuals
        .filter((a) => a.amount > 0)
        .map((a) => ({ date: a.date, amount: a.amount }))
        .sort(byDate)
    if (actuals.length >= 2) return { source: 'actual', points: actuals }

    const stated = bill.priceHistory
        .map((r) => ({ date: r.effectiveDate, amount: r.amount }))
        .sort(byDate)
    const last = stated[stated.length - 1]
    if (!last || last.amount !== bill.currentAmount) {
        stated.push({ date: today, amount: bill.currentAmount })
    }
    return { source: 'stated', points: stated }
}

/** Reduce a bill's price sources to the review figures (issue #70). Pure — the
 *  router supplies the data and `today`; sorting is a separate concern. */
export function computeBillReview(bills: BillReviewBillInput[], today: string): BillReviewRow[] {
    const windowStart = subtractMonths(today, 12)

    return bills.map((bill) => {
        const { source, points } = chooseSeries(bill, today)
        const rec = bill.recurrence
        const current = points[points.length - 1]!.amount
        const first = points[0]!

        // Baseline = the price in effect 12 months ago: the latest point at or
        // before the window start. If the whole series is younger than that, the
        // earliest point stands in.
        let baseline = first.amount
        for (const p of points) {
            if (p.date <= windowStart) baseline = p.amount
        }

        // Creep = increases between distinct price levels across the whole series.
        // Collapsing consecutive equals means a bill paid at the same price for
        // months counts as one level, not many.
        let riseCount = 0
        let prevLevel = first.amount
        for (const p of points) {
            if (p.amount === prevLevel) continue
            if (p.amount > prevLevel) riseCount += 1
            prevLevel = p.amount
        }

        const hasHistory = points.length > 1

        return {
            id: bill.id,
            name: bill.name,
            recurrence: rec,
            source,
            currentAmount: current,
            currentMonthly: roundMinor(normaliseToMonthly(current, rec)),
            baselineAmount: baseline,
            changePct: baseline !== 0 ? (current - baseline) / baseline : null,
            changeAnnual: annualise(current, rec) - annualise(baseline, rec),
            riseCount,
            creepPct: first.amount !== 0 ? (current - first.amount) / first.amount : null,
            firstObserved: hasHistory ? first.date : null,
            hasHistory,
        }
    })
}
