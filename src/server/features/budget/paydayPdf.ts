import { createRequire } from 'node:module'
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
  locale: string
  dateFormat: DateFormat
}

// Hearth's UI font, embedded so the file renders the same offline and on any
// viewer. The latin subset covers £ € $ and —, but not arrows: keep them out.
const require = createRequire(import.meta.url)
const FONT_REGULAR = require.resolve('@fontsource/hanken-grotesk/files/hanken-grotesk-latin-400-normal.woff')
const FONT_BOLD = require.resolve('@fontsource/hanken-grotesk/files/hanken-grotesk-latin-600-normal.woff')

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
  doc.registerFont('regular', FONT_REGULAR)
  doc.registerFont('bold', FONT_BOLD)

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

  const money = (amount: number) => formatMoney(amount, format.money)
  const perPeriod = (amount: number) => `${money(amount)}${sheet.unit}`

  const ensureSpace = (height: number) => {
    if (y + height <= bottom) return
    doc.addPage()
    y = MARGIN
  }

  const heading = (text: string) => {
    ensureSpace(ROW * 3)
    y += 14
    doc.font('bold').fontSize(12).fillColor(INK).text(text, left, y, { lineBreak: false })
    y += 20
  }

  /** One label/amount line; `detail` follows the label in muted type. */
  const row = (label: string, amount: string, opts: { bold?: boolean; indent?: number; detail?: string } = {}) => {
    ensureSpace(ROW)
    const x = left + (opts.indent ?? 0)
    const labelWidth = width - AMOUNT_WIDTH - (opts.indent ?? 0)
    doc
      .font(opts.bold ? 'bold' : 'regular')
      .fontSize(10)
      .fillColor(INK)
      .text(label, x, y, { width: labelWidth, height: ROW, ellipsis: true, lineBreak: false })
      .text(amount, left + width - AMOUNT_WIDTH, y, { width: AMOUNT_WIDTH, align: 'right', lineBreak: false })
    if (opts.detail) {
      const offset = doc.widthOfString(label) + 10
      doc
        .font('regular')
        .fontSize(9)
        .fillColor(MUTED)
        .text(opts.detail, x + offset, y + 1, { width: labelWidth - offset, height: ROW, ellipsis: true, lineBreak: false })
    }
    y += ROW
  }

  const rule = () => {
    doc.moveTo(left, y + 1).lineTo(left + width, y + 1).lineWidth(0.5).strokeColor(RULE).stroke()
    y += 6
  }

  const note = (text: string, color = MUTED) => {
    doc.font('regular').fontSize(9).fillColor(color)
    const height = doc.heightOfString(text, { width })
    ensureSpace(height + 4)
    doc.text(text, left, y, { width })
    y += height + 4
  }

  // Header
  doc.font('bold').fontSize(20).fillColor(INK).text('Payday sheet', left, y, { lineBreak: false })
  y += 28
  const date = (iso: string) => formatDate(iso, { locale: format.locale, dateFormat: format.dateFormat })
  doc
    .font('regular')
    .fontSize(11)
    .fillColor(INK)
    .text(`${sheet.householdName} · ${date(sheet.period.start)} – ${date(sheet.period.end)}`, left, y, { width })
  y += 16
  const generated = new Intl.DateTimeFormat(format.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(sheet.generatedAt)
  doc.fontSize(9).fillColor(MUTED).text(`Generated ${generated}. Check Hearth for anything newer.`, left, y, { width })
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
    note(`${money(sheet.unassigned)} of outgoings isn't assigned to a pot, so it's not counted below.`, WARN)
  }

  if (sheet.people.length > 0) {
    heading('Set aside per person')
    for (const person of sheet.people) {
      row(person.name, perPeriod(person.setAside), {
        bold: true,
        detail: `${money(person.personalPots)} personal pots + ${money(person.jointContribution)} joint`,
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
    locale: household?.locale ?? 'en-GB',
    dateFormat: (household?.dateFormat ?? 'medium') as DateFormat,
  })

  return { filename: `hearth-payday-${sheet.period.start}.pdf`, pdf }
}
