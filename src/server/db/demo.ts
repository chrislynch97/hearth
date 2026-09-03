// ---------------------------------------------------------------------------
// Fake-data generator
// ---------------------------------------------------------------------------
// Builds coherent, realistic households so every screen has something to show.
// Two callers, both against a disposable database of their own:
//   * demo mode (scripts/seed-demo.ts → ./data/demo) — one household, "Maple
//     Street", open with no login, for showing the app to other people.
//   * dev mode (src/server/db/dev.ts → ./data/dev) — several households of
//     different shapes with real logins, for working on the app day to day.
// NONE of this touches real data: both seeders pin DATABASE_URL themselves and
// refuse any target that looks like the real database (scripts/demo-guard.ts).
//
// The dataset is DETERMINISTIC (seeded PRNG) so re-runs are identical, and it is
// anchored to the current month so the 12-month trends always look current.
// Money is in integer minor units (pence) throughout, per the schema convention;
// amounts in the specs below are in MAJOR units and converted on the way in.
// ---------------------------------------------------------------------------

import { eq, getTableColumns } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { DB } from './client'
import { ALL_TABLES } from './tables'
import { household } from './schema'
import { ensureSeed } from './seed'
import { DEFAULT_HOUSEHOLD_ID } from '../trpc/tenant'

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

/** Major units (pounds, euros…) → integer minor units. Every spec here is 2dp. */
const minor = (major: number): number => Math.round(major * 100)

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

// --- what a household is made of -------------------------------------------

/** One person in a household. Only the first four fields are required — the rest
 *  default off salary, so a new household spec stays a few lines long. */
export interface DemoPerson {
  /** Stable key for this person's pots and payslip components ('ava'). Unique per household. */
  key: string
  name: string
  /** Mantine colour name for the member chip. */
  color: string
  /** Annual salary (major units) before the promotion below. */
  salary: number
  /** Salary after the promotion. Defaults to +14%. */
  promotedTo?: number
  /** Job title before and after the promotion. */
  positions?: [string, string]
  /** One-off bonus paid with the promotion, if any. */
  promotionBonus?: number
  /** How far back the two salary points sit, in months. */
  baselineMonthsAgo?: number
  promotionMonthsAgo?: number
  /** Drives a commuting pot + bill: a rail season ticket, or car running costs. */
  commute?: 'rail' | 'car' | 'none'
  studentLoan?: boolean
  /** A stocks & shares ISA: a savings pot, a monthly set-aside and an account. */
  isa?: boolean
  /** Workplace pension account. Defaults derive from salary. */
  pension?: { institution: string; start: number; monthly: number }
  /** A recurring non-payslip income source, if any. */
  sideIncome?: {
    name: string
    amount: number
    basis: 'net' | 'gross'
    recurrence: 'monthly' | 'quarterly'
    note?: string
  }
  /** Payees for this person's discretionary spending. */
  payees?: string[]
}

/** How much history and volume a household carries. `costFactor` scales every
 *  bill, set-aside and balance, so two households don't live the same life. */
export interface DemoScale {
  spendMonths: number
  payslipMonths: number
  netWorthMonths: number
  /** Multiplier on the per-month transaction counts. */
  spendVolume: number
  /** Multiplier on bill, set-aside and account amounts. */
  costFactor: number
}

export const DEFAULT_SCALE: DemoScale = {
  spendMonths: 4,
  payslipMonths: 14,
  netWorthMonths: 15,
  spendVolume: 1,
  costFactor: 1,
}

/** A household to generate: who lives there, how it's configured, how much of it
 *  there is. `settings` is merged onto the household row, so a spec can choose a
 *  currency, a budget period or a joint funding model. */
export interface DemoHouseholdSpec {
  id: string
  displayName: string
  people: DemoPerson[]
  /** The household's anchor bill: monthly rent/mortgage payment (major units). */
  rent?: number
  settings?: Partial<typeof household.$inferInsert>
  scale?: Partial<DemoScale>
}

/** The demo household: two people plus a joint entity, GBP, calendar months. */
export const MAPLE_STREET: DemoHouseholdSpec = {
  id: DEFAULT_HOUSEHOLD_ID,
  displayName: 'Maple Street',
  rent: 1500,
  people: [
    {
      key: 'ava',
      name: 'Ava',
      color: 'grape',
      salary: 42000,
      promotedTo: 48000,
      positions: ['Product Designer', 'Senior Product Designer'],
      promotionBonus: 3000,
      baselineMonthsAgo: 26,
      promotionMonthsAgo: 7,
      commute: 'rail',
      studentLoan: true,
      isa: true,
      pension: { institution: 'Nest', start: 21400, monthly: 360 },
      sideIncome: { name: 'Freelance design', amount: 300, basis: 'gross', recurrence: 'monthly', note: 'Variable side work' },
      payees: ['ASOS', 'Waterstones', 'Boots', 'Etsy'],
    },
    {
      key: 'ben',
      name: 'Ben',
      color: 'teal',
      salary: 37000,
      promotedTo: 41000,
      positions: ['Support Engineer', 'Software Engineer'],
      baselineMonthsAgo: 22,
      promotionMonthsAgo: 5,
      commute: 'car',
      pension: { institution: 'Aviva', start: 18900, monthly: 320 },
      sideIncome: { name: 'Dividends', amount: 120, basis: 'net', recurrence: 'quarterly' },
      payees: ['Steam', 'Amazon', 'Argos', 'Currys'],
    },
  ],
}

// --- the generator ---------------------------------------------------------

export interface DemoOptions {
  /** Reference "now" (epoch millis). Defaults to Date.now(). Anchors all trends. */
  now?: number
  /** PRNG seed — same seed ⇒ same dataset. Two households built for the same
   *  database must use different seeds: the generated ids draw on the PRNG, so
   *  the same seed would mint the same ids twice. */
  seed?: number
  /** Which household to build. Defaults to the demo one. */
  household?: DemoHouseholdSpec
}

/** Every table's rows, in the same keyed shape as the DB snapshot / import format. */
export type DemoRows = Record<string, Array<Record<string, unknown>>>

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

/** A person spec with every optional filled in, so the generator never has to
 *  branch on "did the spec say?". Defaults scale off salary. */
interface Person extends Required<Omit<DemoPerson, 'sideIncome' | 'promotionBonus'>> {
  sideIncome: DemoPerson['sideIncome']
  promotionBonus: number | null
}

function fillPerson(p: DemoPerson): Person {
  return {
    key: p.key,
    name: p.name,
    color: p.color,
    salary: p.salary,
    promotedTo: p.promotedTo ?? Math.round((p.salary * 1.14) / 500) * 500,
    positions: p.positions ?? ['Analyst', 'Senior Analyst'],
    promotionBonus: p.promotionBonus ?? null,
    baselineMonthsAgo: p.baselineMonthsAgo ?? 24,
    promotionMonthsAgo: p.promotionMonthsAgo ?? 6,
    commute: p.commute ?? 'none',
    studentLoan: p.studentLoan ?? false,
    isa: p.isa ?? false,
    pension: p.pension ?? {
      institution: 'Nest',
      start: Math.round(p.salary * 0.4),
      monthly: Math.round((p.salary * 0.09) / 12),
    },
    sideIncome: p.sideIncome,
    payees: p.payees ?? ['Amazon', 'Boots', 'Argos', 'Etsy'],
  }
}

/**
 * Build one household's dataset as keyed row arrays. Pure (given options) and
 * does not touch the DB — `seedHouseholds` inserts it. Split out so it can be
 * unit-tested and, if ever wanted, serialised into the JSON import format.
 */
export function buildDemoData(opts: DemoOptions = {}): DemoRows {
  const spec = opts.household ?? MAPLE_STREET
  const scale = { ...DEFAULT_SCALE, ...spec.scale }
  const people = spec.people.map(fillPerson)
  const rnd = mulberry32(opts.seed ?? 0x48454152) // "HEAR"
  const now = new Date(opts.now ?? Date.now())
  const nowMs = now.getTime()
  const thisMonth: Anchor = { year: now.getFullYear(), month: now.getMonth() + 1 }
  const id = makeIdGen(rnd, nowMs)

  const randInt = (min: number, max: number): number => min + Math.floor(rnd() * (max - min + 1))
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)] as T
  /** base ± up to pct%, rounded to whole minor units. */
  const jitter = (base: number, pct: number): number =>
    Math.round(base * (1 + (rnd() * 2 - 1) * pct))
  /** A spec amount (major units) → minor units, at this household's cost of living. */
  const cost = (major: number): number => minor(Math.round(major * scale.costFactor))
  /** Per-month transaction counts, at this household's volume. */
  const volume = (perMonth: number): number => Math.max(1, Math.round(perMonth * scale.spendVolume))

  const ts = { createdAt: now, updatedAt: now }

  // -- household -----------------------------------------------------------
  const households = [
    {
      id: spec.id,
      displayName: spec.displayName,
      currencyCode: 'GBP',
      currencySymbol: '£',
      currencyDecimalPlaces: 2,
      locale: 'en-GB',
      budgetPeriodStartDay: 1,
      weekStart: 'monday',
      dateFormat: 'medium',
      backupFrequency: 'off',
      backupLastAt: null,
      setupCompletedAt: now, // past the setup wizard — go straight to the app
      incomeBasisDefault: 'regular_net',
      jointContributionBasis: 'equal',
      emergencyFundMonths: 3,
      ...ts,
      ...spec.settings,
    },
  ]

  // -- members -------------------------------------------------------------
  const joint = id()
  /** person key → member id */
  const memberId: Record<string, string> = {}
  const members: Array<Record<string, unknown>> = people.map((p, i) => {
    const mid = id()
    memberId[p.key] = mid
    return {
      id: mid,
      kind: 'person',
      displayName: p.name,
      shortLabel: p.name.slice(0, 1),
      color: p.color,
      jointContributionWeight: null,
      sortOrder: i,
      archivedAt: null,
      ...ts,
    }
  })
  members.push({
    id: joint,
    kind: 'joint',
    displayName: 'Joint',
    shortLabel: 'J',
    color: 'gray',
    jointContributionWeight: null,
    sortOrder: 100,
    archivedAt: null,
    ...ts,
  })
  /** The member id for a person key — every per-person row hangs off this. */
  const mine = (p: Person): string => memberId[p.key]!

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
  // [key, name, categoryKey, ownerId]. Joint pots first, then a set per person.
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
    ['streaming', 'Streaming', 'subs', joint],
    ['cloud', 'Cloud & Apps', 'subs', joint],
    ['emergency', 'Emergency Fund', 'savings', joint],
    ['holiday', 'Holiday', 'savings', joint],
  ]
  for (const p of people) {
    if (p.commute === 'rail') potDefs.push([`${p.key}_rail`, `${p.name} · Rail`, 'transport', mine(p)])
    if (p.commute === 'car') potDefs.push([`${p.key}_car`, `${p.name} · Car`, 'transport', mine(p)])
    potDefs.push([`${p.key}_gym`, `${p.name} · Gym`, 'health', mine(p)])
    potDefs.push([`${p.key}_spend`, `${p.name} · Spending`, 'personal', mine(p)])
    if (p.isa) potDefs.push([`${p.key}_isa`, `${p.name} · ISA`, 'savings', mine(p)])
  }
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
    { name: 'Rent', recurrence: 'monthly', dueDay: 1, reminderDays: 3, amount: cost(spec.rent ?? 1500), funding: 'pot_manual', pot: 'rent' },
    { name: 'Council Tax', recurrence: 'monthly', dueDay: 5, reminderDays: 3, amount: cost(182), funding: 'pot_manual', pot: 'council_tax' },
    { name: 'Energy', recurrence: 'monthly', dueDay: 15, amount: cost(138), funding: 'pot_manual', pot: 'energy' },
    { name: 'Broadband', recurrence: 'monthly', dueDay: 20, amount: cost(32), funding: 'pot_manual', pot: 'broadband' },
    { name: 'Mobile Phones', recurrence: 'monthly', dueDay: 12, amount: cost(33), funding: 'pot_manual', pot: 'mobiles' },
    { name: 'Streaming Bundle', recurrence: 'monthly', dueDay: 8, amount: cost(18), funding: 'pot_manual', pot: 'streaming' },
    // A Monzo-style pot that auto-deducts — never needs catch-up.
    { name: 'Cloud Storage', recurrence: 'monthly', dueDay: 22, amount: cost(8), funding: 'pot_auto', pot: 'cloud' },
    { name: 'Water', recurrence: 'quarterly', dueDay: 18, reminderDays: 7, amount: cost(138), funding: 'pot_manual', pot: 'water' },
    { name: 'Home Insurance', recurrence: 'yearly', dueDay: 9, reminderDays: 14, amount: cost(276), funding: 'pot_manual', pot: 'home_ins' },
    // Paid straight from the main joint account (can't be put on a pot) — categorised, no catch-up.
    { name: 'Spotify', recurrence: 'monthly', dueDay: 6, amount: cost(12), funding: 'main', category: 'subs' },
  ]
  for (const p of people) {
    billDefs.push({ name: `${p.name} Gym`, recurrence: 'monthly', dueDay: 2, amount: cost(30), funding: 'pot_manual', pot: `${p.key}_gym` })
    if (p.commute === 'rail') {
      billDefs.push({ name: `${p.name} Rail Season Ticket`, recurrence: 'monthly', dueDay: 28, amount: cost(155), funding: 'pot_manual', pot: `${p.key}_rail` })
    }
  }
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

  // -- bill price history (#68) --------------------------------------------
  // Gives the subscription-review page (#70) something to rank. Several bills
  // creep upward over ~2 years (Streaming, Council Tax, Home Insurance…), a
  // couple stay flat (Rent/Mobiles — reassuringly unchanged), and one (Energy)
  // spiked then eased back. Each trail ends at the bill's current amount so the
  // recorded history and the live figure agree.
  const expenseIdByName: Record<string, string> = {}
  for (const e of expenses) expenseIdByName[e['name'] as string] = e['id'] as string

  const monthsAgoFirst = (m: number): string => {
    const a = shiftMonth(thisMonth, -m)
    return ymd(a.year, a.month, 1)
  }
  interface PriceTrail { bill: string; points: Array<[number, number]> } // [monthsAgo, major units]
  const priceTrails: PriceTrail[] = [
    { bill: 'Streaming Bundle', points: [[30, 10], [22, 12], [14, 15], [5, 18]] },
    { bill: 'Broadband', points: [[20, 26], [8, 30], [2, 32]] },
    { bill: 'Council Tax', points: [[26, 168], [14, 175], [2, 182]] },
    { bill: 'Energy', points: [[18, 96], [12, 130], [9, 165], [3, 138]] },
    { bill: 'Home Insurance', points: [[26, 210], [14, 240], [2, 276]] },
    { bill: 'Water', points: [[16, 120], [4, 138]] },
    { bill: 'Spotify', points: [[18, 10], [6, 12]] },
  ]
  for (const p of people) {
    priceTrails.push({ bill: `${p.name} Gym`, points: [[20, 26], [6, 30]] })
    if (p.commute === 'rail') priceTrails.push({ bill: `${p.name} Rail Season Ticket`, points: [[13, 140], [1, 155]] })
  }
  const billPrices: Array<Record<string, unknown>> = []
  for (const trail of priceTrails) {
    const expId = expenseIdByName[trail.bill]
    if (!expId) continue
    trail.points.forEach(([monthsAgo, major], i) => {
      billPrices.push({
        id: id(),
        expenseId: expId,
        effectiveDate: monthsAgoFirst(monthsAgo),
        amount: cost(major),
        note: i === 0 ? 'Starting price' : null,
        source: i === trail.points.length - 1 ? 'spend_prompt' : 'manual',
        ...ts,
      })
    })
  }

  // Set-asides = money in, filling a pot. One owner → one pot. Never on Spending/Catch-up.
  interface SetAsideDef { name: string; owner: string; pot: string; amount: number; group?: string }
  const setAsideDefs: SetAsideDef[] = [
    { name: 'Holiday Fund', owner: joint, pot: 'holiday', amount: cost(200) },
    { name: 'Emergency Fund', owner: joint, pot: 'emergency', amount: cost(150) },
  ]
  // A per-person set-aside sharing one label — the classic "Treat Yo Self".
  for (const p of people) {
    setAsideDefs.push({ name: `Treat Yo Self — ${p.name}`, owner: mine(p), pot: `${p.key}_spend`, amount: cost(40), group: 'Treat Yo Self' })
  }
  for (const p of people) {
    if (p.isa) setAsideDefs.push({ name: 'ISA', owner: mine(p), pot: `${p.key}_isa`, amount: cost(120) })
  }
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
  // Per-person line-item definitions; only people with a student loan carry one.
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
  /** member id → component key → component id */
  const compId: Record<string, Record<string, string>> = {}
  for (const p of people) {
    const owner = mine(p)
    compId[owner] = {}
    let order = 0
    for (const c of componentTemplate) {
      if (c.key === 'student_loan' && !p.studentLoan) continue
      const cid = id()
      compId[owner]![c.key] = cid
      components.push({
        id: cid,
        ownerId: owner,
        name: c.name,
        kind: c.kind,
        isVariable: c.variable ? 1 : 0,
        sortOrder: order++,
        archivedAt: null,
        ...ts,
      })
    }
  }

  // -- income: raises (salary history) ------------------------------------
  // Each person: a baseline raise a couple of years back, then a promotion.
  interface RaiseDef { owner: string; monthsAgo: number; salary: number; position: string; bonus: number | null }
  const raiseDefs: RaiseDef[] = []
  for (const p of people) {
    raiseDefs.push({ owner: mine(p), monthsAgo: p.baselineMonthsAgo, salary: minor(p.salary), position: p.positions[0], bonus: null })
    raiseDefs.push({
      owner: mine(p),
      monthsAgo: p.promotionMonthsAgo,
      salary: minor(p.promotedTo),
      position: p.positions[1],
      bonus: p.promotionBonus === null ? null : minor(p.promotionBonus),
    })
  }
  const raises = raiseDefs.map((r) => {
    const a = shiftMonth(thisMonth, -r.monthsAgo)
    return {
      id: id(),
      ownerId: r.owner,
      effectiveDate: ymd(a.year, a.month, 1),
      newSalary: r.salary,
      bonus: r.bonus,
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

  // -- income: payslips over the history window ----------------------------
  const payslips: Array<Record<string, unknown>> = []
  const payslipLines: Array<Record<string, unknown>> = []
  for (const p of people) {
    const owner = mine(p)
    for (let k = scale.payslipMonths - 1; k >= 0; k--) {
      const a = shiftMonth(thisMonth, -k)
      const annual = salaryAt(owner, a)
      if (annual === 0) continue
      const monthGross = annual / 12
      const isBonus = k === 3 // the annual bonus lands three months back
      const bonus = isBonus ? Math.round(monthGross * 0.6) : 0
      const overtime = k % 5 === 2 ? minor(randInt(80, 260)) : 0
      const gross = monthGross + bonus + overtime
      const pension = Math.round(gross * 0.05)
      const taxable = Math.max(0, gross - minor(1047.5))
      const tax = Math.round(taxable * 0.2)
      const ni = Math.max(0, Math.round((gross - minor(1048)) * 0.08))
      const studentLoan = p.studentLoan ? Math.max(0, Math.round((gross - minor(2082)) * 0.09)) : 0
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
      if (p.studentLoan) line('student_loan', studentLoan)
      line('employer_pension', employerPension)
    }
  }

  // -- income: recurring non-payslip sources -------------------------------
  const incomeSources: Array<Record<string, unknown>> = [
    { id: id(), ownerId: joint, name: 'Spare Room (rental)', amount: cost(650), basis: 'net', recurrence: 'monthly', active: 1, note: null, archivedAt: null, ...ts },
  ]
  for (const p of people) {
    if (!p.sideIncome) continue
    incomeSources.push({
      id: id(),
      ownerId: mine(p),
      name: p.sideIncome.name,
      amount: cost(p.sideIncome.amount),
      basis: p.sideIncome.basis,
      recurrence: p.sideIncome.recurrence,
      active: 1,
      note: p.sideIncome.note ?? null,
      archivedAt: null,
      ...ts,
    })
  }

  // -- accounts & net worth ------------------------------------------------
  interface AcctDef {
    name: string
    kind: 'asset' | 'liability'
    subtype: string
    owner: string
    institution: string
    start: number // balance at the start of the window (minor units, positive magnitude)
    monthly: number // signed monthly drift (assets grow +, debts shrink toward 0 with negative drift on magnitude)
  }
  const acctDefs: AcctDef[] = [
    { name: 'Home', kind: 'asset', subtype: 'property', owner: joint, institution: 'Zoopla est.', start: cost(318000), monthly: cost(450) },
    { name: 'Emergency Savings', kind: 'asset', subtype: 'savings', owner: joint, institution: 'Barclays', start: cost(9200), monthly: cost(210) },
  ]
  for (const p of people) {
    acctDefs.push({ name: `${p.name} Pension`, kind: 'asset', subtype: 'pension', owner: mine(p), institution: p.pension.institution, start: minor(p.pension.start), monthly: minor(p.pension.monthly) })
    if (p.isa) acctDefs.push({ name: `${p.name} Stocks & Shares ISA`, kind: 'asset', subtype: 'investment', owner: mine(p), institution: 'Vanguard', start: cost(7600), monthly: cost(240) })
  }
  acctDefs.push({ name: 'Mortgage', kind: 'liability', subtype: 'mortgage', owner: joint, institution: 'Nationwide', start: cost(243000), monthly: -cost(620) })
  for (const p of people) {
    if (p.studentLoan) acctDefs.push({ name: `${p.name} Student Loan`, kind: 'liability', subtype: 'student_loan', owner: mine(p), institution: 'SLC', start: cost(14800), monthly: -cost(120) })
    if (p.commute === 'car') acctDefs.push({ name: `${p.name} Car Loan`, kind: 'liability', subtype: 'loan', owner: mine(p), institution: 'Zopa', start: cost(9400), monthly: -cost(240) })
  }
  acctDefs.push({ name: 'Joint Credit Card', kind: 'liability', subtype: 'credit_card', owner: joint, institution: 'Amex', start: cost(1250), monthly: 0 })

  const accounts: Array<Record<string, unknown>> = []
  const accountBalances: Array<Record<string, unknown>> = []
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
    for (let k = scale.netWorthMonths - 1; k >= 0; k--) {
      const a = shiftMonth(thisMonth, -k)
      const elapsed = scale.netWorthMonths - 1 - k
      // Credit card wobbles around its balance; everything else drifts linearly.
      const base = def.monthly === 0 ? def.start : def.start + def.monthly * elapsed
      const value = def.monthly === 0 ? Math.max(minor(300), jitter(def.start, 0.35)) : Math.max(0, jitter(base, 0.015))
      accountBalances.push({ id: id(), accountId: aid, asOfDate: ymd(a.year, a.month, 1), value, note: null, ...ts })
    }
  })

  // -- spending: months of transactions ------------------------------------
  // Realistic payees per pot; most older ones reconciled, a recent tail left
  // open (the catch-up backlog), a couple with no pot ("needs a pot"), a few
  // refunds, one split across two pots, and a batch tagged as an import.
  const everyPerson = people.map(mine)
  interface PayeeSet { pot: string; owners: string[]; payees: string[]; min: number; max: number; perMonth: number }
  const spendModel: PayeeSet[] = [
    { pot: 'groceries', owners: [joint], payees: ['Tesco', "Sainsbury's", 'Aldi', 'Lidl', 'Ocado', 'Co-op'], min: 14, max: 82, perMonth: volume(9) },
    { pot: 'eating_out', owners: [...everyPerson, joint], payees: ['Nando’s', 'Pizza Express', 'The Ivy House', 'Wagamama', 'Local Pub', 'Deliveroo'], min: 12, max: 68, perMonth: volume(4) },
    { pot: 'fuel', owners: everyPerson, payees: ['Shell', 'BP', 'Esso', 'Tesco Fuel'], min: 40, max: 72, perMonth: volume(3) },
    { pot: 'streaming', owners: [joint], payees: ['Netflix', 'Spotify', 'Disney+'], min: 7, max: 16, perMonth: volume(1) },
  ]
  for (const p of people) {
    if (p.commute === 'car') {
      spendModel.push({ pot: `${p.key}_car`, owners: [mine(p)], payees: ['NCP Parking', 'Kwik Fit', 'Halfords'], min: 6, max: 48, perMonth: volume(2) })
    }
    spendModel.push({ pot: `${p.key}_spend`, owners: [mine(p)], payees: p.payees, min: 9, max: 90, perMonth: volume(3) })
    spendModel.push({ pot: `${p.key}_gym`, owners: [mine(p)], payees: ['PureGym'], min: 30, max: 30, perMonth: 1 })
  }

  const spends: Array<Record<string, unknown>> = []
  // Reconcile everything before this cutoff; leave the recent tail open.
  const openTailStart = shiftMonth(thisMonth, 0) // current month stays open
  const openCutoff = openTailStart.year * 12 + (openTailStart.month - 1)

  interface SpendSeed { date: string; monthKey: number; description: string; amount: number; owner: string; pot: string | null; category: string | null }
  const seeds: SpendSeed[] = []

  for (let k = scale.spendMonths - 1; k >= 0; k--) {
    const a = shiftMonth(thisMonth, -k)
    const dim = daysInMonth(a.year, a.month)
    const monthKey = a.year * 12 + (a.month - 1)
    for (const m of spendModel) {
      const count = Math.max(1, m.perMonth + randInt(-1, 1))
      for (let n = 0; n < count; n++) {
        const day = randInt(1, dim)
        const owner = pick(m.owners)
        const amount = cost(randInt(m.min, m.max))
        seeds.push({ date: ymd(a.year, a.month, day), monthKey, description: pick(m.payees), amount, owner, pot: m.pot, category: null })
      }
    }
  }

  const first = people[0]!
  const last = people[people.length - 1]!

  // A couple of refunds (negative amounts) in the recent months.
  {
    const a = shiftMonth(thisMonth, -1)
    const mk = a.year * 12 + (a.month - 1)
    seeds.push({ date: ymd(a.year, a.month, 14), monthKey: mk, description: `${last.payees[0]} refund`, amount: -cost(34), owner: mine(last), pot: `${last.key}_spend`, category: null })
    seeds.push({ date: ymd(a.year, a.month, 23), monthKey: mk, description: `${first.payees[0]} return`, amount: -cost(28), owner: mine(first), pot: `${first.key}_spend`, category: null })
  }

  // Two "needs a pot" spends this month (no pot; one carries a category hint).
  {
    const a = thisMonth
    const mk = a.year * 12 + (a.month - 1)
    seeds.push({ date: ymd(a.year, a.month, Math.min(6, daysInMonth(a.year, a.month))), monthKey: mk, description: 'Cash withdrawal', amount: cost(40), owner: mine(first), pot: null, category: null })
    seeds.push({ date: ymd(a.year, a.month, Math.min(9, daysInMonth(a.year, a.month))), monthKey: mk, description: 'John Lewis', amount: cost(76), owner: joint, pot: null, category: catId['personal']! })
  }

  // Build spend rows; decide reconciliation & imports as we go.
  const importBatchId = id()
  let importedCount = 0
  const splitGroupId = id()

  // One split: a big shop split across Groceries and one person's spending.
  {
    const a = thisMonth
    const day = Math.min(3, daysInMonth(a.year, a.month))
    const date = ymd(a.year, a.month, day)
    spends.push({
      id: id(), date, description: 'Big shop (split)', amount: cost(60), ownerId: joint, potId: potId['groceries']!, categoryId: null,
      expenseId: null, reconciled: 0, reconciledAt: null, reconciliationBatchId: null, source: 'manual', importRef: null, importBatchId: null, raw: null,
      splitGroupId, note: null, ...ts,
    })
    spends.push({
      id: id(), date, description: 'Big shop (split)', amount: cost(35), ownerId: joint, potId: potId[`${first.key}_spend`]!, categoryId: null,
      expenseId: null, reconciled: 0, reconciledAt: null, reconciliationBatchId: null, source: 'manual', importRef: null, importBatchId: null, raw: null,
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
      expenseId: null,
      reconciled: willReconcile ? 1 : 0,
      reconciledAt: willReconcile ? now : null,
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

  // A run of real Broadband payments (#67) that sits ahead of the recorded bill
  // amount — the last few land higher. The review prefers these actuals over the
  // stated price, showing the divergence the issue calls out. Marked reconciled
  // (historical), so they never clutter the live catch-up backlog.
  {
    const expId = expenseIdByName['Broadband']
    const broadbandPot = potId['broadband']
    if (expId && broadbandPot) {
      for (let m = 14; m >= 0; m--) {
        const a = shiftMonth(thisMonth, -m)
        const major = m >= 11 ? 28 : m >= 5 ? 30 : 34
        spends.push({
          id: id(),
          date: ymd(a.year, a.month, Math.min(20, daysInMonth(a.year, a.month))),
          description: 'Broadband',
          amount: cost(major),
          ownerId: joint,
          potId: broadbandPot,
          categoryId: null,
          expenseId: expId,
          reconciled: 1,
          reconciledAt: now,
          reconciliationBatchId: null,
          source: 'manual',
          importRef: null,
          importBatchId: null,
          raw: null,
          splitGroupId: null,
          note: null,
          ...ts,
        })
      }
    }
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
        importedAt: now,
        ...ts,
      }]
    : []

  return {
    household: households,
    member: members,
    category: categories,
    pot: pots,
    expense: expenses,
    billPrice: billPrices,
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

/** One household's generated rows, ready to insert, plus the household id every
 *  tenant-scoped row among them belongs to. */
export interface DemoDataset {
  householdId: string
  rows: DemoRows
}

/** Tables whose rows carry a `householdId`, so the seeder knows which to stamp.
 *  Derived from the schema rather than listed, so a new tenant-scoped table is
 *  picked up automatically. */
const HOUSEHOLD_SCOPED: ReadonlySet<string> = new Set(
  ALL_TABLES.filter(([, table]) => 'householdId' in getTableColumns(table)).map(([name]) => name),
)

/**
 * Wipe every table and insert the given datasets. Meant to run against a
 * DEDICATED fake-data database (scripts/seed-demo.ts, scripts/seed-dev.ts),
 * never the real one. Returns a per-table row count across all datasets.
 */
export async function seedHouseholds(db: DB, datasets: DemoDataset[]): Promise<Record<string, number>> {
  // Delete children-first (reverse FK order), then insert parents-first, all in
  // one atomic transaction — matches the pattern in features/admin/data.router.ts.
  const counts: Record<string, number> = {}
  const INSERT_CHUNK = 200
  await db.transaction(async (tx) => {
    for (const [, table] of [...ALL_TABLES].reverse()) {
      await tx.delete(table as PgTable)
    }
    for (const [name, table] of ALL_TABLES) {
      counts[name] = 0
      for (const dataset of datasets) {
        const rows = dataset.rows[name] ?? []
        counts[name] += rows.length
        // Stamp householdId on the tenant-scoped tables here rather than on each
        // of the dozens of row literals — and now that the schema no longer
        // defaults household_id, an omitted stamp is a loud NOT NULL error, not a
        // silent mis-scope. A row carrying its own (a membership of a household
        // other than the dataset's) wins, since the spread comes second.
        const scoped = HOUSEHOLD_SCOPED.has(name)
          ? rows.map((r) => ({ householdId: dataset.householdId, ...(r as object) }))
          : rows
        for (let i = 0; i < scoped.length; i += INSERT_CHUNK) {
          const chunk = scoped.slice(i, i + INSERT_CHUNK)
          if (chunk.length > 0) await tx.insert(table as PgTable).values(chunk as never)
        }
      }
    }
  })
  return counts
}

/**
 * Wipe every table and insert the demo dataset: one open, password-less
 * household. Meant to run against a DEDICATED demo database (see
 * scripts/seed-demo.ts), never the real one. Returns a per-table row count.
 */
export async function seedDemo(db: DB, opts: DemoOptions = {}): Promise<Record<string, number>> {
  const spec = opts.household ?? MAPLE_STREET
  const counts = await seedHouseholds(db, [{ householdId: spec.id, rows: buildDemoData(opts) }])
  // Provision the owner user + membership for the demo household (the wipe above
  // clears them; the demo dataset itself carries no login identities).
  await ensureSeed(db)
  return counts
}

/** True if `householdId` is already seeded (used to avoid clobbering). */
export async function hasHousehold(db: DB, householdId: string = DEFAULT_HOUSEHOLD_ID): Promise<boolean> {
  const rows = await db.select().from(household).where(eq(household.id, householdId))
  return rows.length > 0 && rows[0]?.setupCompletedAt != null
}
