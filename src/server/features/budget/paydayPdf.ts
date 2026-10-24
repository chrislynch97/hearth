import { createRequire } from 'node:module'
import * as fontkit from 'fontkit'
import PDFDocument from 'pdfkit'
import type { DB } from '../../db/client'
import { scopeWhere } from '../../trpc/tenant'
import { category } from '../../db/schema'
import { loadFundingPlan } from './fundingLoader'
import { buildPaydaySheet, type PaydaySheet } from './paydaySheet'
import { formatMoney } from "@shared/money"
import { formatDate, type DateFormat } from "@shared/dateFormat"
import { todayIso } from "@shared/dates"

export interface PaydayPdfFormat {
  money: Parameters<typeof formatMoney>[1]
  /** ISO code, printed instead of a symbol the font has no glyph for (₹, ₩). */
  currencyCode: string
  locale: string
  dateFormat: DateFormat
}

// Hearth's UI font, embedded so the file renders the same offline. fontsource
// splits it by unicode subset and pdfkit has no glyph fallback, so each run of
// text is drawn from the subset that has its glyphs (ł and ń live in latin-ext).
// Coverage comes from the font files: fontsource's unicode ranges overstate it.
const require = createRequire(import.meta.url)
const SUBSETS = ['latin', 'latin-ext', 'vietnamese'] as const
type Subset = (typeof SUBSETS)[number]
type Weight = 'regular' | 'bold'
const WEIGHTS: Record<Weight, number> = { regular: 400, bold: 600 }

const fontFile = (subset: Subset, weight: Weight) =>
  require.resolve(`@fontsource/hanken-grotesk/files/hanken-grotesk-${subset}-${WEIGHTS[weight]}-normal.woff`)

let coverage: Array<{ subset: Subset; font: fontkit.Font }> | undefined
const fontsBySubset = () =>
  (coverage ??= SUBSETS.map((subset) => ({ subset, font: fontkit.openSync(fontFile(subset, 'regular')) as fontkit.Font })))

/** The subset with a glyph for `codePoint`, or null when none has one. */
export function subsetFor(codePoint: number): Subset | null {
  return fontsBySubset().find((c) => c.font.hasGlyphForCodePoint(codePoint))?.subset ?? null
}

// Same as formatMoney's suffix spacing: the code never wraps away from its amount.
const NO_BREAK_SPACE = String.fromCharCode(0xa0)

/** True when every character of `text` has a glyph in some subset. */
const drawable = (text: string) => [...text].every((char) => subsetFor(char.codePointAt(0) ?? 0) !== null)

/** The currency symbol to print: the household's own, or its code when the font
 *  can't draw the symbol, spaced like `INR 2,469.12`. */
export function currencySymbol(format: Pick<PaydayPdfFormat, 'money' | 'currencyCode'>): string {
  if (drawable(format.money.symbol)) return format.money.symbol
  return format.money.symbolPosition === 'suffix' ? format.currencyCode : `${format.currencyCode}${NO_BREAK_SPACE}`
}

/** Split text into runs that each draw from a single subset. A character no
 *  subset has stays with latin, where it prints as a blank box. */
export function textRuns(text: string): Array<{ subset: Subset; text: string }> {
  const runs: Array<{ subset: Subset; text: string }> = []
  for (const char of text) {
    const subset = subsetFor(char.codePointAt(0) ?? 0) ?? 'latin'
    const last = runs[runs.length - 1]
    if (last?.subset === subset) last.text += char
    else runs.push({ subset, text: char })
  }
  return runs
}

const INK = '#1f2421'
const MUTED = '#6b716d'
const RULE = '#d9dcd9'
const WARN = '#9a4a12'

const MARGIN = 48
const AMOUNT_WIDTH = 150
const ROW = 17

/** Render the payday sheet as an A4 PDF. Usually one page; a long pot list
 *  flows onto a second rather than being cut off. */
export function renderPaydayPdf(sheet: PaydaySheet, format: PaydayPdfFormat): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    info: {
      Title: `Payday sheet — ${sheet.householdName}`,
      Creator: 'Hearth',
      CreationDate: sheet.generatedAt,
    },
  })
  const fontName = (weight: Weight, subset: Subset) => `${weight}-${subset}`
  for (const subset of SUBSETS) {
    for (const weight of ['regular', 'bold'] as const) doc.registerFont(fontName(weight, subset), fontFile(subset, weight))
  }

  const chunks: Buffer[] = []
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  const left = MARGIN
  const width = doc.page.width - MARGIN * 2
  const bottom = doc.page.height - MARGIN
  let y = MARGIN

  const moneyFormat = { ...format.money, symbol: currencySymbol(format) }
  const money = (amount: number) => formatMoney(amount, moneyFormat)
  const perPeriod = (amount: number) => `${money(amount)}${sheet.unit}`

  const measure = (text: string, weight: Weight, size: number) =>
    textRuns(text).reduce((sum, run) => sum + doc.font(fontName(weight, run.subset)).fontSize(size).widthOfString(run.text), 0)

  /** Draw one line at (x, top), ellipsised to `maxWidth`. Returns the width drawn. */
  const draw = (
    text: string,
    x: number,
    top: number,
    opts: { size: number; color: string; weight?: Weight; maxWidth?: number; align?: 'left' | 'right' },
  ) => {
    const weight = opts.weight ?? 'regular'
    let line = text
    if (opts.maxWidth !== undefined && measure(line, weight, opts.size) > opts.maxWidth) {
      const chars = [...text]
      while (chars.length > 0 && measure(`${chars.join('')}…`, weight, opts.size) > opts.maxWidth) chars.pop()
      line = `${chars.join('').trimEnd()}…`
    }
    const lineWidth = measure(line, weight, opts.size)
    let cursor = opts.align === 'right' && opts.maxWidth !== undefined ? x + opts.maxWidth - lineWidth : x
    doc.fillColor(opts.color)
    for (const run of textRuns(line)) {
      doc.font(fontName(weight, run.subset)).fontSize(opts.size).text(run.text, cursor, top, { lineBreak: false })
      cursor += doc.widthOfString(run.text)
    }
    return lineWidth
  }

  const ensureSpace = (height: number) => {
    if (y + height <= bottom) return
    doc.addPage()
    y = MARGIN
  }

  const heading = (text: string) => {
    ensureSpace(ROW * 3)
    y += 14
    draw(text, left, y, { size: 12, color: INK, weight: 'bold', maxWidth: width })
    y += 20
  }

  /** One label/amount line; `detail` follows the label in muted type, or drops to
   *  its own line when the label leaves no room, so no figure in it is cut off. */
  const row = (label: string, amount: string, opts: { bold?: boolean; indent?: number; detail?: string } = {}) => {
    ensureSpace(ROW)
    const indent = opts.indent ?? 0
    const labelWidth = width - AMOUNT_WIDTH - indent
    const weight = opts.bold ? 'bold' : 'regular'
    const used = draw(label, left + indent, y, { size: 10, color: INK, weight, maxWidth: labelWidth })
    draw(amount, left + width - AMOUNT_WIDTH, y, { size: 10, color: INK, weight, maxWidth: AMOUNT_WIDTH, align: 'right' })
    y += ROW
    if (!opts.detail) return

    const room = labelWidth - used - 10
    if (measure(opts.detail, 'regular', 9) <= room) {
      draw(opts.detail, left + indent + used + 10, y - ROW + 1, { size: 9, color: MUTED })
      return
    }
    ensureSpace(ROW)
    draw(opts.detail, left + indent + 12, y - 3, { size: 9, color: MUTED, maxWidth: width - indent - 12 })
    y += ROW - 3
  }

  const rule = () => {
    doc.moveTo(left, y + 1).lineTo(left + width, y + 1).lineWidth(0.5).strokeColor(RULE).stroke()
    y += 6
  }

  const note = (text: string, color = MUTED) => {
    ensureSpace(ROW)
    draw(text, left, y, { size: 9, color, maxWidth: width })
    y += 14
  }

  // Header
  draw('Payday sheet', left, y, { size: 20, color: INK, weight: 'bold', maxWidth: width })
  y += 28
  const date = (iso: string) => formatDate(iso, { locale: format.locale, dateFormat: format.dateFormat })
  draw(`${sheet.householdName} · ${date(sheet.period.start)} – ${date(sheet.period.end)}`, left, y, {
    size: 11,
    color: INK,
    maxWidth: width,
  })
  y += 16
  const generated = new Intl.DateTimeFormat(format.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(sheet.generatedAt)
  draw(`Generated ${generated}. Check Hearth for anything newer.`, left, y, { size: 9, color: MUTED, maxWidth: width })
  y += 14
  rule()

  if (sheet.people.length === 0 && sheet.potGroups.length === 0 && sheet.mainAccount.total === 0) {
    y += 10
    note('Nothing to move yet. Add outgoings in Hearth to build the plan.')
    doc.end()
    return done
  }

  if (sheet.unassigned > 0) {
    y += 8
    note(`${perPeriod(sheet.unassigned)} of outgoings isn't assigned to a pot, so it's not counted below.`, WARN)
  }

  if (sheet.people.length > 0) {
    heading('By standing order, per person')
    for (const person of sheet.people) {
      row(person.name, perPeriod(person.setAside), {
        bold: true,
        detail:
          `${money(person.personalPots)} personal pots + ${money(person.jointContribution)} joint` +
          (person.ownAccount > 0
            ? ` · ${money(person.ownAccount)} stays in own account, ${money(person.setAside + person.ownAccount)} spoken for`
            : ''),
      })
    }
  }

  if (sheet.potGroups.length > 0) {
    heading('Pot by pot')
    for (const group of sheet.potGroups) {
      ensureSpace(ROW * 2)
      row(group.ownerName, perPeriod(group.total), { bold: true })
      for (const pot of group.pots) row(pot.name, perPeriod(pot.amount), { indent: 12 })
      y += 6
    }
  }

  // Split funding: the joint pots group above already carries the joint total.
  if (sheet.jointPool) {
    heading('Joint pool')
    row('Joint pots total', perPeriod(sheet.jointPotsTotal))
    row('Pooled in', perPeriod(sheet.jointPool.totalIn))
    row('Joint costs', perPeriod(sheet.jointPool.jointCosts))
    rule()
    row('Surplus', perPeriod(sheet.jointPool.surplus), { bold: true })
  }

  if (sheet.mainAccount.total > 0) {
    heading('Paid from the main account')
    for (const r of sheet.mainAccount.rows) row(r.name, perPeriod(r.amount))
    rule()
    row('Leave in the main account', perPeriod(sheet.mainAccount.total), { bold: true })
  }

  doc.end()
  return done
}

/** The household's payday sheet as a PDF, from live data. Needs no request, so
 *  a scheduled send (#37) can call it as-is. */
export async function paydayPdfForHousehold(db: DB, householdId: string): Promise<{ filename: string; pdf: Buffer }> {
  const { plan, members, household } = await loadFundingPlan(db, householdId)
  const categories = await db
    .select({ id: category.id, name: category.name })
    .from(category)
    .where(scopeWhere(householdId, category.householdId))

  const sheet = buildPaydaySheet({
    plan,
    members,
    categories,
    household: household ?? { displayName: 'My Household' },
    today: todayIso(),
    generatedAt: new Date(),
  })
  const pdf = await renderPaydayPdf(sheet, {
    money: {
      symbol: household?.currencySymbol ?? '£',
      decimalPlaces: household?.currencyDecimalPlaces ?? 2,
      symbolPosition: (household?.currencySymbolPosition ?? 'prefix') as 'prefix' | 'suffix',
      groupSeparator: household?.currencyGroupSeparator ?? ',',
      decimalSeparator: household?.currencyDecimalSeparator ?? '.',
    },
    currencyCode: household?.currencyCode ?? 'GBP',
    locale: household?.locale ?? 'en-GB',
    dateFormat: (household?.dateFormat ?? 'medium') as DateFormat,
  })

  return { filename: `hearth-payday-${sheet.period.start}.pdf`, pdf }
}
