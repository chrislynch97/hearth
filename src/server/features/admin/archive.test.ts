import { describe, it, expect } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { newId } from '../../../shared/ids'
import type { AuditLog } from '../../db/schema'
import { auditArchiveDir, writeAuditArchive } from './archive'

/** A plausible audit row to archive. */
const makeRow = (overrides: Partial<AuditLog> = {}): AuditLog => ({
  id: newId(),
  householdId: 'household',
  actorUserId: null,
  actorLabel: 'Ada',
  entityType: 'category',
  entityId: newId(),
  action: 'create',
  changes: JSON.stringify({ kind: 'create', after: { name: 'Essentials' } }),
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
})

describe('auditArchiveDir', () => {
  it('sits next to a pglite:// data dir', () => {
    const prev = process.env.DATABASE_URL
    process.env.DATABASE_URL = 'pglite:///var/lib/hearth/pgdata'
    try {
      // dirname('/var/lib/hearth/pgdata') → '/var/lib/hearth'
      expect(auditArchiveDir().replace(/\\/g, '/')).toBe('/var/lib/hearth/audit-archive')
    } finally {
      if (prev === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = prev
    }
  })

  it('falls back to ./data/audit-archive when DATABASE_URL is unset', () => {
    const prev = process.env.DATABASE_URL
    delete process.env.DATABASE_URL
    try {
      expect(auditArchiveDir().replace(/\\/g, '/')).toBe('data/audit-archive')
    } finally {
      if (prev !== undefined) process.env.DATABASE_URL = prev
    }
  })
})

describe('writeAuditArchive (issue #43)', () => {
  it('writes a JSON archive carrying the rows and window metadata', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hearth-audit-'))
    try {
      const cutoff = new Date('2026-06-01T00:00:00.000Z')
      const rows = [makeRow(), makeRow({ action: 'update' })]
      const file = writeAuditArchive(dir, 'household', cutoff, rows)

      const archive = JSON.parse(readFileSync(file, 'utf8'))
      expect(archive.householdId).toBe('household')
      expect(archive.cutoff).toBe('2026-06-01T00:00:00.000Z')
      expect(archive.count).toBe(2)
      expect(archive.entries.map((e: AuditLog) => e.id)).toEqual(rows.map((r) => r.id))
      expect(typeof archive.prunedAt).toBe('string')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('uses a unique filename per call so concurrent prunes never collide', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hearth-audit-'))
    try {
      writeAuditArchive(dir, 'h1', new Date(), [makeRow()])
      writeAuditArchive(dir, 'h2', new Date(), [makeRow()])
      expect(readdirSync(dir).filter((f) => f.endsWith('.json')).length).toBe(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('writes the archive owner-only (0600) on POSIX', () => {
    if (process.platform === 'win32') return // mode bits are a no-op on Windows
    const dir = mkdtempSync(join(tmpdir(), 'hearth-audit-'))
    try {
      const file = writeAuditArchive(dir, 'household', new Date(), [makeRow()])
      expect(statSync(file).mode & 0o777).toBe(0o600)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
