import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'

describe('categories router', () => {
  it('create → list returns the new category', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const cat = await caller.categories.create({ name: 'Essentials' })

    expect(cat.id).toBeTruthy()
    expect(cat.name).toBe('Essentials')
    expect(cat.archivedAt).toBeNull()

    const list = await caller.categories.list()
    expect(list.length).toBe(1)
    expect(list[0]?.name).toBe('Essentials')
  })

  it('list is ordered by sortOrder asc then name asc', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const a = await caller.categories.create({ name: 'Zebra' })
    const b = await caller.categories.create({ name: 'Alpha' })

    // sortOrder: Zebra=1, Alpha=2 — Zebra comes first
    const list = await caller.categories.list()
    expect(list[0]?.id).toBe(a.id)
    expect(list[1]?.id).toBe(b.id)
  })

  it('create sets timestamps', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const before = Date.now()
    const cat = await caller.categories.create({ name: 'Groceries' })
    const after = Date.now()

    expect(cat.createdAt).toBeGreaterThanOrEqual(before)
    expect(cat.createdAt).toBeLessThanOrEqual(after)
    expect(cat.updatedAt).toBeGreaterThanOrEqual(before)
    expect(cat.updatedAt).toBeLessThanOrEqual(after)
  })

  it('create sortOrder is max+1', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const c1 = await caller.categories.create({ name: 'First' })
    const c2 = await caller.categories.create({ name: 'Second' })

    expect(c1.sortOrder).toBe(1)
    expect(c2.sortOrder).toBe(2)
  })

  it('update renames a category', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const cat = await caller.categories.create({ name: 'Old Name' })
    const updated = await caller.categories.update({ id: cat.id, name: 'New Name' })

    expect(updated.name).toBe('New Name')
    expect(updated.id).toBe(cat.id)

    const list = await caller.categories.list()
    expect(list[0]?.name).toBe('New Name')
  })

  it('update sets updatedAt', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const cat = await caller.categories.create({ name: 'Test' })
    const before = Date.now()
    const updated = await caller.categories.update({ id: cat.id, name: 'Test2' })
    const after = Date.now()

    expect(updated.updatedAt).toBeGreaterThanOrEqual(before)
    expect(updated.updatedAt).toBeLessThanOrEqual(after)
  })

  it('archive removes from list', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    const cat = await caller.categories.create({ name: 'ToArchive' })
    await caller.categories.archive({ id: cat.id })

    const list = await caller.categories.list()
    expect(list.find((c) => c.id === cat.id)).toBeUndefined()
  })

  it('archive throws NOT_FOUND for unknown id', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const caller = appRouter.createCaller({ db })

    await expect(caller.categories.archive({ id: 'nonexistent' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})
