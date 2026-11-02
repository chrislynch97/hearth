import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../../db/testdb'
import { ensureSeed } from '../../db/seed'
import { appRouter } from '../../trpc/router'
import { auditLog, household, member, user, wishlistItem } from '../../db/schema'

type Db = Awaited<ReturnType<typeof makeTestDb>>

const caller = (db: Db, householdId = 'household', role: 'owner' | 'viewer' = 'owner') =>
  appRouter.createCaller({ db, householdId, role })

async function setup() {
  const db = await makeTestDb()
  await ensureSeed(db)
  return { db, api: caller(db) }
}

/** A second household with one member of its own, for the cross-tenant checks. */
async function otherHousehold(db: Db) {
  const now = new Date()
  await db.insert(household).values({ id: 'other', displayName: 'Other', createdAt: now, updatedAt: now })
  await db.insert(member).values({
    id: 'other-member',
    householdId: 'other',
    kind: 'person',
    displayName: 'Nobody',
    createdAt: now,
    updatedAt: now,
  })
  return caller(db, 'other')
}

describe('wishlistItems router', () => {
  it('lists a new item with its price in minor units, defaults and tags', async () => {
    const { api } = await setup()
    await api.wishlistItems.create({ name: 'Stand mixer', price: 34999, tags: ['Baking', 'baking', ' Kitchen '] })

    const [listed] = await api.wishlistItems.list()
    expect(listed).toMatchObject({ name: 'Stand mixer', price: 34999, priority: 'normal', listId: null, boughtAt: null })
    expect(listed?.tags).toEqual(['Baking', 'Kitchen'])
  })

  it('needs nothing but a name, and refuses a price that is not minor units', async () => {
    const { api } = await setup()
    await api.wishlistItems.create({ name: 'Rug' })

    expect((await api.wishlistItems.list())[0]).toMatchObject({ price: null, link: null, wantedById: null })
    await expect(api.wishlistItems.create({ name: 'No', price: 12.5 })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(api.wishlistItems.create({ name: 'No', price: -1 })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('gives a tag the spelling another item already uses', async () => {
    const { api } = await setup()
    await api.wishlistItems.create({ name: 'Mixer', tags: ['Kitchen'] })
    await api.wishlistItems.create({ name: 'Toaster', tags: ['kitchen'] })

    expect((await api.wishlistItems.list()).map((i) => i.tags)).toEqual([['Kitchen'], ['Kitchen']])
  })

  it('refuses a price too big to store', async () => {
    const { api } = await setup()

    await expect(api.wishlistItems.create({ name: 'Yacht', price: 3_000_000_000 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('replaces tags on update and leaves them alone when none are sent', async () => {
    const { api } = await setup()
    const item = await api.wishlistItems.create({ name: 'Rug', tags: ['Lounge'] })

    const renamed = await api.wishlistItems.update({ id: item.id, name: 'Big rug' })
    expect((await api.wishlistItems.list())[0]?.tags).toEqual(['Lounge'])

    await api.wishlistItems.update({ id: item.id, expectedUpdatedAt: renamed.updatedAt, tags: ['Hall'] })
    expect((await api.wishlistItems.list())[0]?.tags).toEqual(['Hall'])
  })

  it('refuses a person or list from another household', async () => {
    const { db, api } = await setup()
    const other = await otherHousehold(db)
    const theirs = await other.wishlists.create({ name: 'Theirs' })

    await expect(api.wishlistItems.create({ name: 'No', wantedById: 'other-member' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(api.wishlistItems.create({ name: 'No', listId: theirs.id })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('keeps households apart, by-id routes included', async () => {
    const { db, api } = await setup()
    const other = await otherHousehold(db)
    const mine = await api.wishlistItems.create({ name: 'Ours', tags: ['Shared name'] })
    await other.wishlistItems.create({ name: 'Theirs', tags: ['Shared name'] })

    expect((await api.wishlistItems.list()).map((i) => i.name)).toEqual(['Ours'])
    expect((await api.wishlistItems.list())[0]?.tags).toEqual(['Shared name'])
    await expect(other.wishlistItems.update({ id: mine.id, name: 'Hijacked' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(other.wishlistItems.setBought({ id: mine.id, bought: true })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(other.wishlistItems.archive({ id: mine.id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses a stale update and rolls its tags back', async () => {
    const { api } = await setup()
    const item = await api.wishlistItems.create({ name: 'Rug', tags: ['Lounge'] })
    await api.wishlistItems.update({ id: item.id, expectedUpdatedAt: item.updatedAt, name: 'Big rug' })

    await expect(
      api.wishlistItems.update({ id: item.id, expectedUpdatedAt: item.updatedAt, tags: ['Stale'] }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect((await api.wishlistItems.list())[0]?.tags).toEqual(['Lounge'])
  })

  it('records who bought it and when, and un-ticking clears both', async () => {
    const { db } = await setup()
    const now = new Date()
    await db.insert(user).values({ id: 'u1', username: 'buyer', displayName: 'Buyer', createdAt: now, updatedAt: now })
    await db.insert(member).values({
      id: 'p1',
      householdId: 'household',
      userId: 'u1',
      kind: 'person',
      displayName: 'Buyer',
      createdAt: now,
      updatedAt: now,
    })
    const api = appRouter.createCaller({ db, householdId: 'household', role: 'owner', userId: 'u1' })
    const item = await api.wishlistItems.create({ name: 'Rug' })

    const bought = await api.wishlistItems.setBought({ id: item.id, bought: true })
    expect(bought?.boughtAt).toBeInstanceOf(Date)
    expect(bought?.boughtById).toBe('p1')

    const undone = await api.wishlistItems.setBought({ id: item.id, bought: false })
    expect(undone).toMatchObject({ boughtAt: null, boughtById: null })
  })

  it('treats a second tick as agreement rather than a conflict', async () => {
    const { api } = await setup()
    const item = await api.wishlistItems.create({ name: 'Rug' })
    await api.wishlistItems.setBought({ id: item.id, bought: true, expectedUpdatedAt: item.updatedAt })

    await expect(
      api.wishlistItems.setBought({ id: item.id, bought: true, expectedUpdatedAt: item.updatedAt }),
    ).resolves.toMatchObject({ id: item.id })
  })

  it('archives an item out of the list and audits it', async () => {
    const { db, api } = await setup()
    const item = await api.wishlistItems.create({ name: 'Rug' })
    await api.wishlistItems.archive({ id: item.id })

    expect(await api.wishlistItems.list()).toEqual([])
    const [row] = await db.select().from(wishlistItem).where(eq(wishlistItem.id, item.id))
    expect(row?.archivedAt).toBeInstanceOf(Date)
    const audit = await db.select().from(auditLog).where(eq(auditLog.entityId, item.id))
    expect(audit.map((entry) => entry.action)).toContain('archive')
  })

  it('refuses a write from a viewer', async () => {
    const { db } = await setup()

    await expect(caller(db, 'household', 'viewer').wishlistItems.create({ name: 'No' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })
})

describe('wishlists router', () => {
  it('counts what is bought and gives each list a readable slug', async () => {
    const { api } = await setup()
    const kitchen = await api.wishlists.create({ name: 'Kitchen' })
    const bought = await api.wishlistItems.create({ name: 'Mixer', listId: kitchen.id })
    await api.wishlistItems.setBought({ id: bought.id, bought: true })
    await api.wishlistItems.create({ name: 'Toaster', listId: kitchen.id })
    const gone = await api.wishlistItems.create({ name: 'Gone', listId: kitchen.id })
    await api.wishlistItems.archive({ id: gone.id })
    await api.wishlistItems.create({ name: 'Not on the list' })

    const [summary] = await api.wishlists.list()
    expect(summary).toMatchObject({ total: 2, done: 1 })
    expect(summary?.slug).toMatch(/^[0-9a-z]{6}-kitchen$/)
  })

  it('renames under an optimistic lock', async () => {
    const { api } = await setup()
    const list = await api.wishlists.create({ name: 'Kitchen' })
    const renamed = await api.wishlists.update({ id: list.id, expectedUpdatedAt: list.updatedAt, name: 'New kitchen' })

    expect(renamed?.name).toBe('New kitchen')
    await expect(api.wishlists.update({ id: list.id, expectedUpdatedAt: list.updatedAt, name: 'Stale' })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('archives a list while its items stay, and it can come back', async () => {
    const { api } = await setup()
    const list = await api.wishlists.create({ name: 'Kitchen' })
    await api.wishlistItems.create({ name: 'Still here', listId: list.id })

    const archived = await api.wishlists.update({ id: list.id, archived: true })
    expect(archived?.archivedAt).toBeInstanceOf(Date)
    expect(await api.wishlistItems.list()).toHaveLength(1)

    const restored = await api.wishlists.update({ id: list.id, archived: false })
    expect(restored?.archivedAt).toBeNull()
  })

  it('keeps households apart', async () => {
    const { db, api } = await setup()
    const other = await otherHousehold(db)
    const list = await api.wishlists.create({ name: 'Ours' })

    expect(await other.wishlists.list()).toEqual([])
    await expect(other.wishlists.update({ id: list.id, name: 'Theirs' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses a write from a viewer', async () => {
    const { db } = await setup()

    await expect(caller(db, 'household', 'viewer').wishlists.create({ name: 'No' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
