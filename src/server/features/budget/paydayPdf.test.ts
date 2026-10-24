import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../../db/testdb'
import { seedDemo } from '../../db/demo'
import { DEFAULT_HOUSEHOLD_ID } from '../../trpc/tenant'
import { currencySymbol, paydayPdfForHousehold, renderPaydayPdf, textRuns, type PaydayPdfFormat } from './paydayPdf'
import type { PaydaySheet } from './paydaySheet'

const format: PaydayPdfFormat = {
  money: { symbol: '£', decimalPlaces: 2 },
  currencyCode: 'GBP',
  locale: 'en-GB',
  dateFormat: 'medium',
}

// formatMoney's no-break space between a code and its amount.
const NBSP = String.fromCharCode(0xa0)

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

describe('textRuns', () => {
  it('draws latin-ext letters and currency symbols from the subset that has them', () => {
    expect(textRuns('Łukasz & Zoë')).toEqual([
      { subset: 'latin-ext', text: 'Ł' },
      { subset: 'latin', text: 'ukasz & Zoë' },
    ])
    expect(textRuns('10 zł · Tiết')).toEqual([
      { subset: 'latin', text: '10 z' },
      { subset: 'latin-ext', text: 'ł' },
      { subset: 'latin', text: ' · Ti' },
      { subset: 'vietnamese', text: 'ế' },
      { subset: 'latin', text: 't' },
    ])
    expect(textRuns('Gdańsk — £5')).toEqual([
      { subset: 'latin', text: 'Gda' },
      { subset: 'latin-ext', text: 'ń' },
      { subset: 'latin', text: 'sk — £5' },
    ])
  })
})

describe('currencySymbol', () => {
  it('keeps a symbol the font can draw', () => {
    expect(currencySymbol(format)).toBe('£')
    expect(currencySymbol({ money: { symbol: 'zł', decimalPlaces: 2, symbolPosition: 'suffix' }, currencyCode: 'PLN' })).toBe('zł')
  })

  it('falls back to the currency code for a symbol the font lacks', () => {
    expect(currencySymbol({ money: { symbol: '₹', decimalPlaces: 2 }, currencyCode: 'INR' })).toBe(`INR${NBSP}`)
    expect(currencySymbol({ money: { symbol: '₩', decimalPlaces: 0, symbolPosition: 'suffix' }, currencyCode: 'KRW' })).toBe('KRW')
  })
})

describe('renderPaydayPdf', () => {
  it('renders non-latin-1 names and currency, and a name too long for its split', async () => {
    const pdf = await renderPaydayPdf(
      sheet({
        householdName: 'Łukasz & Zoë Wróbel',
        people: [
          { name: 'Alexandra-Catherine Montgomery-Smythe of Somewhere', personalPots: 123456, jointContribution: 98765, setAside: 222221, ownAccount: 0 },
        ],
        potGroups: [{ ownerName: 'Łukasz', pots: [{ name: 'Wakacje — Gdańsk', amount: 246912 }], total: 246912 }],
      }),
      { ...format, money: { symbol: '₹', decimalPlaces: 2 }, currencyCode: 'INR' },
    )

    expect(pageCount(pdf)).toBe(1)
  })

  it('renders an empty household as a one-page PDF', async () => {
    const pdf = await renderPaydayPdf(sheet(), format)

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pageCount(pdf)).toBe(1)
  })

  it('renders every section, including the pooled joint block and suffix money', async () => {
    const pdf = await renderPaydayPdf(
      sheet({
        people: [{ name: 'Alice', personalPots: 7000, jointContribution: 1000, setAside: 8000, ownAccount: 0 }],
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
