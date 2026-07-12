import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { appRouter } from '../trpc/router'
import { getOwnerUser } from '../auth/session'
import { household } from '../db/schema'
import type { DB } from '../db/client'

/** A caller acting as the seeded owner (so audit rows capture a real actor). */
async function ownerCaller(db: DB, householdId = 'household') {
  const owner = (await getOwnerUser(db))!
  const caller = appRouter.createCaller({ db, householdId, userId: owner.id, role: 'owner' })
  return { caller, owner }
}

describe('audit log (issue #35)', () => {
  it('records a create with a full after-snapshot and the actor', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { caller, owner } = await ownerCaller(db)

    const cat = await caller.categories.create({ name: 'Essentials' })

    const entries = await caller.audit.list({ entityType: 'category', entityId: cat.id })
    expect(entries.length).toBe(1)
    const [entry] = entries
    expect(entry).toMatchObject({
      entityType: 'category',
      entityId: cat.id,
      action: 'create',
      actorUserId: owner.id,
      actorLabel: owner.displayName,
    })
    const changes = entry!.changes as { kind: string; after: Record<string, unknown> }
    expect(changes.kind).toBe('create')
    expect(changes.after.name).toBe('Essentials')
    // householdId is redundant with the audit row and stripped from snapshots.
    expect(changes.after).not.toHaveProperty('householdId')
  })

  it('records an update as changed fields only (before/after), excluding updatedAt', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { caller } = await ownerCaller(db)

    const cat = await caller.categories.create({ name: 'Old' })
    await caller.categories.update({ id: cat.id, name: 'New' })

    const [entry] = await caller.audit.list({ entityType: 'category', entityId: cat.id, limit: 1 })
    expect(entry!.action).toBe('update')
    const changes = entry!.changes as { kind: string; fields: Record<string, { before: unknown; after: unknown }> }
    expect(changes.kind).toBe('update')
    expect(changes.fields.name).toEqual({ before: 'Old', after: 'New' })
    // Only the field that actually changed is present — no updatedAt noise, no
    // untouched columns like sortOrder.
    expect(Object.keys(changes.fields)).toEqual(['name'])
  })

  it('records an archive with a before-snapshot of the archived row', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { caller } = await ownerCaller(db)

    const cat = await caller.categories.create({ name: 'Gone' })
    await caller.categories.archive({ id: cat.id })

    const [entry] = await caller.audit.list({ entityType: 'category', entityId: cat.id, limit: 1 })
    expect(entry!.action).toBe('archive')
    const changes = entry!.changes as { kind: string; before: Record<string, unknown> }
    expect(changes.kind).toBe('archive')
    expect(changes.before.name).toBe('Gone')
  })

  it('records a delete with a before-snapshot (spends.remove)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { caller } = await ownerCaller(db)

    const person = await caller.members.addPerson({ displayName: 'Ada' })
    const spend = await caller.spends.add({ description: 'Coffee', amount: 350, ownerId: person.id })
    await caller.spends.remove({ id: spend.id })

    const [entry] = await caller.audit.list({ entityType: 'spend', entityId: spend.id, limit: 1 })
    expect(entry!.action).toBe('delete')
    const changes = entry!.changes as { kind: string; before: Record<string, unknown> }
    expect(changes.kind).toBe('delete')
    expect(changes.before.description).toBe('Coffee')
    expect(changes.before.amount).toBe(350)
  })

  it('leaves nothing staged when a mutation fails (stale write → CONFLICT)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { caller } = await ownerCaller(db)

    const cat = await caller.categories.create({ name: 'V1' })
    // A stale expectedUpdatedAt loses the compare-and-swap and raises CONFLICT.
    await expect(
      caller.categories.update({ id: cat.id, name: 'V2', expectedUpdatedAt: new Date(0) }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })

    // Only the create was recorded — the failed update wrote no audit row.
    const entries = await caller.audit.list({ entityType: 'category', entityId: cat.id })
    expect(entries.map((e) => e.action)).toEqual(['create'])
  })

  it('scopes the trail per household', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const now = new Date()
    await db.insert(household).values({ id: 'h2', createdAt: now, updatedAt: now })

    const { caller: h1 } = await ownerCaller(db, 'household')
    const h2 = appRouter.createCaller({ db, householdId: 'h2', role: 'owner' })

    await h1.categories.create({ name: 'H1 secret' })

    // h2's admin sees none of h1's audit trail.
    expect(await h2.audit.list({})).toEqual([])
    expect((await h1.audit.list({})).length).toBeGreaterThan(0)
  })

  it('gates reads behind the admin role', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const member = appRouter.createCaller({ db, householdId: 'household', role: 'member' })
    const viewer = appRouter.createCaller({ db, householdId: 'household', role: 'viewer' })

    await expect(member.audit.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(viewer.audit.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('does not misreport unchanged nested data (payslip note-only edit)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { caller } = await ownerCaller(db)

    const person = await caller.members.addPerson({ displayName: 'Bea' })
    const comp = await caller.payslipComponents.create({ ownerId: person.id, name: 'Basic', kind: 'earning' })
    const slip = await caller.payslips.create({
      ownerId: person.id,
      payDate: '2026-01-31',
      lines: [{ componentId: comp.id, amount: 200000 }],
    })

    // Change only the note; leave `lines` untouched (omitted from the input).
    await caller.payslips.update({ id: slip.id, note: 'checked' })

    const [entry] = await caller.audit.list({ entityType: 'payslip', entityId: slip.id, limit: 1 })
    expect(entry!.action).toBe('update')
    const changes = entry!.changes as { fields: Record<string, unknown> }
    // Only note changed — the identical lines array must not appear in the diff.
    expect(Object.keys(changes.fields)).toEqual(['note'])
  })

  it('returns entries newest-first', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const { caller } = await ownerCaller(db)

    const a = await caller.categories.create({ name: 'A' })
    const b = await caller.categories.create({ name: 'B' })

    const entries = await caller.audit.list({ entityType: 'category' })
    // Newest (B) first.
    expect(entries[0]?.entityId).toBe(b.id)
    expect(entries[1]?.entityId).toBe(a.id)
  })
})
