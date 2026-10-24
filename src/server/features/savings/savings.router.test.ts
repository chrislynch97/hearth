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
