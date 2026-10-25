import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../../db/testdb'
import { ensureSeed } from '../../db/seed'
import { appRouter } from '../../trpc/router'
import { auditLog } from '../../db/schema'
import { addDays, addMonths, todayIso } from '@shared/dates'

async function setup(role: 'owner' | 'viewer' = 'owner') {
  const db = await makeTestDb()
  await ensureSeed(db)
  const caller = appRouter.createCaller({ db, householdId: 'household', role })
  const joint = role === 'owner' ? (await caller.members.list()).find((m) => m.kind === 'joint')! : null
  return { db, caller, jointId: joint?.id ?? '' }
}

const inAYear = () => addMonths(todayIso(), 12)

describe('savings router', () => {
  it('creates a goal on a new pot and funds it through that pot', async () => {
    const { caller, jointId } = await setup()
    const goal = await caller.savings.createGoal({
      name: 'Wedding',
      targetAmount: 1_200_000,
      targetDate: inAYear(),
      pot: { name: 'Wedding', ownerId: jointId },
    })
    const pots = await caller.pots.list()
    expect(pots.find((p) => p.id === goal.potId)?.name).toBe('Wedding')

    const before = await caller.savings.goal({ id: goal.id })
    expect(before.contribution).toBe(0)
    expect(before.plan.neededPerPeriod).toBeGreaterThan(0)

    await caller.savings.applyContribution({ goalId: goal.id, perPeriod: before.plan.neededPerPeriod })
    const after = await caller.savings.goal({ id: goal.id })
    expect(after.contribution).toBe(before.plan.neededPerPeriod)
    expect(after.contributionLineCount).toBe(1)
    expect(after.plan.outcome.short).toEqual([])

    // The funding plan sees the same money — there's no second engine.
    const funding = await caller.plan.funding()
    expect(funding.pots.find((p) => p.potId === goal.potId)?.fundingPerPeriod).toBe(after.contribution)

    // A second apply rewrites the one line rather than adding another.
    await caller.savings.applyContribution({ goalId: goal.id, perPeriod: 50_000 })
    const again = await caller.savings.goal({ id: goal.id })
    expect(again.contributionLineCount).toBe(1)
    expect(again.contribution).toBe(50_000)
  })

  it('only offers pots with no goal and no bills, and refuses the rest', async () => {
    const { caller, jointId } = await setup()
    const free = await caller.pots.create({ name: 'Kitchen', ownerId: jointId })
    const billed = await caller.pots.create({ name: 'Bills', ownerId: jointId })
    await caller.expenses.create({ name: 'Council tax', recurrence: 'monthly', amount: 15_000, funding: 'pot_manual', potId: billed.id })

    expect((await caller.savings.eligiblePots()).map((p) => p.id)).toEqual([free.id])
    await expect(
      caller.savings.createGoal({ name: 'X', targetAmount: 1, targetDate: inAYear(), pot: { id: billed.id } }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    await caller.savings.createGoal({ name: 'Kitchen', targetAmount: 800_000, targetDate: inAYear(), pot: { id: free.id } })
    expect(await caller.savings.eligiblePots()).toEqual([])
    await expect(
      caller.savings.createGoal({ name: 'Again', targetAmount: 1, targetDate: inAYear(), pot: { id: free.id } }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it("refuses a bill on a live goal's pot, on create and on a move", async () => {
    const { caller, jointId } = await setup()
    const goal = await caller.savings.createGoal({ name: 'Wedding', targetAmount: 1, targetDate: inAYear(), pot: { name: 'Wedding', ownerId: jointId } })
    const other = await caller.pots.create({ name: 'Bills', ownerId: jointId })

    await expect(
      caller.expenses.create({ name: 'Venue', recurrence: 'monthly', amount: 1_000, funding: 'pot_manual', potId: goal.potId }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: expect.stringContaining('saving for Wedding') })
    const bill = await caller.expenses.create({ name: 'Gym', recurrence: 'monthly', amount: 1_000, funding: 'pot_manual', potId: other.id })
    await expect(caller.expenses.update({ id: bill.id, potId: goal.potId })).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    // Once the goal is archived, the pot is free for bills again.
    await caller.savings.setArchived({ id: goal.id, archived: true })
    await caller.expenses.update({ id: bill.id, potId: goal.potId })
  })

  it('gives each goal a fixed short id in front of its name', async () => {
    const { caller, jointId } = await setup()
    const goal = await caller.savings.createGoal({ name: 'Our Wedding', targetAmount: 1, targetDate: inAYear(), pot: { name: 'Wedding', ownerId: jointId } })

    expect(goal.shortId).toMatch(/^[0-9a-z]{6}$/)
    expect((await caller.savings.goal({ id: goal.id })).slug).toBe(`${goal.shortId}-our-wedding`)
  })

  it('keeps two same-named goals on their own URLs when one is renamed', async () => {
    const { caller, jointId } = await setup()
    const first = await caller.savings.createGoal({ name: 'Garden', targetAmount: 1, targetDate: inAYear(), pot: { name: 'Garden', ownerId: jointId } })
    const second = await caller.savings.createGoal({ name: 'Garden', targetAmount: 1, targetDate: inAYear(), pot: { name: 'Garden 2', ownerId: jointId } })
    expect(first.shortId).not.toBe(second.shortId)
    const before = (await caller.savings.goal({ id: second.id })).slug

    await caller.savings.updateGoal({ id: first.id, name: 'Patio' })
    const goals = await caller.savings.goals()
    expect(goals.find((g) => g.goal.id === first.id)?.slug).toBe(`${first.shortId}-patio`)
    expect(goals.find((g) => g.goal.id === second.id)?.slug).toBe(before)
  })

  it("won't rewrite a pot that has several contribution lines", async () => {
    const { caller, jointId } = await setup()
    const p = await caller.pots.create({ name: 'Holiday', ownerId: jointId })
    await caller.setAside.replaceForPot({
      potId: p.id,
      lines: [{ label: 'Flights', amount: 10_000 }, { label: 'Hotel', amount: 15_000 }],
    })
    const goal = await caller.savings.createGoal({ name: 'Holiday', targetAmount: 300_000, targetDate: inAYear(), pot: { id: p.id } })

    expect((await caller.savings.goal({ id: goal.id })).contributionLineCount).toBe(2)
    await expect(caller.savings.applyContribution({ goalId: goal.id, perPeriod: 30_000 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('ticks an item paid, taking it off the target only when asked', async () => {
    const { db, caller, jointId } = await setup()
    const goal = await caller.savings.createGoal({ name: 'Wedding', targetAmount: 3_000_000, targetDate: inAYear(), pot: { name: 'Wedding', ownerId: jointId } })
    const deposit = await caller.savings.createItem({ goalId: goal.id, name: 'Venue deposit', amount: 200_000, dueDate: addDays(todayIso(), 30) })
    const cake = await caller.savings.createItem({ goalId: goal.id, name: 'Cake', amount: 50_000 })

    const kept = await caller.savings.setPaid({ id: cake.id, paidOn: todayIso() })
    expect(kept.targetAmount).toBeNull()
    expect((await caller.savings.goal({ id: goal.id })).goal.targetAmount).toBe(3_000_000)

    const reduced = await caller.savings.setPaid({ id: deposit.id, paidOn: todayIso(), reduceTarget: true })
    expect(reduced.targetAmount).toBe(2_800_000)
    const entries = await db.select().from(auditLog).where(eq(auditLog.entityId, goal.id))
    expect(entries.map((e) => e.action)).toEqual(['create', 'update'])

    // Unticking leaves the target where it is.
    await caller.savings.setPaid({ id: deposit.id, paidOn: null, reduceTarget: true })
    const after = await caller.savings.goal({ id: goal.id })
    expect(after.goal.targetAmount).toBe(2_800_000)
    expect(after.items.find((i) => i.id === deposit.id)?.paidOn).toBeNull()
  })

  it('raises the target when a new item takes the items past it, and says so', async () => {
    const { db, caller, jointId } = await setup()
    const goal = await caller.savings.createGoal({ name: 'Kitchen', targetAmount: 500_000, targetDate: inAYear(), pot: { name: 'Kitchen', ownerId: jointId } })
    const units = await caller.savings.createItem({ goalId: goal.id, name: 'Units', amount: 300_000 })
    expect(units.raisedTarget).toBeNull()

    const worktops = await caller.savings.createItem({ goalId: goal.id, name: 'Worktops', amount: 250_000 })
    expect(worktops.raisedTarget).toBe(550_000)
    expect((await caller.savings.goal({ id: goal.id })).goal.targetAmount).toBe(550_000)
    const entries = await db.select().from(auditLog).where(eq(auditLog.entityId, goal.id))
    expect(entries.map((e) => e.action)).toEqual(['create', 'update'])
  })

  it('raises it on an edit too, but never for a paid item', async () => {
    const { caller, jointId } = await setup()
    const goal = await caller.savings.createGoal({ name: 'Kitchen', targetAmount: 500_000, targetDate: inAYear(), pot: { name: 'Kitchen', ownerId: jointId } })
    const units = await caller.savings.createItem({ goalId: goal.id, name: 'Units', amount: 300_000 })
    const tap = await caller.savings.createItem({ goalId: goal.id, name: 'Tap', amount: 20_000 })
    await caller.savings.setPaid({ id: tap.id, paidOn: todayIso() })

    // A paid item's cost has left the pot, so it allocates nothing.
    expect((await caller.savings.updateItem({ id: tap.id, amount: 400_000 })).raisedTarget).toBeNull()
    expect((await caller.savings.updateItem({ id: units.id, amount: 520_000 })).raisedTarget).toBe(520_000)
  })

  it("sets the pot's rate from the goal, and plans with it", async () => {
    const { caller, jointId } = await setup()
    const goal = await caller.savings.createGoal({
      name: 'House',
      targetAmount: 2_000_000,
      targetDate: addMonths(todayIso(), 36),
      pot: { name: 'House', ownerId: jointId },
      interestRateBp: 400,
    })
    expect((await caller.pots.list()).find((p) => p.id === goal.potId)?.interestRateBp).toBe(400)
    await caller.savings.recordBalance({ goalId: goal.id, asOfDate: todayIso(), amount: 500_000 })
    const earning = await caller.savings.goal({ id: goal.id })
    expect(earning.interestRateBp).toBe(400)

    await caller.savings.updateGoal({ id: goal.id, interestRateBp: null })
    const flat = await caller.savings.goal({ id: goal.id })
    expect(flat.interestRateBp).toBeNull()
    expect(earning.plan.neededPerPeriod).toBeLessThan(flat.plan.neededPerPeriod)
  })

  it("leaves the pot's version alone when the rate hasn't changed", async () => {
    const { caller, jointId } = await setup()
    const p = await caller.pots.create({ name: 'Car', ownerId: jointId, interestRateBp: 300 })
    const goal = await caller.savings.createGoal({ name: 'Car', targetAmount: 500_000, targetDate: inAYear(), pot: { id: p.id }, interestRateBp: 300 })
    await caller.savings.updateGoal({ id: goal.id, name: 'New car', interestRateBp: 300 })

    // Plan's pot form still holds the version it opened with, so its save goes through.
    await caller.pots.update({ id: p.id, expectedUpdatedAt: p.updatedAt, name: 'Car fund' })
  })

  it('plans an item-by-item goal on its unpaid items, by the last date', async () => {
    const { caller, jointId } = await setup()
    const hens = await caller.savings.createGoal({ name: 'Hen dos', targetAmount: null, targetDate: null, pot: { name: 'Hen dos', ownerId: jointId } })
    const later = await caller.savings.createGoal({ name: 'Car', targetAmount: 500_000, targetDate: inAYear(), pot: { name: 'Car', ownerId: jointId } })
    await expect(caller.savings.createItem({ goalId: hens.id, name: 'Undated', amount: 10_000 })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    const away = await caller.savings.createItem({ goalId: hens.id, name: 'My away hen', amount: 60_000, dueDate: addMonths(todayIso(), 5) })
    await caller.savings.createItem({ goalId: hens.id, name: 'Friends home hen', amount: 10_000, dueDate: addMonths(todayIso(), 9) })
    expect(away.raisedTarget).toBeNull()

    const detail = await caller.savings.goal({ id: hens.id })
    expect(detail.goal.targetAmount).toBeNull()
    expect(detail.target).toEqual({ targetAmount: 70_000, targetDate: addMonths(todayIso(), 9) })
    expect(detail.plan.lines.map((line) => line.itemId)).not.toContain(null)
    // Soonest first, by the date it's planned to.
    expect((await caller.savings.goals()).map((g) => g.goal.id)).toEqual([hens.id, later.id])
    await expect(caller.savings.updateItem({ id: away.id, dueDate: null })).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    // Paying one has no target to come off; it just leaves the plan.
    expect((await caller.savings.setPaid({ id: away.id, paidOn: todayIso(), reduceTarget: true })).targetAmount).toBeNull()
    expect((await caller.savings.goal({ id: hens.id })).target.targetAmount).toBe(10_000)
  })

  it('keeps a target and its date together', async () => {
    const { caller, jointId } = await setup()
    await expect(
      caller.savings.createGoal({ name: 'X', targetAmount: 100_000, targetDate: null, pot: { name: 'X', ownerId: jointId } }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    const goal = await caller.savings.createGoal({ name: 'Y', targetAmount: 100_000, targetDate: inAYear(), pot: { name: 'Y', ownerId: jointId } })
    await expect(caller.savings.updateGoal({ id: goal.id, targetDate: null })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('gives undated items the old goal date when a goal goes item by item, and back again', async () => {
    const { caller, jointId } = await setup()
    const date = inAYear()
    const goal = await caller.savings.createGoal({ name: 'Wedding', targetAmount: 1_000_000, targetDate: date, pot: { name: 'Wedding', ownerId: jointId } })
    const cake = await caller.savings.createItem({ goalId: goal.id, name: 'Cake', amount: 50_000 })
    const dress = await caller.savings.createItem({ goalId: goal.id, name: 'Dress', amount: 200_000, dueDate: addMonths(todayIso(), 6) })

    await caller.savings.updateGoal({ id: goal.id, targetAmount: null, targetDate: null })
    const { items } = await caller.savings.goal({ id: goal.id })
    expect(items.find((i) => i.id === cake.id)?.dueDate).toBe(date)
    expect(items.find((i) => i.id === dress.id)?.dueDate).toBe(addMonths(todayIso(), 6))

    expect(await caller.savings.updateGoal({ id: goal.id, targetAmount: 250_000, targetDate: date })).toMatchObject({
      targetAmount: 250_000,
      targetDate: date,
    })
  })

  it('keeps one balance per day and builds the plan on the latest', async () => {
    const { caller, jointId } = await setup()
    const goal = await caller.savings.createGoal({ name: 'Car', targetAmount: 500_000, targetDate: inAYear(), pot: { name: 'Car', ownerId: jointId } })
    const today = todayIso()
    await caller.savings.recordBalance({ goalId: goal.id, asOfDate: addDays(today, -40), amount: 100_000, note: 'Opened' })
    await caller.savings.recordBalance({ goalId: goal.id, asOfDate: today, amount: 150_000 })
    const replaced = await caller.savings.recordBalance({ goalId: goal.id, asOfDate: today, amount: 180_000, note: 'Bonus' })

    const detail = await caller.savings.goal({ id: goal.id })
    expect(detail.balances.map((b) => b.amount)).toEqual([100_000, 180_000])
    expect(detail.plan.balanceNow).toBe(180_000)

    await caller.savings.removeBalance({ id: replaced.id })
    expect((await caller.savings.goal({ id: goal.id })).balances).toHaveLength(1)
  })

  it('corrects a recorded balance, moving it to a free day only', async () => {
    const { caller, jointId } = await setup()
    const goal = await caller.savings.createGoal({ name: 'Car', targetAmount: 500_000, targetDate: inAYear(), pot: { name: 'Car', ownerId: jointId } })
    const today = todayIso()
    const older = await caller.savings.recordBalance({ goalId: goal.id, asOfDate: addDays(today, -10), amount: 100_000 })
    await caller.savings.recordBalance({ goalId: goal.id, asOfDate: today, amount: 120_000 })

    const moved = await caller.savings.updateBalance({
      id: older.id,
      expectedUpdatedAt: older.updatedAt,
      asOfDate: addDays(today, -12),
      amount: 95_000,
      note: 'Typo',
    })
    expect(moved).toMatchObject({ asOfDate: addDays(today, -12), amount: 95_000, note: 'Typo' })
    await expect(caller.savings.updateBalance({ id: older.id, asOfDate: today })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(
      caller.savings.updateBalance({ id: older.id, expectedUpdatedAt: older.updatedAt, amount: 1 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('surfaces an unpaid item past its deadline on the Overview, until the goal is archived', async () => {
    const { caller, jointId } = await setup()
    const goal = await caller.savings.createGoal({ name: 'Kitchen', targetAmount: 900_000, targetDate: inAYear(), pot: { name: 'Kitchen', ownerId: jointId } })
    await caller.savings.recordBalance({ goalId: goal.id, asOfDate: todayIso(), amount: 10_000 })
    const deposit = await caller.savings.createItem({ goalId: goal.id, name: 'Deposit', amount: 60_000, dueDate: addDays(todayIso(), -3) })
    await caller.savings.createItem({ goalId: goal.id, name: 'Worktops', amount: 300_000, dueDate: addMonths(todayIso(), 6) })

    const [alert, ...rest] = (await caller.dashboard.summary()).savingsAlerts
    expect(rest).toEqual([])
    expect(alert).toMatchObject({ goalId: goal.id, itemId: deposit.id, kind: 'overdue', shortBy: 50_000 })

    await caller.savings.setArchived({ id: goal.id, archived: true })
    expect((await caller.dashboard.summary()).savingsAlerts).toEqual([])
  })

  it('deletes a goal with its items and balances, leaving the pot', async () => {
    const { caller, jointId } = await setup()
    const goal = await caller.savings.createGoal({ name: 'Sofa', targetAmount: 150_000, targetDate: inAYear(), pot: { name: 'Sofa', ownerId: jointId } })
    const item = await caller.savings.createItem({ goalId: goal.id, name: 'Sofa', amount: 150_000 })

    await caller.savings.removeGoal({ id: goal.id })
    expect(await caller.savings.goals()).toEqual([])
    await expect(caller.savings.updateItem({ id: item.id, name: 'x' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect((await caller.pots.list()).some((p) => p.id === goal.potId)).toBe(true)
  })

  it('refuses a stale edit', async () => {
    const { caller, jointId } = await setup()
    const goal = await caller.savings.createGoal({ name: 'Trip', targetAmount: 200_000, targetDate: inAYear(), pot: { name: 'Trip', ownerId: jointId } })
    await caller.savings.updateGoal({ id: goal.id, targetAmount: 250_000 })
    await expect(
      caller.savings.updateGoal({ id: goal.id, expectedUpdatedAt: goal.updatedAt, name: 'Late' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('lets a viewer look but not edit', async () => {
    const { caller } = await setup('viewer')
    expect(await caller.savings.goals()).toEqual([])
    await expect(
      caller.savings.createGoal({ name: 'X', targetAmount: 1, targetDate: inAYear(), pot: { name: 'X', ownerId: 'x' } }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
