import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../../db/testdb'
import { seedDemo } from '../../db/demo'
import { DEFAULT_HOUSEHOLD_ID } from '../../trpc/tenant'
import { paydayPdfForHousehold, renderPaydayPdf, type PaydayPdfFormat } from './paydayPdf'
import type { PaydaySheet } from './paydaySheet'

const format: PaydayPdfFormat = {
  money: { symbol: '£', decimalPlaces: 2 },
  locale: 'en-GB',
  dateFormat: 'medium',
}

const pageCount = (pdf: Buffer) => Number(pdf.toString('latin1').match(/\/Type \/Pages\s+\/Count (\d+)/)?.[1])

function sheet(overrides: Partial<PaydaySheet> = {}): PaydaySheet {
  return {
    householdName: 'The Smiths',
    period: { start: '2026-09-25', end: '2026-10-24' },
    unit: '/mo',
    generatedAt: new Date(2026, 9, 23, 9, 30),
    people: [],
    potGroups: [],
    jointPotsTotal: 0,
    jointPool: null,
    mainAccount: { rows: [], total: 0 },
    unassigned: 0,
    ...overrides,
  }
}

describe('renderPaydayPdf', () => {
  it('renders an empty household as a one-page PDF', async () => {
    const pdf = await renderPaydayPdf(sheet(), format)

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pageCount(pdf)).toBe(1)
  })

  it('renders every section, including the pooled joint block and suffix money', async () => {
    const pdf = await renderPaydayPdf(
      sheet({
        people: [{ name: 'Alice', personalPots: 7000, jointContribution: 1000, setAside: 8000 }],
        potGroups: [{ ownerName: 'Alice', pots: [{ name: 'Phone', amount: 7000 }], total: 7000 }],
        jointPotsTotal: 2000,
        jointPool: { totalIn: 50000, jointCosts: 42000, surplus: -800 },
        mainAccount: { rows: [{ name: 'Home', amount: 12000 }], total: 12000 },
        unassigned: 500,
      }),
      { ...format, money: { symbol: '€', decimalPlaces: 2, symbolPosition: 'suffix', groupSeparator: '.', decimalSeparator: ',' } },
    )

    expect(pageCount(pdf)).toBe(1)
  })

  it('flows a long pot list onto another page rather than cutting it off', async () => {
    const pots = Array.from({ length: 60 }, (_, i) => ({ name: `Pot ${i}`, amount: 100 }))
    const pdf = await renderPaydayPdf(sheet({ potGroups: [{ ownerName: 'Alice', pots, total: 6000 }] }), format)

    expect(pageCount(pdf)).toBe(2)
  })
})

describe('paydayPdfForHousehold', () => {
  it('builds a one-page sheet from the demo household, named for the period', async () => {
    const db = await makeTestDb()
    await seedDemo(db)

    const { filename, pdf } = await paydayPdfForHousehold(db, DEFAULT_HOUSEHOLD_ID)

    expect(filename).toMatch(/^hearth-payday-\d{4}-\d{2}-\d{2}\.pdf$/)
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pageCount(pdf)).toBe(1)
  })
})
