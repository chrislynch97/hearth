import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../../db/testdb'
import { ensureSeed } from '../../db/seed'
import { appRouter } from '../../trpc/router'
import { addDays, todayIso } from '../../../shared/dates'

describe('plan router', () => {
  it('funding computes pot fundings and per-person setAside from seeded data', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!
    const alice = await caller.members.addPerson({ displayName: 'Alice' })
    const bob = await caller.members.addPerson({ displayName: 'Bob' })

    const alicePot = await caller.pots.create({ name: 'Alice Personal', ownerId: alice.id })
    const bobPot = await caller.pots.create({ name: 'Bob Personal', ownerId: bob.id })
    const jointPot = await caller.pots.create({ name: 'Joint Savings', ownerId: joint.id })

    // Monthly bill 5000 -> alicePot
    await caller.expenses.create({
      name: 'Phone', recurrence: 'monthly', amount: 5000, funding: 'pot_manual', potId: alicePot.id,
    })

    // Yearly: 12000/yr (=1000/mo) -> bobPot; a separate bill 24000/yr (=2000/mo) -> jointPot
    await caller.expenses.create({
      name: 'Car Insurance', recurrence: 'yearly', amount: 12000, funding: 'pot_manual', potId: bobPot.id,
    })
    await caller.expenses.create({
      name: 'Joint Insurance', recurrence: 'yearly', amount: 24000, funding: 'pot_manual', potId: jointPot.id,
    })

    const plan = await caller.plan.funding()

    const alicePotFunding = plan.pots.find((p) => p.potId === alicePot.id)!
    const bobPotFunding = plan.pots.find((p) => p.potId === bobPot.id)!
    const jointPotFunding = plan.pots.find((p) => p.potId === jointPot.id)!

    expect(alicePotFunding.fundingPerPeriod).toBe(5000)
    expect(bobPotFunding.fundingPerPeriod).toBe(1000)
    expect(jointPotFunding.fundingPerPeriod).toBe(2000)

    expect(plan.jointPotFundingTotal).toBe(2000)

    const alicePerson = plan.perPerson.find((p) => p.memberId === alice.id)!
    const bobPerson = plan.perPerson.find((p) => p.memberId === bob.id)!

    // Default household.jointContributionBasis is 'equal' -> 1000 each
    expect(alicePerson.jointContribution).toBe(1000)
    expect(bobPerson.jointContribution).toBe(1000)

    expect(alicePerson.setAside).toBe(6000) // 5000 personal + 1000 joint
    expect(bobPerson.setAside).toBe(2000) // 1000 personal + 1000 joint

    expect(plan.unassignedFundingPerPeriod).toBe(0)
  })

  it('archived expenses and pots are excluded from the plan', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!
    const pot = await caller.pots.create({ name: 'Joint Pot', ownerId: joint.id })

    const expense = await caller.expenses.create({
      name: 'Streaming', recurrence: 'monthly', amount: 1000, funding: 'pot_manual', potId: pot.id,
    })
    await caller.expenses.archive({ id: expense.id })

    const plan = await caller.plan.funding()
    const potFunding = plan.pots.find((p) => p.potId === pot.id)!
    expect(potFunding.fundingPerPeriod).toBe(0)
  })

  it('recentlyDue lists dated bills near today, nearest first, with funding', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!
    const pot = await caller.pots.create({ name: 'Cloud', ownerId: joint.id })

    const today = todayIso()

    await caller.expenses.create({
      name: 'Soon', recurrence: 'monthly', dueAnchor: addDays(today, 3), amount: 800, funding: 'pot_manual', potId: pot.id,
    })
    await caller.expenses.create({
      name: 'Recent', recurrence: 'monthly', dueAnchor: addDays(today, -10), amount: 500, funding: 'pot_manual', potId: pot.id,
    })
    // No due date -> never projected onto a concrete day.
    await caller.expenses.create({
      name: 'Undated', recurrence: 'monthly', amount: 100, funding: 'pot_manual', potId: pot.id,
    })

    const due = await caller.plan.recentlyDue()
    const names = due.map((d) => d.name)
    expect(names).toContain('Soon')
    expect(names).toContain('Recent')
    expect(names).not.toContain('Undated')

    const soon = due.find((d) => d.name === 'Soon')!
    expect(soon.totalAmount).toBe(800)
    expect(soon.daysUntil).toBe(3)
    expect(soon.potId).toBe(pot.id)
    expect(soon.funding).toBe('pot_manual')
    expect(soon.settledAtSource).toBe(false)

    // Nearest-to-today first: Soon (3d away) ranks above Recent (10d away).
    expect(due.findIndex((d) => d.name === 'Soon')).toBeLessThan(
      due.findIndex((d) => d.name === 'Recent'),
    )
  })
})
