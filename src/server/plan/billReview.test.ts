import { describe, it, expect } from 'vitest'
import { computeBillReview, type BillReviewBillInput, type BillReviewRow } from './billReview'

const TODAY = '2026-07-19'

/** A bill with no actuals and no history — just its current amount. */
function bill(partial: Partial<BillReviewBillInput> & Pick<BillReviewBillInput, 'id' | 'name'>): BillReviewBillInput {
    return {
        recurrence: 'monthly',
        currentAmount: 0,
        actuals: [],
        priceHistory: [],
        ...partial,
    }
}

function only(bills: BillReviewBillInput[]): BillReviewRow {
    const rows = computeBillReview(bills, TODAY)
    expect(rows).toHaveLength(1)
    return rows[0]!
}

describe('computeBillReview — stated price history', () => {
    it('reports no change and no history for a bill with only a current price', () => {
        const row = only([bill({ id: 'a', name: 'Rent', currentAmount: 150000 })])
        expect(row.source).toBe('stated')
        expect(row.hasHistory).toBe(false)
        expect(row.changeAnnual).toBe(0)
        expect(row.changePct).toBe(0)
        expect(row.riseCount).toBe(0)
        expect(row.firstObserved).toBeNull()
    })

    it('computes the 12-month change against the price in effect a year ago', () => {
        // Netflix: 1099 (30mo ago) → 1299 (14mo ago) → current 1299. A year ago the
        // price was already 1299, so the *12-month* change is measured from there
        // even though the bill has climbed more over its life.
        const row = only([
            bill({
                id: 'n',
                name: 'Netflix',
                currentAmount: 1299,
                priceHistory: [
                    { effectiveDate: '2024-01-01', amount: 1099 },
                    { effectiveDate: '2025-05-01', amount: 1299 },
                ],
            }),
        ])
        expect(row.baselineAmount).toBe(1299)
        expect(row.changeAnnual).toBe(0)
        expect(row.changePct).toBe(0)
    })

    it('measures 12-month change when a rise lands inside the window', () => {
        // 3000 until 2 months ago, then 3600. Baseline (a year ago) is 3000.
        const row = only([
            bill({
                id: 'b',
                name: 'Broadband',
                currentAmount: 3600,
                priceHistory: [
                    { effectiveDate: '2024-01-01', amount: 3000 },
                    { effectiveDate: '2026-05-01', amount: 3600 },
                ],
            }),
        ])
        expect(row.baselineAmount).toBe(3000)
        expect(row.changePct).toBeCloseTo(0.2, 5)
        // Monthly bill: annualised £ change = (3600 − 3000) × 12.
        expect(row.changeAnnual).toBe(7200)
    })

    it('detects creep: counts rises and total change since the first record', () => {
        const row = only([
            bill({
                id: 's',
                name: 'Streaming',
                currentAmount: 1800,
                priceHistory: [
                    { effectiveDate: '2023-06-01', amount: 1000 },
                    { effectiveDate: '2024-04-01', amount: 1200 },
                    { effectiveDate: '2025-05-01', amount: 1500 },
                    { effectiveDate: '2026-02-01', amount: 1800 },
                ],
            }),
        ])
        expect(row.riseCount).toBe(3)
        expect(row.creepPct).toBeCloseTo(0.8, 5) // 1000 → 1800
        expect(row.firstObserved).toBe('2023-06-01')
    })

    it('falls back to the earliest record when the series is younger than a year', () => {
        const row = only([
            bill({
                id: 'y',
                name: 'New sub',
                currentAmount: 1200,
                priceHistory: [{ effectiveDate: '2026-03-01', amount: 1000 }],
            }),
        ])
        expect(row.baselineAmount).toBe(1000)
        expect(row.changePct).toBeCloseTo(0.2, 5)
    })

    it('appends the current amount when history lags behind it', () => {
        // History ends at 3000 but the bill now says 3200 (edited without a price
        // note) — the current amount must still be the latest point.
        const row = only([
            bill({
                id: 'e',
                name: 'Energy',
                currentAmount: 3200,
                priceHistory: [{ effectiveDate: '2026-05-01', amount: 3000 }],
            }),
        ])
        expect(row.currentAmount).toBe(3200)
        expect(row.riseCount).toBe(1)
    })

    it('normalises across recurrence so a yearly bill is not enormous', () => {
        // Home insurance, yearly: 24000 → 27600. Annual £ change is just the raw
        // difference (annualise ×1), not multiplied up.
        const row = only([
            bill({
                id: 'h',
                name: 'Home Insurance',
                recurrence: 'yearly',
                currentAmount: 27600,
                priceHistory: [
                    { effectiveDate: '2024-05-01', amount: 24000 },
                    { effectiveDate: '2026-05-01', amount: 27600 },
                ],
            }),
        ])
        expect(row.changeAnnual).toBe(3600)
        // Quarterly counterpart: a 100-minor per-quarter rise annualises to 400.
        const q = only([
            bill({
                id: 'w',
                name: 'Water',
                recurrence: 'quarterly',
                currentAmount: 13800,
                priceHistory: [
                    { effectiveDate: '2024-05-01', amount: 12000 },
                    { effectiveDate: '2026-05-01', amount: 13800 },
                ],
            }),
        ])
        expect(q.changeAnnual).toBe((13800 - 12000) * 4)
    })
})

describe('computeBillReview — actual payments preferred', () => {
    it('uses actuals over stated history once there are at least two', () => {
        const row = only([
            bill({
                id: 'b',
                name: 'Broadband',
                currentAmount: 3200, // the bill lags reality
                priceHistory: [{ effectiveDate: '2024-01-01', amount: 3200 }],
                actuals: [
                    { date: '2025-06-20', amount: 3000 },
                    { date: '2026-01-20', amount: 3400 },
                    { date: '2026-07-20', amount: 3400 },
                ],
            }),
        ])
        expect(row.source).toBe('actual')
        expect(row.currentAmount).toBe(3400) // from the latest payment, not the bill
        expect(row.riseCount).toBe(1)
    })

    it('ignores refunds (negative amounts) in the actuals series', () => {
        const row = only([
            bill({
                id: 'b',
                name: 'Broadband',
                currentAmount: 3400,
                actuals: [
                    { date: '2025-06-20', amount: 3000 },
                    { date: '2025-09-20', amount: -3000 }, // refund
                    { date: '2026-07-20', amount: 3400 },
                ],
            }),
        ])
        expect(row.source).toBe('actual')
        expect(row.riseCount).toBe(1)
        expect(row.currentAmount).toBe(3400)
    })

    it('falls back to stated history when there is only one payment', () => {
        const row = only([
            bill({
                id: 'b',
                name: 'Broadband',
                currentAmount: 3200,
                priceHistory: [
                    { effectiveDate: '2024-01-01', amount: 2800 },
                    { effectiveDate: '2026-05-01', amount: 3200 },
                ],
                actuals: [{ date: '2026-07-20', amount: 3400 }],
            }),
        ])
        expect(row.source).toBe('stated')
        expect(row.currentAmount).toBe(3200)
    })
})
