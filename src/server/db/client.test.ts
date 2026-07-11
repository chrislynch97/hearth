import { describe, it, expect } from 'vitest'
import { describeDatabase } from './client'

describe('describeDatabase', () => {
  it('never leaks credentials from a postgres URL', () => {
    const label = describeDatabase('postgres://alice:s3cret@db.example.com:5432/hearth')
    expect(label).toBe('PostgreSQL (db.example.com:5432/hearth)')
    expect(label).not.toContain('alice')
    expect(label).not.toContain('s3cret')
  })

  it('handles postgresql:// scheme and query params without leaking creds', () => {
    const label = describeDatabase('postgresql://user:pw@host/db?sslmode=require')
    expect(label).toBe('PostgreSQL (host/db)')
    expect(label).not.toContain('pw')
  })

  it('falls back to a bare label for an unparseable postgres URL', () => {
    expect(describeDatabase('postgres://not a valid url')).toBe('PostgreSQL')
  })

  it('describes PGlite with its directory (no credentials to leak)', () => {
    expect(describeDatabase(undefined)).toBe('PGlite (./data/pgdata)')
    expect(describeDatabase('pglite:./data/demo')).toBe('PGlite (./data/demo)')
  })
})
