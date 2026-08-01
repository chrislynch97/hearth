import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { encryptSnapshot } from '../../backup/encrypt'
import { makeTestDb } from '../../db/testdb'
import type { DB } from '../../db/client'
import { ensureSeed } from '../../db/seed'
import { createSession, getOwnerUser, getValidSession } from '../../auth/session'
import { appRouter } from '../../trpc/router'
import { auditLog, household, member, membership, pot, user } from '../../db/schema'
import { newId } from '../../../shared/ids'

/** A second household with its own owner user (carrying credentials, to prove the
 *  export redacts them) plus an accepted owner membership. Returns the owner id. */
async function makeSecondHousehold(db: DB): Promise<string> {
  const now = new Date()
  const ownerId = newId()
  await db.insert(user).values({
    id: ownerId,
    username: 'h2owner',
    displayName: 'H2 Owner',
    passwordHash: 'secret-hash',
    mfaSecret: 'topsecret',
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(household).values({ id: 'h2', createdAt: now, updatedAt: now })
  await db.insert(membership).values({
    id: newId(),
    userId: ownerId,
    householdId: 'h2',
    role: 'owner',
    acceptedAt: now,
    createdAt: now,
    updatedAt: now,
  })
  return ownerId
}

describe('data router', () => {
  it('export → import round-trips the whole database', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner', userId: owner!.id })

    const alice = await caller.members.addPerson({ displayName: 'Alice' })
    const pot = await caller.pots.create({ name: 'Rent', ownerId: alice.id })
    await caller.spends.add({ description: 'Tesco', amount: 4200, ownerId: alice.id, potId: pot.id })

    const snapshot = await caller.data.export()
    expect(snapshot.tables['pot']).toHaveLength(1)

    // Mutate away from the snapshot, then restore it.
    await caller.pots.create({ name: 'Extra Pot', ownerId: alice.id })
    expect(await caller.pots.list()).toHaveLength(2)

    const result = await caller.data.import(snapshot)
    expect(result['pot']).toBe(1)

    const potsAfter = await caller.pots.list()
    expect(potsAfter).toHaveLength(1)
    expect(potsAfter[0]?.name).toBe('Rent')
    const spends = await caller.spends.list()
    expect(spends).toHaveLength(1)
    expect(spends[0]?.description).toBe('Tesco')
  })

  it('importing an open snapshot into a locked instance restores the first-run screen (issue #63)', async () => {
    // Instance A is open (no owner password); its export carries users with null
    // password hashes.
    const dbA = await makeTestDb()
    await ensureSeed(dbA)
    const ownerA = await getOwnerUser(dbA)
    const callerA = appRouter.createCaller({ db: dbA, householdId: 'household', role: 'owner', userId: ownerA!.id })
    const openSnapshot = await callerA.data.export()

    // Instance B is locked: setting the owner password persists auth_required.
    const dbB = await makeTestDb()
    await ensureSeed(dbB)
    const ownerB = await getOwnerUser(dbB)
    const callerB = appRouter.createCaller({ db: dbB, householdId: 'household', role: 'owner', userId: ownerB!.id })
    await callerB.auth.setPassword({ newPassword: 'correct horse battery staple' })
    expect((await callerB.auth.status()).passwordSet).toBe(true)

    // Restoring A's open snapshot must not strand B behind a password that no
    // account carries anymore — the instance reopens to the first-run screen.
    await callerB.data.import(openSnapshot)

    const status = await callerB.auth.status()
    expect(status.passwordSet).toBe(false)
    expect(status.firstRunRequired).toBe(true)
  })

  it('import rejects a snapshot with no household', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner', userId: owner!.id })
    await expect(caller.data.import({ version: 1, tables: { household: [] } })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('reset wipes data and returns to a fresh, setup-incomplete household', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner', userId: owner!.id })

    await caller.members.addPerson({ displayName: 'Alice' })
    await caller.household.completeSetup()
    await caller.categories.create({ name: 'Bills' })

    await caller.data.reset()

    expect(await caller.categories.list()).toEqual([])
    const ctx = await caller.bootstrap.context()
    expect(ctx.needsSetup).toBe(true)
    // Only the seeded joint member remains.
    expect(ctx.members.filter((m) => m.kind === 'person')).toEqual([])
    expect(ctx.members.some((m) => m.kind === 'joint')).toBe(true)
  })

  it('rescaleCurrency scales every money column and updates the household', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner', userId: owner!.id })

    const alice = await caller.members.addPerson({ displayName: 'Alice' })
    const pot = await caller.pots.create({ name: 'Rent', ownerId: alice.id })
    await caller.spends.add({ description: 'Tesco', amount: 1250, ownerId: alice.id, potId: pot.id })

    await caller.data.rescaleCurrency({ decimalPlaces: 3 }) // 2dp → 3dp, ×10

    const spends = await caller.spends.list()
    expect(spends[0]?.amount).toBe(12500)
    const ctx = await caller.bootstrap.context()
    expect(ctx.household?.currencyDecimalPlaces).toBe(3)
  })

  it('rescaleCurrency requires the admin role (a member cannot rewrite every amount)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)
    const member = appRouter.createCaller({ db, householdId: 'household', role: 'member', userId: owner!.id })
    await expect(member.data.rescaleCurrency({ decimalPlaces: 3 })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('restricts instance-wide ops (export/import/reset/stats) to the instance owner', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    // A user who owns a DIFFERENT household, not the primary one.
    const now = new Date()
    const outsiderId = newId()
    await db.insert(user).values({ id: outsiderId, username: 'out', displayName: 'Out', createdAt: now, updatedAt: now })
    await db.insert(household).values({ id: 'h2', createdAt: now, updatedAt: now })
    await db.insert(membership).values({
      id: newId(),
      userId: outsiderId,
      householdId: 'h2',
      role: 'owner',
      acceptedAt: now,
      createdAt: now,
      updatedAt: now,
    })

    const outsider = appRouter.createCaller({ db, householdId: 'h2', role: 'owner', userId: outsiderId })
    await expect(outsider.data.export()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(outsider.data.reset()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(outsider.data.stats()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      outsider.data.import({ version: 1, tables: { household: [{ id: 'x' }] } }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('exportHousehold returns only the caller household, with credentials redacted (issue #110)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    // The primary household has its own data that must not leak into h2's export.
    const owner = await getOwnerUser(db)
    const primary = appRouter.createCaller({ db, householdId: 'household', role: 'owner', userId: owner!.id })
    await primary.members.addPerson({ displayName: 'Primary Person' })

    const h2owner = await makeSecondHousehold(db)
    const h2 = appRouter.createCaller({ db, householdId: 'h2', role: 'owner', userId: h2owner })
    const bob = await h2.members.addPerson({ displayName: 'Bob' })
    const p = await h2.pots.create({ name: 'H2 Rent', ownerId: bob.id })
    await h2.spends.add({ description: 'H2 Tesco', amount: 999, ownerId: bob.id, potId: p.id })

    const snap = await h2.data.exportHousehold()

    // Scoped to h2: its one household row, its pot and spend, its member — never
    // the primary household's rows.
    expect(snap.tables['household']).toHaveLength(1)
    expect((snap.tables['household']?.[0] as { id: string }).id).toBe('h2')
    expect(snap.tables['pot']).toHaveLength(1)
    expect((snap.tables['pot']?.[0] as { name: string }).name).toBe('H2 Rent')
    expect(snap.tables['spendTransaction']).toHaveLength(1)
    const members = snap.tables['member'] as Array<{ displayName: string }>
    expect(members.some((m) => m.displayName === 'Bob')).toBe(true)
    expect(members.some((m) => m.displayName === 'Primary Person')).toBe(false)

    // The exported user is h2's owner, stripped of credentials.
    const users = snap.tables['user'] as Array<{ id: string; passwordHash: unknown; mfaSecret: unknown }>
    expect(users).toHaveLength(1)
    expect(users[0]?.id).toBe(h2owner)
    expect(users[0]?.passwordHash).toBeNull()
    expect(users[0]?.mfaSecret).toBeNull()
  })

  it('exportHousehold and eraseHousehold require the household owner role', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const h2owner = await makeSecondHousehold(db)
    const admin = appRouter.createCaller({ db, householdId: 'h2', role: 'admin', userId: h2owner })
    await expect(admin.data.exportHousehold()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(admin.data.eraseHousehold()).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('eraseHousehold deletes the household and cascades, but refuses the primary (issue #110)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)

    const h2owner = await makeSecondHousehold(db)
    const h2 = appRouter.createCaller({ db, householdId: 'h2', role: 'owner', userId: h2owner })
    const bob = await h2.members.addPerson({ displayName: 'Bob' })
    await h2.pots.create({ name: 'H2 Rent', ownerId: bob.id })

    // The primary household can't be erased through the tenant endpoint.
    const primary = appRouter.createCaller({ db, householdId: 'household', role: 'owner', userId: owner!.id })
    await expect(primary.data.eraseHousehold()).rejects.toMatchObject({ code: 'FORBIDDEN' })

    await expect(h2.data.eraseHousehold()).resolves.toEqual({ ok: true, nextHouseholdId: null })

    // h2 and everything under it is gone; the primary survives.
    expect((await db.select().from(household)).map((h) => h.id)).toEqual(['household'])
    expect(await db.select().from(pot).where(eq(pot.householdId, 'h2'))).toHaveLength(0)
    expect(await db.select().from(member).where(eq(member.householdId, 'h2'))).toHaveLength(0)
    expect(await db.select().from(membership).where(eq(membership.householdId, 'h2'))).toHaveLength(0)

    // The erasure is recorded on the primary household's trail, so it survives the
    // cascade that wiped h2's own audit log.
    const events = await db.select().from(auditLog).where(eq(auditLog.action, 'household_erased'))
    expect(events).toHaveLength(1)
    expect(events[0]?.householdId).toBe('household')
    expect(events[0]?.entityId).toBe('h2')
  })

  // Sessions FK-cascade with the household, so without the repoint the owner is
  // signed out of households they still belong to (#228).
  it('eraseHousehold keeps the owner signed in when they belong elsewhere (issue #228)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)

    const h2owner = await makeSecondHousehold(db)
    // The same person also belongs to the primary household, as a member.
    const now = new Date()
    await db.insert(membership).values({
      id: newId(),
      userId: h2owner,
      householdId: 'household',
      role: 'member',
      acceptedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    const token = await createSession(db, h2owner, 'h2')

    const h2 = appRouter.createCaller({ db, householdId: 'h2', role: 'owner', userId: h2owner })
    await expect(h2.data.eraseHousehold()).resolves.toEqual({ ok: true, nextHouseholdId: 'household' })

    // The session survived the cascade, pointing at the household they have left.
    const live = await getValidSession(db, token)
    expect(live?.activeHouseholdId).toBe('household')
  })

  it('eraseHousehold ends the session when it was the owner’s only household (issue #228)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const h2owner = await makeSecondHousehold(db)
    const token = await createSession(db, h2owner, 'h2')

    const h2 = appRouter.createCaller({ db, householdId: 'h2', role: 'owner', userId: h2owner })
    await expect(h2.data.eraseHousehold()).resolves.toEqual({ ok: true, nextHouseholdId: null })

    // Nowhere to move it to, so it went with the household — the client lands on
    // the sign-in screen rather than a dead active household.
    expect(await getValidSession(db, token)).toBeNull()
  })

  it('backupRetention reports the snapshot count to a household owner, not to an admin', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const h2owner = await makeSecondHousehold(db)

    const owner = appRouter.createCaller({ db, householdId: 'h2', role: 'owner', userId: h2owner })
    expect((await owner.data.backupRetention()).keep).toBeGreaterThan(0)

    const admin = appRouter.createCaller({ db, householdId: 'h2', role: 'admin', userId: h2owner })
    await expect(admin.data.backupRetention()).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('stats reports per-table counts', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner', userId: owner!.id })
    await caller.members.addPerson({ displayName: 'Alice' })

    const stats = await caller.data.stats()
    expect(stats.counts['household']).toBe(1)
    expect(stats.counts['member']).toBe(2) // joint + Alice
  })
})

// Restore straight from the off-site store (#114) — the path a hosted instance
// depends on, where there is no local filesystem to fetch a snapshot from.
describe('data router — off-site backups', () => {
  const PASS = 'test-passphrase'
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hearth-router-offsite-'))
    process.env.HEARTH_BACKUP_OFFSITE = 'directory'
    process.env.HEARTH_BACKUP_DIR = dir
    process.env.HEARTH_BACKUP_PASSPHRASE = PASS
  })

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('HEARTH_BACKUP_')) delete process.env[k]
    }
    rmSync(dir, { recursive: true, force: true })
  })

  /** Put a snapshot in the off-site store the way `runBackup` would. */
  const store = (name: string, snapshot: unknown): void =>
    writeFileSync(join(dir, name), encryptSnapshot(JSON.stringify(snapshot), PASS))

  it('lists the stored backups and reports the target as restorable', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner', userId: owner!.id })
    store('hearth-backup-2026-01-01.json.enc', await caller.data.export())

    const listed = await caller.data.listBackups()

    expect(listed).toMatchObject({ kind: 'directory', restorable: true, primary: 'local', error: null })
    expect(listed.entries.map((e) => e.name)).toEqual(['hearth-backup-2026-01-01.json.enc'])
  })

  it('reports a misconfiguration instead of blanking the panel', async () => {
    delete process.env.HEARTH_BACKUP_PASSPHRASE
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner', userId: owner!.id })

    const listed = await caller.data.listBackups()

    expect(listed.error).toMatch(/HEARTH_BACKUP_PASSPHRASE/)
    expect(listed.entries).toEqual([])
  })

  it('restores the whole database from an off-site snapshot', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner', userId: owner!.id })

    const alice = await caller.members.addPerson({ displayName: 'Alice' })
    await caller.pots.create({ name: 'Rent', ownerId: alice.id })
    store('hearth-backup-2026-01-01.json.enc', await caller.data.export())

    await caller.pots.create({ name: 'Extra Pot', ownerId: alice.id })
    expect(await caller.pots.list()).toHaveLength(2)

    await caller.data.restoreBackup({ name: 'hearth-backup-2026-01-01.json.enc' })

    const pots = await caller.pots.list()
    expect(pots.map((p) => p.name)).toEqual(['Rent'])
    // Recorded in the restored data, where it's the only trace of what happened.
    const events = await db.select().from(auditLog).where(eq(auditLog.action, 'restored_from_offsite'))
    expect(events).toHaveLength(1)
  })

  it('refuses a name that is not a backup object we could have written', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner', userId: owner!.id })

    await expect(caller.data.restoreBackup({ name: '../../../etc/passwd' })).rejects.toThrow(/refusing to use/)
  })

  it('refuses a snapshot from an unsupported export version', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const owner = await getOwnerUser(db)
    const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner', userId: owner!.id })
    store('hearth-backup-2026-01-01.json.enc', { version: 99, tables: { household: [{ id: 'household' }] } })

    await expect(caller.data.restoreBackup({ name: 'hearth-backup-2026-01-01.json.enc' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('restricts listing and restoring to the instance owner', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const outsiderId = await makeSecondHousehold(db)
    const outsider = appRouter.createCaller({ db, householdId: 'h2', role: 'owner', userId: outsiderId })

    await expect(outsider.data.listBackups()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(outsider.data.restoreBackup({ name: 'hearth-backup-x.json.enc' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })
})
