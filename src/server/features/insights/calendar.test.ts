import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../../db/testdb'
import { ensureSeed } from '../../db/seed'
import { appRouter } from '../../trpc/router'
import { category, expense, household, member, pot, savingsGoal, savingsItem } from '../../db/schema'

const RANGE = { from: '2026-06-01', to: '2026-06-30' }

async function setup() {
  const db = await makeTestDb()
  await ensureSeed(db)
  return { db, api: appRouter.createCaller({ db, householdId: 'household', role: 'owner' }) }
}

async function addGoal(db: Awaited<ReturnType<typeof makeTestDb>>, householdId = 'household') {
  const now = new Date()
  const stamps = { householdId, createdAt: now, updatedAt: now }
  await db.insert(member).values({ id: `m-${householdId}`, kind: 'joint', displayName: 'Joint', ...stamps })
  await db.insert(category).values({ id: `c-${householdId}`, name: 'Savings', ...stamps })
  await db.insert(pot).values({
    id: `pot-${householdId}`,
    name: 'Wedding pot',
    ownerId: `m-${householdId}`,
    categoryId: `c-${householdId}`,
    ...stamps,
  })
  await db.insert(savingsGoal).values({
    id: `goal-${householdId}`,
    potId: `pot-${householdId}`,
    shortId: 'k3x9p2',
    name: 'Wedding',
    targetAmount: 500000,
    targetDate: '2026-06-20',
    ...stamps,
  })
  await db.insert(savingsItem).values([
    { id: `cake-${householdId}`, goalId: `goal-${householdId}`, name: 'Cake', amount: 40000, dueDate: '2026-06-10', ...stamps },
    { id: `paid-${householdId}`, goalId: `goal-${householdId}`, name: 'Paid', amount: 100, dueDate: '2026-06-11', paidOn: '2026-06-01', ...stamps },
  ])
}

describe('dashboard.calendar', () => {
  it('gathers to-dos, bills and savings dates in date order', async () => {
    const { db, api } = await setup()
    const wedding = await api.todoLists.create({ name: 'Wedding' })
    await api.todos.create({ title: 'Book the band', dueDate: '2026-06-05', listId: wedding.id })
    await addGoal(db)
    const now = new Date()
    await db.insert(expense).values({
      id: 'bill',
      householdId: 'household',
      name: 'Council tax',
      amount: 15000,
      recurrence: 'monthly',
      dueAnchor: '2026-01-02',
      potId: 'pot-household',
      createdAt: now,
      updatedAt: now,
    })

    const events = await api.dashboard.calendar(RANGE)

    expect(events.map((e) => [e.date, e.kind, e.title])).toEqual([
      ['2026-06-02', 'bill', 'Council tax'],
      ['2026-06-05', 'todo', 'Book the band'],
      ['2026-06-10', 'savings', 'Cake'],
      ['2026-06-20', 'savings', 'Wedding'],
    ])
    expect(events[1]?.href).toBe(`/todos/${wedding.shortId}-wedding`)
    expect(events[2]?.href).toBe('/planners/k3x9p2-wedding')
    expect(events[2]?.amount).toBe(40000)
  })

  it('leaves out what is finished, undated or outside the range', async () => {
    const { api } = await setup()
    const done = await api.todos.create({ title: 'Ticked', dueDate: '2026-06-05' })
    await api.todos.complete({ id: done.id, done: true })
    const gone = await api.todos.create({ title: 'Archived', dueDate: '2026-06-05' })
    await api.todos.archive({ id: gone.id })
    await api.todos.create({ title: 'Undated' })
    await api.todos.create({ title: 'July', dueDate: '2026-07-01' })

    expect(await api.dashboard.calendar(RANGE)).toEqual([])
  })

  it('keeps households apart', async () => {
    const { db, api } = await setup()
    const now = new Date()
    await db.insert(household).values({ id: 'other', displayName: 'Other', createdAt: now, updatedAt: now })
    const other = appRouter.createCaller({ db, householdId: 'other', role: 'owner' })
    await other.todos.create({ title: 'Theirs', dueDate: '2026-06-05' })
    await addGoal(db, 'other')

    expect(await api.dashboard.calendar(RANGE)).toEqual([])
  })

  it('refuses a range too long for one month grid', async () => {
    const { api } = await setup()

    await expect(api.dashboard.calendar({ from: '2026-01-01', to: '2026-12-31' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })
})
