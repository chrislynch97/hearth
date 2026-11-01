import { describe, it, expect, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { pushSubscription, user } from '../db/schema'
import type { DB } from '../db/client'
import type { PushConfig } from './config'
import { isPushEndpoint, sendPushToUser, type PushTransport } from './push'

const config: PushConfig = { publicKey: 'public', privateKey: 'private', subject: 'mailto:hearth@example.com' }
const message = { title: 'Hearth', body: 'Hello', url: '/upcoming' }

const addUser = (db: DB, id: string) => {
  const now = new Date()
  return db.insert(user).values({ id, username: id, displayName: id, createdAt: now, updatedAt: now })
}

async function setup() {
  const db = await makeTestDb()
  await ensureSeed(db)
  await addUser(db, 'ava')
  return db
}

const addDevice = (db: DB, id: string, userId = 'ava') => {
  const now = new Date()
  return db.insert(pushSubscription).values({
    id,
    userId,
    endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
    p256dh: 'p256dh',
    auth: 'auth',
    createdAt: now,
    updatedAt: now,
  })
}

describe('isPushEndpoint', () => {
  it('accepts the real push services', () => {
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true)
    expect(isPushEndpoint('https://web.push.apple.com/abc')).toBe(true)
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true)
    expect(isPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=abc')).toBe(true)
  })

  it('refuses anything else the server could be aimed at', () => {
    expect(isPushEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false)
    expect(isPushEndpoint('https://192.168.0.1/admin')).toBe(false)
    expect(isPushEndpoint('https://fcm.googleapis.com.evil.example/abc')).toBe(false)
    expect(isPushEndpoint('https://notpush.apple.com/abc')).toBe(false)
    expect(isPushEndpoint('not a url')).toBe(false)
  })
})

describe('sendPushToUser', () => {
  it("sends to that user's devices only", async () => {
    const db = await setup()
    await addUser(db, 'ben')
    await addDevice(db, 'phone')
    await addDevice(db, 'laptop')
    await addDevice(db, 'other', 'ben')
    const transport = vi.fn<PushTransport>().mockResolvedValue(undefined)

    expect(await sendPushToUser(db, 'ava', message, { config, transport })).toBe(2)
    expect(transport).toHaveBeenCalledTimes(2)
    expect(JSON.parse(transport.mock.calls[0]![1])).toEqual(message)
  })

  it('removes a device the push service says is gone, and keeps one that merely failed', async () => {
    const db = await setup()
    await addDevice(db, 'gone')
    await addDevice(db, 'flaky')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const transport: PushTransport = (target) =>
      Promise.reject(
        target.endpoint.endsWith('gone') ? Object.assign(new Error('Gone'), { statusCode: 410 }) : new Error('Timed out'),
      )

    expect(await sendPushToUser(db, 'ava', message, { config, transport })).toBe(0)
    const left = await db.select().from(pushSubscription).where(eq(pushSubscription.userId, 'ava'))
    expect(left.map((device) => device.id)).toEqual(['flaky'])
    warn.mockRestore()
  })

  it('does nothing when push is off', async () => {
    const db = await setup()
    await addDevice(db, 'phone')
    const transport = vi.fn<PushTransport>()

    expect(await sendPushToUser(db, 'ava', message, { config: null, transport })).toBe(0)
    expect(transport).not.toHaveBeenCalled()
  })
})
