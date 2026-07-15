import { describe, it, expect } from 'vitest'
import { describeDatabase, isServerPgUrl, pgliteDir } from './target'

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

describe('isServerPgUrl', () => {
  it('recognises only a real Postgres server URL', () => {
    expect(isServerPgUrl('postgres://host/db')).toBe(true)
    expect(isServerPgUrl('postgresql://host/db')).toBe(true)
    expect(isServerPgUrl('pglite:./data/pgdata')).toBe(false)
    expect(isServerPgUrl(undefined)).toBe(false)
  })
})

describe('pgliteDir', () => {
  it('resolves every accepted spelling to a directory', () => {
    expect(pgliteDir(undefined)).toBe('./data/pgdata')
    expect(pgliteDir('pglite:')).toBe('./data/pgdata') // no path given → the default
    expect(pgliteDir('pglite:./data/demo')).toBe('./data/demo')
    expect(pgliteDir('pglite://./data/demo')).toBe('./data/demo')
    expect(pgliteDir('/var/lib/hearth/pgdata')).toBe('/var/lib/hearth/pgdata') // bare path
  })
})
