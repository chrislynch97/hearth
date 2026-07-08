import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createClient } from '@libsql/client'
import { readFileSync } from 'node:fs'
import { makeTestDb } from './testdb'
import { ensureSeed } from './seed'
import { household, member, membership, user } from './schema'

describe('ensureSeed', () => {
  it('creates the singleton household and exactly one joint member', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)

    const households = await db.select().from(household)
    expect(households).toHaveLength(1)
    expect(households[0]!.currencyCode).toBe('GBP')

    const joints = await db.select().from(member).where(eq(member.kind, 'joint'))
    expect(joints).toHaveLength(1)
  })

  it('is idempotent — running twice does not duplicate rows', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    await ensureSeed(db)

    expect(await db.select().from(household)).toHaveLength(1)
    expect(await db.select().from(member).where(eq(member.kind, 'joint'))).toHaveLength(1)
    expect(await db.select().from(user)).toHaveLength(1)
    expect(await db.select().from(membership)).toHaveLength(1)
  })

  it('provisions an owner user + membership for the household', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)

    const [owner] = await db.select().from(user)
    expect(owner?.username).toBe('owner')

    const [grant] = await db.select().from(membership)
    expect(grant?.role).toBe('owner')
    expect(grant?.userId).toBe(owner!.id)
    expect(grant?.householdId).toBe('household')
    expect(grant?.acceptedAt).not.toBeNull()
  })

  it('creates the owner without a password (open instance)', async () => {
    const db = await makeTestDb()
    await ensureSeed(db)
    const [owner] = await db.select().from(user)
    expect(owner?.passwordHash).toBeNull()
  })
})

// The 0017 migration carries a legacy shared household password onto an owner
// user before the household auth columns are dropped. That copy can't be
// exercised through the ORM (the columns no longer exist in the schema), so run
// the migration's INSERT statements against a hand-built pre-migration DB.
describe('migration 0017 — legacy password → owner user', () => {
  const copySql = readFileSync('drizzle/0017_stiff_next_avengers.sql', 'utf8')
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => /INSERT INTO/i.test(s)) // the two copy statements, not the DROPs

  async function preMigrationDb() {
    const client = createClient({ url: ':memory:' })
    await client.execute(
      `CREATE TABLE household (id text primary key, display_name text, password_hash text, mfa_secret text, mfa_enabled_at integer, mfa_recovery_codes text)`,
    )
    await client.execute(
      `CREATE TABLE user (id text primary key, username text unique, email text, display_name text, password_hash text, mfa_secret text, mfa_enabled_at integer, mfa_recovery_codes text, created_at integer, updated_at integer)`,
    )
    await client.execute(
      `CREATE TABLE membership (id text primary key, user_id text, household_id text, role text, invited_at integer, accepted_at integer, created_at integer, updated_at integer)`,
    )
    return client
  }

  it('copies the household password onto a new owner user + membership', async () => {
    const client = await preMigrationDb()
    await client.execute(
      `INSERT INTO household (id, display_name, password_hash) VALUES ('household', 'Home', 'HASH123')`,
    )
    for (const stmt of copySql) await client.execute(stmt)

    const users = await client.execute(`SELECT username, password_hash FROM user`)
    expect(users.rows).toHaveLength(1)
    expect(users.rows[0]!.username).toBe('owner')
    expect(users.rows[0]!.password_hash).toBe('HASH123')

    const grants = await client.execute(`SELECT role FROM membership WHERE household_id = 'household'`)
    expect(grants.rows).toHaveLength(1)
    expect(grants.rows[0]!.role).toBe('owner')
  })

  it('is a no-op when a membership already exists (already provisioned)', async () => {
    const client = await preMigrationDb()
    await client.execute(`INSERT INTO household (id, display_name, password_hash) VALUES ('household', 'Home', 'HASH')`)
    await client.execute(`INSERT INTO user (id, username, display_name) VALUES ('u1', 'owner', 'Owner')`)
    await client.execute(
      `INSERT INTO membership (id, user_id, household_id, role) VALUES ('m1', 'u1', 'household', 'owner')`,
    )
    for (const stmt of copySql) await client.execute(stmt)

    expect((await client.execute(`SELECT id FROM user`)).rows).toHaveLength(1)
    expect((await client.execute(`SELECT id FROM membership`)).rows).toHaveLength(1)
  })

  it('is a no-op on a fresh install (no household row yet)', async () => {
    const client = await preMigrationDb()
    for (const stmt of copySql) await client.execute(stmt)
    expect((await client.execute(`SELECT id FROM user`)).rows).toHaveLength(0)
    expect((await client.execute(`SELECT id FROM membership`)).rows).toHaveLength(0)
  })
})
