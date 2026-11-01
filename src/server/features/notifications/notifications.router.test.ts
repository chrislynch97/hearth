import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../../db/testdb'
import { ensureSeed } from '../../db/seed'
import { appRouter } from '../../trpc/router'
import { pushSubscription, user } from '../../db/schema'
import type { DB } from '../../db/client'

const endpoint = 'https://fcm.googleapis.com/fcm/send/phone'
const keys = { p256dh: 'p256dh', auth: 'auth' }

const addUser = (db: DB, id: string) => {
  const now = new Date()
  return db.insert(user).values({ id, username: id, displayName: id, createdAt: now, updatedAt: now })
}

async function setup() {
  const db = await makeTestDb()
  await ensureSeed(db)
  await addUser(db, 'ava')
  await addUser(db, 'ben')
  const as = (userId: string, role: 'owner' | 'viewer' = 'owner') =>
    appRouter.createCaller({ db, householdId: 'household', role, userId })
  return { db, as }
}

describe('notifications router', () => {
  beforeEach(() => {
    vi.stubEnv('HEARTH_VAPID_PUBLIC_KEY', Buffer.alloc(65, 4).toString('base64url'))
    vi.stubEnv('HEARTH_VAPID_PRIVATE_KEY', Buffer.alloc(32, 7).toString('base64url'))
    vi.stubEnv('HEARTH_VAPID_SUBJECT', 'mailto:hearth@example.com')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('reports whether push is available', async () => {
    const { as } = await setup()
    expect((await as('ava').notifications.config()).enabled).toBe(true)

    vi.unstubAllEnvs()
    expect(await as('ava').notifications.config()).toEqual({ enabled: false, publicKey: null })
  })

  it('lets a viewer opt a device in and out', async () => {
    const { db, as } = await setup()
    await as('ava', 'viewer').notifications.subscribe({ endpoint, keys })
    expect(await db.select().from(pushSubscription)).toHaveLength(1)

    await as('ava', 'viewer').notifications.unsubscribe({ endpoint })
    expect(await db.select().from(pushSubscription)).toHaveLength(0)
  })

  it('hands a device over when someone else signs in on it', async () => {
    const { db, as } = await setup()
    await as('ava').notifications.subscribe({ endpoint, keys })
    await as('ben').notifications.subscribe({ endpoint, keys })

    const rows = await db.select().from(pushSubscription).where(eq(pushSubscription.endpoint, endpoint))
    expect(rows.map((row) => row.userId)).toEqual(['ben'])
  })

  it("won't remove someone else's device", async () => {
    const { db, as } = await setup()
    await as('ava').notifications.subscribe({ endpoint, keys })
    await as('ben').notifications.unsubscribe({ endpoint })

    expect(await db.select().from(pushSubscription)).toHaveLength(1)
  })

  it('refuses an endpoint that is not a push service', async () => {
    const { as } = await setup()
    await expect(
      as('ava').notifications.subscribe({ endpoint: 'https://192.168.0.1/admin', keys }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('refuses to subscribe when push is off', async () => {
    const { as } = await setup()
    vi.unstubAllEnvs()
    await expect(as('ava').notifications.subscribe({ endpoint, keys })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    })
  })

  it('needs a signed-in user', async () => {
    const { db } = await setup()
    const anonymous = appRouter.createCaller({ db, householdId: 'household', role: 'owner' })
    await expect(anonymous.notifications.subscribe({ endpoint, keys })).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('sends nothing, and reports it, with no device opted in', async () => {
    const { as } = await setup()
    expect(await as('ava').notifications.sendTest()).toEqual({ sent: 0 })
  })
})
