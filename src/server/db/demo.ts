// ---------------------------------------------------------------------------
// Demo data generator
// ---------------------------------------------------------------------------
// Builds a coherent, realistic household ("Maple Street" — two people + joint)
// so every screen has something to show, for development against fake data and
// for demoing to other people. NONE of this touches real data: the seeder wipes
// and repopulates whatever database `db` points at, which is meant to be a
// dedicated demo file (see scripts/seed-demo.ts — it defaults DATABASE_URL to
// `file:./data/demo.db`, leaving the real `app.db` untouched).
//
// The dataset is DETERMINISTIC (seeded PRNG) so re-runs are identical, and it is
// anchored to the current month so the 12-month trends always look current.
// Money is in integer minor units (pence) throughout, per the schema convention.
// ---------------------------------------------------------------------------

import { eq } from 'drizzle-orm'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { DB } from './client'
import { ALL_TABLES } from './tables'
import { household } from './schema'
import { ensureSeed } from './seed'

// --- deterministic randomness ---------------------------------------------

/** Small, fast, seedable PRNG (mulberry32). Deterministic given the seed, so a
 *  re-seed reproduces the exact same demo dataset. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// --- money & date helpers --------------------------------------------------

/** Pounds (major units) → integer pence. Demo is GBP, 2 decimal places. */
const gbp = (major: number): number => Math.round(major * 100)

const pad2 = (n: number): string => n.toString().padStart(2, '0')

/** Deterministic YYYY-MM-DD from y/m/d (m is 1-based). No Date object, no tz. */
const ymd = (y: number, m: number, d: number): string => `${y}-${pad2(m)}-${pad2(d)}`

/**
 * Deterministic UUIDv7-shaped id generator. Real production ids come from
 * `uuidv7()` (wall clock + randomness); here we build the same 48-bit-timestamp
 * + version/variant layout from a monotonic counter and the seeded PRNG, so the
 * WHOLE dataset — ids included — is reproducible. Ids stay time-sortable (the
 * counter increments the timestamp), which is all the app relies on.
 */
function makeIdGen(rnd: () => number, baseMs: number): () => string {
  let counter = 0
  const hex = (n: number, width: number): string => n.toString(16).padStart(width, '0')
  return () => {
    const t = baseMs + counter++ // monotonic ⇒ unique + ordered + deterministic
    const timeHi = hex(Math.floor(t / 0x10000) % 0x100000000, 8) // top 32 bits
    const timeLo = hex(t % 0x10000, 4) // next 16 bits
    const rb = (): number => Math.floor(rnd() * 16)
    const randHex = (len: number): string => Array.from({ length: len }, rb).map((x) => x.toString(16)).join('')
    const verAndRandA = '7' + randHex(3) // version 7 + 12 random bits
    const variant = (8 + Math.floor(rnd() * 4)).toString(16) // 10xx ⇒ 8..b
    const randB1 = variant + randHex(3)
    const randB2 = randHex(12)
    return `${timeHi}-${timeLo}-${verAndRandA}-${randB1}-${randB2}`
  }
}

// --- the generator ---------------------------------------------------------

export interface DemoOptions {
  /** Reference "now" (epoch millis). Defaults to Date.now(). Anchors all trends. */
  now?: number
  /** PRNG seed — same seed ⇒ same dataset. */
  seed?: number
}

/** Every table's rows, in the same keyed shape as the DB snapshot / import format. */
type DemoRows = Record<string, Array<Record<string, unknown>>>

interface Anchor {
  year: number
  month: number // 1-based
}

/** Shift an {year, month} anchor back/forward by `delta` months. */
function shiftMonth({ year, month }: Anchor, delta: number): Anchor {
  const zero = year * 12 + (month - 1) + delta
  return { year: Math.floor(zero / 12), month: (zero % 12) + 1 }
}

/** Days in a given month (1-based). */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/**
 * Build the full demo dataset as keyed row arrays. Pure (given options) and does
 * not touch the DB — `seedDemo` inserts it. Split out so it can be unit-tested
 * and, if ever wanted, serialised into the JSON import format.
 */
export function buildDemoData(opts: DemoOptions = {}): DemoRows {
  const rnd = mulberry32(opts.seed ?? 0x48454152) // "HEAR"
  const now = new Date(opts.now ?? Date.now())
  const nowMs = now.getTime()
  const thisMonth: Anchor = { year: now.getFullYear(), month: now.getMonth() + 1 }
  const id = makeIdGen(rnd, nowMs)

  const randInt = (min: number, max: number): number => min + Math.floor(rnd() * (max - min + 1))
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)] as T
  /** base ± up to pct%, rounded to whole pounds. */
  const jitter = (base: number, pct: number): number =>
    Math.round(base * (1 + (rnd() * 2 - 1) * pct))

  const ts = { createdAt: nowMs, updatedAt: nowMs }

  // -- household -----------------------------------------------------------
  const households = [
    {
      id: 'household',
      displayName: 'Maple Street',
      currencyCode: 'GBP',
      currencySymbol: '£',
      currencyDecimalPlaces: 2,
      locale: 'en-GB',
      budgetPeriodStartDay: 1,
      passwordHash: null, // open, so a demo instance needs no login
      mfaSecret: null,
      mfaEnabledAt: null,
      mfaRecoveryCodes: null,
      weekStart: 'monday',
      dateFormat: 'medium',
      backupFrequency: 'off',
      backupLastAt: null,
      setupCompletedAt: nowMs, // past the setup wizard — go straight to the app
      incomeBasisDefault: 'regular_net',
      jointContributionBasis: 'equal',
      emergencyFundMonths: 3,
      ...ts,
    },
  ]

  // -- members -------------------------------------------------------------
  const ava = id()
  const ben = id()
  const joint = id()
  const members = [
    { id: ava, kind: 'person', displayName: 'Ava', shortLabel: 'A', color: 'grape', jointContributionWeight: null, sortOrder: 0, archivedAt: null, ...ts },
    { id: ben, kind: 'person', displayName: 'Ben', shortLabel: 'B', color: 'teal', jointContributionWeight: null, sortOrder: 1, archivedAt: null, ...ts },
    { id: joint, kind: 'joint', displayName: 'Joint', shortLabel: 'J', color: 'gray', jointContributionWeight: null, sortOrder: 100, archivedAt: null, ...ts },
  ]

  // -- categories ----------------------------------------------------------
  const catDefs = [
    ['housing', 'Housing'],
    ['utilities', 'Utilities'],
    ['food', 'Food & Drink'],
    ['transport', 'Transport'],
    ['health', 'Health & Fitness'],
    ['subs', 'Subscriptions'],
    ['personal', 'Personal'],
    ['savings', 'Savings & Goals'],
  ] as const
  const catId: Record<string, string> = {}
  const categories = catDefs.map(([key, name], i) => {
    const cid = id()
    catId[key] = cid
    return { id: cid, name, sortOrder: i, archivedAt: null, ...ts }
  })

  // -- pots ----------------------------------------------------------------
  // [key, name, categoryKey, ownerId]
  const potDefs: Array<[string, string, string, string]> = [
    ['rent', 'Rent', 'housing', joint],
    ['home_ins', 'Home Insurance', 'housing', joint],
    ['energy', 'Energy', 'utilities', joint],
    ['water', 'Water', 'utilities', joint],
    ['broadband', 'Broadband', 'utilities', joint],
    ['council_tax', 'Council Tax', 'utilities', joint],
    ['mobiles', 'Mobiles', 'utilities', joint],
    ['groceries', 'Groceries', 'food', joint],
    ['eating_out', 'Eating Out', 'food', joint],
    ['fuel', 'Fuel', 'transport', joint],
    ['ava_rail', 'Ava · Rail', 'transport', ava],
    ['ben_car', 'Ben · Car', 'transport', ben],
    ['ava_gym', 'Ava · Gym', 'health', ava],
    ['ben_gym', 'Ben · Gym', 'health', ben],
    ['streaming', 'Streaming', 'subs', joint],
    ['cloud', 'Cloud & Apps', 'subs', joint],
    ['ava_spend', 'Ava · Spending', 'personal', ava],
    ['ben_spend', 'Ben · Spending', 'personal', ben],
    ['emergency', 'Emergency Fund', 'savings', joint],
    ['holiday', 'Holiday', 'savings', joint],
    ['ava_isa', 'Ava · ISA', 'savings', ava],
  ]
  const potId: Record<string, string> = {}
  const pots = potDefs.map(([key, name, catKey, ownerId], i) => {
    const pid = id()
    potId[key] = pid
    return { id: pid, name, categoryId: catId[catKey]!, ownerId, sortOrder: i, note: null, archivedAt: null, ...ts }
  })

  // -- expenses + shares (the funding plan) --------------------------------
  // Anchor recurring bills to a plausible day-of-month in the current month.
  const anchorDay = (day: number): string => ymd(thisMonth.year, thisMonth.month, Math.min(day, daysInMonth(thisMonth.year, thisMonth.month)))

  // Bills = money out, single pot (or main account). `funding`:
  //   pot_manual → you move it out of the pot (shows on Catch-up)
  //   pot_auto   → the pot self-deducts (no catch-up)
  //   main       → paid from the main account under a category (no pot, no catch-up)
  interface BillDef {
    name: string
    recurrence: 'monthly' | 'quarterly' | 'yearly'
    dueDay: number
    reminderDays?: number
    amount: number
    funding: 'pot_manual' | 'pot_auto' | 'main'
    pot?: string
    category?: string
  }
  const billDefs: BillDef[] = [
    { name: 'Rent', recurrence: 'monthly', dueDay: 1, reminderDays: 3, amount: gbp(1500), funding: 'pot_manual', pot: 'rent' },
    { name: 'Council Tax', recurrence: 'monthly', dueDay: 5, reminderDays: 3, amount: gbp(182), funding: 'pot_manual', pot: 'council_tax' },
    { name: 'Energy', recurrence: 'monthly', dueDay: 15, amount: gbp(138), funding: 'pot_manual', pot: 'energy' },
    { name: 'Broadband', recurrence: 'monthly', dueDay: 20, amount: gbp(32), funding: 'pot_manual', pot: 'broadband' },
    { name: 'Mobile Phones', recurrence: 'monthly', dueDay: 12, amount: gbp(33), funding: 'pot_manual', pot: 'mobiles' },
    { name: 'Streaming Bundle', recurrence: 'monthly', dueDay: 8, amount: gbp(18), funding: 'pot_manual', pot: 'streaming' },
    // A Monzo-style pot that auto-deducts — never needs catch-up.
    { name: 'Cloud Storage', recurrence: 'monthly', dueDay: 22, amount: gbp(8), funding: 'pot_auto', pot: 'cloud' },
    { name: 'Ava Gym', recurrence: 'monthly', dueDay: 2, amount: gbp(32), funding: 'pot_manual', pot: 'ava_gym' },
    { name: 'Ben Gym', recurrence: 'monthly', dueDay: 2, amount: gbp(28), funding: 'pot_manual', pot: 'ben_gym' },
    { name: 'Rail Season Ticket', recurrence: 'monthly', dueDay: 28, amount: gbp(155), funding: 'pot_manual', pot: 'ava_rail' },
    { name: 'Water', recurrence: 'quarterly', dueDay: 18, reminderDays: 7, amount: gbp(138), funding: 'pot_manual', pot: 'water' },
    { name: 'Home Insurance', recurrence: 'yearly', dueDay: 9, reminderDays: 14, amount: gbp(276), funding: 'pot_manual', pot: 'home_ins' },
    // Paid straight from the main joint account (can't be put on a pot) — categorised, no catch-up.
    { name: 'Spotify', recurrence: 'monthly', dueDay: 6, amount: gbp(12), funding: 'main', category: 'subs' },
  ]
  const expenses: Array<Record<string, unknown>> = billDefs.map((def) => ({
    id: id(),
    name: def.name,
    recurrence: def.recurrence,
    amount: def.amount,
    funding: def.funding,
    potId: def.pot ? potId[def.pot]! : null,
    categoryId: def.category ? catId[def.category]! : null,
    note: null,
    active: 1,
    dueAnchor: anchorDay(def.dueDay),
    dueReminderDays: def.reminderDays ?? null,
    archivedAt: null,
    ...ts,
  }))

  // Set-asides = money in, filling a pot. One owner → one pot. Never on Spending/Catch-up.
  interface SetAsideDef { name: string; owner: string; pot: string; amount: number; group?: string }
  const setAsideDefs: SetAsideDef[] = [
    { name: 'Holiday Fund', owner: joint, pot: 'holiday', amount: gbp(200) },
    { name: 'Emergency Fund', owner: joint, pot: 'emergency', amount: gbp(150) },
    // A per-person set-aside sharing one label — the classic "Treat Yo Self".
    { name: 'Treat Yo Self — Ava', owner: ava, pot: 'ava_spend', amount: gbp(40), group: 'Treat Yo Self' },
    { name: 'Treat Yo Self — Ben', owner: ben, pot: 'ben_spend', amount: gbp(40), group: 'Treat Yo Self' },
    { name: 'ISA', owner: ava, pot: 'ava_isa', amount: gbp(120) },
  ]
  const setAsides: Array<Record<string, unknown>> = setAsideDefs.map((def, i) => ({
    id: id(),
    name: def.name,
    groupLabel: def.group ?? null,
    ownerId: def.owner,
    potId: potId[def.pot]!,
    amount: def.amount,
    recurrence: 'monthly',
    note: null,
    active: 1,
    sortOrder: i,
    archivedAt: null,
    ...ts,
  }))

  // -- income: payslip components ------------------------------------------
  // Per-person line-item definitions. Ava carries a student loan; Ben doesn't.
  interface CompDef { key: string; name: string; kind: 'earning' | 'deduction' | 'employer_info'; variable?: boolean }
  const componentTemplate: CompDef[] = [
    { key: 'basic', name: 'Basic Pay', kind: 'earning' },
    { key: 'overtime', name: 'Overtime', kind: 'earning', variable: true },
    { key: 'bonus', name: 'Bonus', kind: 'earning', variable: true },
    { key: 'tax', name: 'Income Tax', kind: 'deduction' },
    { key: 'ni', name: 'National Insurance', kind: 'deduction' },
    { key: 'pension', name: 'Pension', kind: 'deduction' },
    { key: 'student_loan', name: 'Student Loan', kind: 'deduction' },
    { key: 'employer_pension', name: 'Employer Pension', kind: 'employer_info' },
  ]
  const components: Array<Record<string, unknown>> = []
  /** owner → component key → component id */
  const compId: Record<string, Record<string, string>> = {}
  const buildComponents = (ownerId: string, hasStudentLoan: boolean): void => {
    compId[ownerId] = {}
    let order = 0
    for (const c of componentTemplate) {
      if (c.key === 'student_loan' && !hasStudentLoan) continue
      const cid = id()
      compId[ownerId]![c.key] = cid
      components.push({
        id: cid,
        ownerId,
        name: c.name,
        kind: c.kind,
        isVariable: c.variable ? 1 : 0,
        sortOrder: order++,
        archivedAt: null,
        ...ts,
      })
    }
  }
  buildComponents(ava, true)
  buildComponents(ben, false)

  // -- income: raises (salary history) ------------------------------------
  // Each person: a baseline raise ~2 years ago, then a promotion ~7 months ago.
  interface RaiseDef { owner: string; monthsAgo: number; salary: number; position: string; bonus?: number }
  const raiseDefs: RaiseDef[] = [
    { owner: ava, monthsAgo: 26, salary: gbp(42000), position: 'Product Designer' },
    { owner: ava, monthsAgo: 7, salary: gbp(48000), position: 'Senior Product Designer', bonus: gbp(3000) },
    { owner: ben, monthsAgo: 22, salary: gbp(37000), position: 'Support Engineer' },
    { owner: ben, monthsAgo: 5, salary: gbp(41000), position: 'Software Engineer' },
  ]
  const raises = raiseDefs.map((r) => {
    const a = shiftMonth(thisMonth, -r.monthsAgo)
    return {
      id: id(),
      ownerId: r.owner,
      effectiveDate: ymd(a.year, a.month, 1),
      newSalary: r.salary,
      bonus: r.bonus ?? null,
      newPosition: r.position,
      note: null,
      ...ts,
    }
  })
  /** Salary in effect for `owner` at a given month anchor (minor units, annual). */
  const salaryAt = (owner: string, a: Anchor): number => {
    const target = a.year * 12 + (a.month - 1)
    let best = 0
    for (const r of raiseDefs) {
      if (r.owner !== owner) continue
      const eff = shiftMonth(thisMonth, -r.monthsAgo)
      if (eff.year * 12 + (eff.month - 1) <= target) best = r.salary
    }
    return best
  }

  // -- income: payslips over the last 14 months ----------------------------
  const payslips: Array<Record<string, unknown>> = []
  const payslipLines: Array<Record<string, unknown>> = []
  const PAYSLIP_MONTHS = 14
  const buildPayslipsFor = (owner: string, hasStudentLoan: boolean): void => {
    for (let k = PAYSLIP_MONTHS - 1; k >= 0; k--) {
      const a = shiftMonth(thisMonth, -k)
      const annual = salaryAt(owner, a)
      if (annual === 0) continue
      const monthGross = annual / 12
      // A bonus lands in the most recent December, else the month 3 back.
      const isBonus = k === 3
      const bonus = isBonus ? Math.round(monthGross * 0.6) : 0
      const overtime = k % 5 === 2 ? gbp(randInt(80, 260)) : 0
      const gross = monthGross + bonus + overtime
      const pension = Math.round(gross * 0.05)
      const taxable = Math.max(0, gross - gbp(1047.5))
      const tax = Math.round(taxable * 0.2)
      const ni = Math.max(0, Math.round((gross - gbp(1048)) * 0.08))
      const studentLoan = hasStudentLoan ? Math.max(0, Math.round((gross - gbp(2082)) * 0.09)) : 0
      const employerPension = Math.round(gross * 0.03)

      const pid = id()
      const payDay = Math.min(28, daysInMonth(a.year, a.month))
      payslips.push({
        id: pid,
        ownerId: owner,
        payDate: ymd(a.year, a.month, payDay),
        periodLabel: null,
        netPay: null, // rely on computed effective_net
        note: isBonus ? 'Includes annual bonus' : null,
        ...ts,
      })
      const line = (key: string, amount: number): void => {
        const cid = compId[owner]?.[key]
        if (!cid || amount === 0) return
        payslipLines.push({ id: id(), payslipId: pid, componentId: cid, amount: Math.round(amount), ...ts })
      }
      line('basic', monthGross)
      line('overtime', overtime)
      line('bonus', bonus)
      line('tax', tax)
      line('ni', ni)
      line('pension', pension)
      if (hasStudentLoan) line('student_loan', studentLoan)
      line('employer_pension', employerPension)
    }
  }
  buildPayslipsFor(ava, true)
  buildPayslipsFor(ben, false)

  // -- income: recurring non-payslip sources -------------------------------
  const incomeSources = [
    { id: id(), ownerId: joint, name: 'Spare Room (rental)', amount: gbp(650), basis: 'net', recurrence: 'monthly', active: 1, note: null, archivedAt: null, ...ts },
    { id: id(), ownerId: ava, name: 'Freelance design', amount: gbp(300), basis: 'gross', recurrence: 'monthly', active: 1, note: 'Variable side work', archivedAt: null, ...ts },
    { id: id(), ownerId: ben, name: 'Dividends', amount: gbp(120), basis: 'net', recurrence: 'quarterly', active: 1, note: null, archivedAt: null, ...ts },
  ]

  // -- accounts & net worth ------------------------------------------------
  interface AcctDef {
    key: string
    name: string
    kind: 'asset' | 'liability'
    subtype: string
    owner: string
    institution: string
    start: number // balance 15 months ago (minor units, positive magnitude)
    monthly: number // signed monthly drift (assets grow +, debts shrink toward 0 with negative drift on magnitude)
  }
  const acctDefs: AcctDef[] = [
    { key: 'home', name: 'Home', kind: 'asset', subtype: 'property', owner: joint, institution: 'Zoopla est.', start: gbp(318000), monthly: gbp(450) },
    { key: 'savings', name: 'Emergency Savings', kind: 'asset', subtype: 'savings', owner: joint, institution: 'Barclays', start: gbp(9200), monthly: gbp(210) },
    { key: 'ava_pension', name: 'Ava Pension', kind: 'asset', subtype: 'pension', owner: ava, institution: 'Nest', start: gbp(21400), monthly: gbp(360) },
    { key: 'ben_pension', name: 'Ben Pension', kind: 'asset', subtype: 'pension', owner: ben, institution: 'Aviva', start: gbp(18900), monthly: gbp(320) },
    { key: 'ava_isa', name: 'Ava Stocks & Shares ISA', kind: 'asset', subtype: 'investment', owner: ava, institution: 'Vanguard', start: gbp(7600), monthly: gbp(240) },
    { key: 'mortgage', name: 'Mortgage', kind: 'liability', subtype: 'mortgage', owner: joint, institution: 'Nationwide', start: gbp(243000), monthly: -gbp(620) },
    { key: 'ava_sl', name: 'Ava Student Loan', kind: 'liability', subtype: 'student_loan', owner: ava, institution: 'SLC', start: gbp(14800), monthly: -gbp(120) },
    { key: 'ben_car', name: 'Ben Car Loan', kind: 'liability', subtype: 'loan', owner: ben, institution: 'Zopa', start: gbp(9400), monthly: -gbp(240) },
    { key: 'credit_card', name: 'Joint Credit Card', kind: 'liability', subtype: 'credit_card', owner: joint, institution: 'Amex', start: gbp(1250), monthly: 0 },
  ]
  const accounts: Array<Record<string, unknown>> = []
  const accountBalances: Array<Record<string, unknown>> = []
  const NW_MONTHS = 15
  acctDefs.forEach((def, i) => {
    const aid = id()
    accounts.push({
      id: aid,
      name: def.name,
      kind: def.kind,
      subtype: def.subtype,
      ownerId: def.owner,
      institution: def.institution,
      note: null,
      sortOrder: i,
      archivedAt: null,
      ...ts,
    })
    for (let k = NW_MONTHS - 1; k >= 0; k--) {
      const a = shiftMonth(thisMonth, -k)
      const elapsed = NW_MONTHS - 1 - k
      // Credit card wobbles around its balance; everything else drifts linearly.
      const base = def.monthly === 0 ? def.start : def.start + def.monthly * elapsed
      const value = def.monthly === 0 ? Math.max(gbp(300), jitter(def.start, 0.35)) : Math.max(0, jitter(base, 0.015))
      accountBalances.push({ id: id(), accountId: aid, asOfDate: ymd(a.year, a.month, 1), value, note: null, ...ts })
    }
  })

  // -- spending: ~4 months of transactions ---------------------------------
  // Realistic payees per pot; most older ones reconciled, a recent tail left
  // open (the catch-up backlog), a couple with no pot ("needs a pot"), a few
  // refunds, one split across two pots, and a batch tagged as an import.
  interface PayeeSet { pot: string; owners: string[]; payees: string[]; min: number; max: number; perMonth: number }
  const spendModel: PayeeSet[] = [
    { pot: 'groceries', owners: [joint], payees: ['Tesco', "Sainsbury's", 'Aldi', 'Lidl', 'Ocado', 'Co-op'], min: 14, max: 82, perMonth: 9 },
    { pot: 'eating_out', owners: [ava, ben, joint], payees: ['Nando’s', 'Pizza Express', 'The Ivy House', 'Wagamama', 'Local Pub', 'Deliveroo'], min: 12, max: 68, perMonth: 4 },
    { pot: 'fuel', owners: [ava, ben], payees: ['Shell', 'BP', 'Esso', 'Tesco Fuel'], min: 40, max: 72, perMonth: 3 },
    { pot: 'ben_car', owners: [ben], payees: ['NCP Parking', 'Kwik Fit', 'Halfords'], min: 6, max: 48, perMonth: 2 },
    { pot: 'ava_spend', owners: [ava], payees: ['ASOS', 'Waterstones', 'Boots', 'Etsy'], min: 9, max: 65, perMonth: 3 },
    { pot: 'ben_spend', owners: [ben], payees: ['Steam', 'Amazon', 'Argos', 'Currys'], min: 8, max: 90, perMonth: 3 },
    { pot: 'streaming', owners: [joint], payees: ['Netflix', 'Spotify', 'Disney+'], min: 7, max: 16, perMonth: 1 },
    { pot: 'ava_gym', owners: [ava], payees: ['PureGym'], min: 32, max: 32, perMonth: 1 },
  ]

  const spends: Array<Record<string, unknown>> = []
  const SPEND_MONTHS = 4
  // Reconcile everything before this cutoff; leave the recent tail open.
  const openTailStart = shiftMonth(thisMonth, 0) // current month stays open
  const openCutoff = openTailStart.year * 12 + (openTailStart.month - 1)

  interface SpendSeed { date: string; monthKey: number; description: string; amount: number; owner: string; pot: string | null; category: string | null }
  const seeds: SpendSeed[] = []

  for (let k = SPEND_MONTHS - 1; k >= 0; k--) {
    const a = shiftMonth(thisMonth, -k)
    const dim = daysInMonth(a.year, a.month)
    const monthKey = a.year * 12 + (a.month - 1)
    for (const m of spendModel) {
      const count = Math.max(1, m.perMonth + randInt(-1, 1))
      for (let n = 0; n < count; n++) {
        const day = randInt(1, dim)
        const owner = pick(m.owners)
        const amount = gbp(randInt(m.min, m.max))
        seeds.push({ date: ymd(a.year, a.month, day), monthKey, description: pick(m.payees), amount, owner, pot: m.pot, category: null })
      }
    }
  }

  // A couple of refunds (negative amounts) in the recent months.
  {
    const a = shiftMonth(thisMonth, -1)
    seeds.push({ date: ymd(a.year, a.month, 14), monthKey: a.year * 12 + (a.month - 1), description: 'Amazon refund', amount: -gbp(34), owner: ben, pot: 'ben_spend', category: null })
    seeds.push({ date: ymd(a.year, a.month, 23), monthKey: a.year * 12 + (a.month - 1), description: 'ASOS return', amount: -gbp(28), owner: ava, pot: 'ava_spend', category: null })
  }

  // Two "needs a pot" spends this month (no pot; one carries a category hint).
  {
    const a = thisMonth
    const mk = a.year * 12 + (a.month - 1)
    seeds.push({ date: ymd(a.year, a.month, Math.min(6, daysInMonth(a.year, a.month))), monthKey: mk, description: 'Cash withdrawal', amount: gbp(40), owner: ava, pot: null, category: null })
    seeds.push({ date: ymd(a.year, a.month, Math.min(9, daysInMonth(a.year, a.month))), monthKey: mk, description: 'John Lewis', amount: gbp(76), owner: joint, pot: null, category: catId['personal']! })
  }

  // Build spend rows; decide reconciliation & imports as we go.
  const importBatchId = id()
  let importedCount = 0
  const splitGroupId = id()

  // One split: a big shop split across Groceries + Ava · Spending this month.
  {
    const a = thisMonth
    const day = Math.min(3, daysInMonth(a.year, a.month))
    const date = ymd(a.year, a.month, day)
    spends.push({
      id: id(), date, description: 'Big shop (split)', amount: gbp(60), ownerId: joint, potId: potId['groceries']!, categoryId: null,
      reconciled: 0, reconciledAt: null, reconciliationBatchId: null, source: 'manual', importRef: null, importBatchId: null, raw: null,
      splitGroupId, note: null, ...ts,
    })
    spends.push({
      id: id(), date, description: 'Big shop (split)', amount: gbp(35), ownerId: joint, potId: potId['ava_spend']!, categoryId: null,
      reconciled: 0, reconciledAt: null, reconciliationBatchId: null, source: 'manual', importRef: null, importBatchId: null, raw: null,
      splitGroupId, note: 'Homeware', ...ts,
    })
  }

  for (const s of seeds) {
    const older = s.monthKey < openCutoff
    // Reconcile older-month rows (they'll be grouped into batches below). Recent
    // (current-month) rows stay open as the live catch-up backlog. Null-pot rows
    // can never be reconciled.
    const willReconcile = older && s.pot !== null
    // Mark a slice of grocery rows as imported (from a Monzo CSV) for realism.
    const isImport = s.pot === 'groceries' && rnd() < 0.5
    if (isImport) importedCount++
    spends.push({
      id: id(),
      date: s.date,
      description: s.description,
      amount: s.amount,
      ownerId: s.owner,
      potId: s.pot ? potId[s.pot]! : null,
      categoryId: s.category,
      reconciled: willReconcile ? 1 : 0,
      reconciledAt: willReconcile ? nowMs : null,
      reconciliationBatchId: null, // filled in when batches are built
      source: isImport ? 'import' : 'manual',
      importRef: isImport ? `demo-${id()}` : null,
      importBatchId: isImport ? importBatchId : null,
      raw: null,
      splitGroupId: null,
      note: null,
      ...ts,
    })
  }

  // -- reconciliation batches (one per pot, over all reconciled rows) -------
  const reconciliationBatches: Array<Record<string, unknown>> = []
  const byPot = new Map<string, Array<Record<string, unknown>>>()
  for (const row of spends) {
    if (row['reconciled'] !== 1) continue
    const pid = row['potId'] as string
    const arr = byPot.get(pid) ?? []
    arr.push(row)
    byPot.set(pid, arr)
  }
  for (const [pid, rows] of byPot) {
    const bid = id()
    const total = rows.reduce((sum, r) => sum + (r['amount'] as number), 0)
    reconciliationBatches.push({
      id: bid,
      potId: pid,
      totalAmount: total,
      transactionCount: rows.length,
      reversedAt: null,
      note: null,
      ...ts,
    })
    for (const r of rows) r['reconciliationBatchId'] = bid
  }

  // -- import batch --------------------------------------------------------
  const importBatches = importedCount > 0
    ? [{
        id: importBatchId,
        source: 'monzo_csv',
        filename: 'monzo-demo.csv',
        rowCount: importedCount,
        importedCount,
        skippedCount: 0,
        mapping: JSON.stringify({ date: 'Date', description: 'Name', amount: 'Amount', importRef: 'Transaction ID' }),
        importedAt: nowMs,
        ...ts,
      }]
    : []

  return {
    household: households,
    member: members,
    category: categories,
    pot: pots,
    expense: expenses,
    setAside: setAsides,
    reconciliationBatch: reconciliationBatches,
    importBatch: importBatches,
    spendTransaction: spends,
    incomeSource: incomeSources,
    payslipComponentType: components,
    payslip: payslips,
    payslipLine: payslipLines,
    raise: raises,
    account: accounts,
    accountBalance: accountBalances,
  }
}

/**
 * Wipe every table and insert the generated demo dataset. Meant to run against a
 * DEDICATED demo database (see scripts/seed-demo.ts), never the real app.db.
 * Returns a per-table row count.
 */
export async function seedDemo(db: DB, opts: DemoOptions = {}): Promise<Record<string, number>> {
  const data = buildDemoData(opts)

  // Delete children-first (reverse FK order), then insert parents-first, all in
  // one atomic batch — matches the pattern in routers/data.ts (works on :memory:).
  type BatchArg = Parameters<DB['batch']>[0]
  const statements: unknown[] = []
  for (const [, table] of [...ALL_TABLES].reverse()) {
    statements.push(db.delete(table as SQLiteTable))
  }
  const counts: Record<string, number> = {}
  const INSERT_CHUNK = 200
  for (const [name, table] of ALL_TABLES) {
    const rows = data[name] ?? []
    counts[name] = rows.length
    // Every demo row belongs to the singleton demo household. Stamp householdId
    // here (the `household` table itself has no such column) rather than on each
    // of the dozens of row literals — and now that the schema no longer defaults
    // household_id, an omitted stamp is a loud NOT NULL error, not a silent
    // mis-scope.
    const scoped =
      name === 'household' ? rows : rows.map((r) => ({ householdId: 'household', ...(r as object) }))
    for (let i = 0; i < scoped.length; i += INSERT_CHUNK) {
      const chunk = scoped.slice(i, i + INSERT_CHUNK)
      if (chunk.length > 0) statements.push(db.insert(table as SQLiteTable).values(chunk as never))
    }
  }
  await db.batch(statements as unknown as BatchArg)
  // Provision the owner user + membership for the demo household (the wipe above
  // clears them; the demo dataset itself carries no login identities).
  await ensureSeed(db)
  return counts
}

/** True if the database already holds demo data (used to avoid clobbering). */
export async function hasHousehold(db: DB): Promise<boolean> {
  const rows = await db.select().from(household).where(eq(household.id, 'household'))
  return rows.length > 0 && rows[0]?.setupCompletedAt != null
}
