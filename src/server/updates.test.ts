import { afterEach, describe, it, expect } from 'vitest'
import { deployMode, updateCommands } from './updates'

const { DATABASE_URL, HEARTH_DEPLOY } = process.env

afterEach(() => {
  // Restore the env these read, so tests don't leak into each other.
  if (DATABASE_URL === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = DATABASE_URL
  if (HEARTH_DEPLOY === undefined) delete process.env.HEARTH_DEPLOY
  else process.env.HEARTH_DEPLOY = HEARTH_DEPLOY
})

describe('deployMode', () => {
  it('is image only when HEARTH_DEPLOY=image, else source', () => {
    process.env.HEARTH_DEPLOY = 'image'
    expect(deployMode()).toBe('image')
    process.env.HEARTH_DEPLOY = 'source'
    expect(deployMode()).toBe('source')
    delete process.env.HEARTH_DEPLOY
    expect(deployMode()).toBe('source')
  })
})

describe('updateCommands', () => {
  it('source + PGlite: git pull then rebuild with the default compose file', () => {
    delete process.env.HEARTH_DEPLOY
    delete process.env.DATABASE_URL
    expect(updateCommands()).toBe('git pull\ndocker compose up -d --build')
  })

  it('source + Postgres: uses the postgres compose file', () => {
    delete process.env.HEARTH_DEPLOY
    process.env.DATABASE_URL = 'postgres://u:p@db:5432/hearth'
    expect(updateCommands()).toBe('git pull\ndocker compose -f docker-compose.postgres.yml up -d --build')
  })

  it('image + PGlite: pulls the ghcr image instead of rebuilding', () => {
    process.env.HEARTH_DEPLOY = 'image'
    delete process.env.DATABASE_URL
    expect(updateCommands()).toBe(
      'docker compose -f docker-compose.ghcr.yml pull\ndocker compose -f docker-compose.ghcr.yml up -d',
    )
  })

  it('image + Postgres: pulls the postgres ghcr image', () => {
    process.env.HEARTH_DEPLOY = 'image'
    process.env.DATABASE_URL = 'postgres://u:p@db:5432/hearth'
    expect(updateCommands()).toBe(
      'docker compose -f docker-compose.postgres.ghcr.yml pull\ndocker compose -f docker-compose.postgres.ghcr.yml up -d',
    )
  })
})
