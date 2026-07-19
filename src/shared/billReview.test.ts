import { describe, it, expect } from 'vitest'
import { sortBillReview, type BillReviewSortable } from './billReview'

function row(partial: Partial<BillReviewSortable> & { name: string }): BillReviewSortable {
    return { changeAnnual: 0, changePct: 0, hasHistory: true, ...partial }
}

describe('sortBillReview', () => {
    const big = row({ name: 'Broadband', changeAnnual: 12000, changePct: 1 / 3 })
    const small = row({ name: 'Tiny sub', changeAnnual: 1440, changePct: 0.4 })
    const flat = row({ name: 'Phone', changeAnnual: 0, changePct: null, hasHistory: false })
    const rows = [big, small, flat]

    it('by £/yr puts the biggest annual increase first, unchanged last', () => {
        expect(sortBillReview(rows, 'annual').map((r) => r.name)).toEqual(['Broadband', 'Tiny sub', 'Phone'])
    })

    it('by percent puts the biggest proportional riser first', () => {
        // The tiny sub rose 40%, broadband ~33% — percent flips their order.
        expect(sortBillReview(rows, 'percent').map((r) => r.name)).toEqual(['Tiny sub', 'Broadband', 'Phone'])
    })

    it('does not mutate the input array', () => {
        const before = rows.map((r) => r.name)
        sortBillReview(rows, 'annual')
        expect(rows.map((r) => r.name)).toEqual(before)
    })

    it('sinks a no-history bill below an equal-valued one that has history', () => {
        const noRecord = row({ name: 'A no-record', changeAnnual: 0, changePct: 0, hasHistory: false })
        const flatHistory = row({ name: 'Z flat-with-history', changeAnnual: 0, changePct: 0, hasHistory: true })
        expect(sortBillReview([noRecord, flatHistory], 'annual').map((r) => r.name)).toEqual([
            'Z flat-with-history',
            'A no-record',
        ])
    })

    it('ranks a null-percent bill below any real percent when sorting by percent', () => {
        const dropped = row({ name: 'Fell', changeAnnual: -1200, changePct: -0.1 })
        const noBaseline = row({ name: 'No baseline', changeAnnual: 500, changePct: null })
        expect(sortBillReview([noBaseline, dropped], 'percent').map((r) => r.name)).toEqual(['Fell', 'No baseline'])
    })
})
