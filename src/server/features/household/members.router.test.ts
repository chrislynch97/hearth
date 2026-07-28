import { describe, it, expect } from 'vitest'
import { TRPCError } from '@trpc/server'
import { makeTestDb } from '../../db/testdb'
import { ensureSeed } from '../../db/seed'
import { appRouter } from '../../trpc/router'

describe('members router', () => {
  it('list returns seeded joint member ordered by sortOrder', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const members = await caller.members.list()
    expect(members.length).toBe(1)
    expect(members[0]?.kind).toBe('joint')
  })

  it('addPerson creates a person and list returns it with joint, ordered', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const person = await caller.members.addPerson({ displayName: 'Alice' })

    expect(person.kind).toBe('person')
    expect(person.displayName).toBe('Alice')
    expect(person.id).toBeTruthy()

    const members = await caller.members.list()
    // Expect both: joint (sortOrder=100) and Alice (sortOrder=101)
    expect(members.length).toBe(2)
    const displayNames = members.map((m) => m.displayName)
    expect(displayNames).toContain('Alice')
    expect(displayNames).toContain('Joint')
    // Ordered by sortOrder asc — Alice sortOrder should be < 100 or the joint is last
    // Alice gets max(100) + 1 = 101, so joint comes first
    expect(members[0]?.kind).toBe('joint')
    expect(members[1]?.displayName).toBe('Alice')
  })

  it('addPerson sets timestamps', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const before = Date.now()
    const person = await caller.members.addPerson({ displayName: 'Bob' })
    const after = Date.now()

    expect(person.createdAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(person.createdAt.getTime()).toBeLessThanOrEqual(after)
    expect(person.updatedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(person.updatedAt.getTime()).toBeLessThanOrEqual(after)
  })

  it('addPerson accepts optional fields', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const person = await caller.members.addPerson({
      displayName: 'Carol',
      shortLabel: 'C',
      color: '#ff0000',
      jointContributionWeight: 50,
    })

    expect(person.shortLabel).toBe('C')
    expect(person.color).toBe('#ff0000')
    expect(person.jointContributionWeight).toBe(50)
  })

  it('update renames a member and persists', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const person = await caller.members.addPerson({ displayName: 'Dave' })
    const updated = await caller.members.update({ id: person.id, displayName: 'David' })

    expect(updated.displayName).toBe('David')
    expect(updated.id).toBe(person.id)
    expect(updated.kind).toBe('person') // kind not changed

    // Confirm persistence via list
    const members = await caller.members.list()
    const found = members.find((m) => m.id === person.id)
    expect(found?.displayName).toBe('David')
  })

  it('update sets updatedAt', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const person = await caller.members.addPerson({ displayName: 'Eve' })
    const before = Date.now()
    const updated = await caller.members.update({ id: person.id, displayName: 'Evelyn' })
    const after = Date.now()

    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(updated.updatedAt.getTime()).toBeLessThanOrEqual(after)
  })

  it('update can rename the joint member', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!
    const updated = await caller.members.update({ id: joint.id, displayName: 'Household' })

    expect(updated.displayName).toBe('Household')
    expect(updated.kind).toBe('joint')
  })

  it('archive sets archivedAt for a person', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const person = await caller.members.addPerson({ displayName: 'Frank' })

    const before = Date.now()
    await caller.members.archive({ id: person.id })
    const after = Date.now()

    // Confirm archivedAt is set via list (still returned in list)
    const members = await caller.members.list()
    const found = members.find((m) => m.id === person.id)
    expect(found!.archivedAt!.getTime()).toBeGreaterThanOrEqual(before)
    expect(found!.archivedAt!.getTime()).toBeLessThanOrEqual(after)
  })

  it('archive throws BAD_REQUEST for the joint member', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const members = await caller.members.list()
    const joint = members.find((m) => m.kind === 'joint')!

    await expect(caller.members.archive({ id: joint.id })).rejects.toThrow(TRPCError)
    await expect(caller.members.archive({ id: joint.id })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('addPerson sortOrder is max + 1', async () => {
    const db = await makeTestDb()
    await ensureSeed(db) // joint at sortOrder=100
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })

    const p1 = await caller.members.addPerson({ displayName: 'G' })
    const p2 = await caller.members.addPerson({ displayName: 'H' })

    expect(p1.sortOrder).toBe(101)
    expect(p2.sortOrder).toBe(102)
  })
})
