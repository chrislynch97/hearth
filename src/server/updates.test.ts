import { afterEach, describe, it, expect, vi } from 'vitest'
import { checkForUpdates, deployMode, updateCommands } from './updates'

const {
  DATABASE_URL,
  HEARTH_DEPLOY,
  HEARTH_COMPOSE_FILE,
  HEARTH_UPDATE_TOKEN,
  HEARTH_FEEDBACK_TOKEN,
} = process.env

afterEach(() => {
  // Restore the env these read, so tests don't leak into each other.
  if (DATABASE_URL === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = DATABASE_URL
  if (HEARTH_DEPLOY === undefined) delete process.env.HEARTH_DEPLOY
  else process.env.HEARTH_DEPLOY = HEARTH_DEPLOY
  if (HEARTH_COMPOSE_FILE === undefined) delete process.env.HEARTH_COMPOSE_FILE
  else process.env.HEARTH_COMPOSE_FILE = HEARTH_COMPOSE_FILE
  if (HEARTH_UPDATE_TOKEN === undefined) delete process.env.HEARTH_UPDATE_TOKEN
  else process.env.HEARTH_UPDATE_TOKEN = HEARTH_UPDATE_TOKEN
  if (HEARTH_FEEDBACK_TOKEN === undefined) delete process.env.HEARTH_FEEDBACK_TOKEN
  else process.env.HEARTH_FEEDBACK_TOKEN = HEARTH_FEEDBACK_TOKEN
  vi.restoreAllMocks()
})

// The Authorization header fetch was called with, or undefined.
const authHeaderFrom = (mock: ReturnType<typeof vi.spyOn>): string | undefined => {
  const init = mock.mock.calls[0]?.[1] as RequestInit | undefined
  return (init?.headers as Record<string, string> | undefined)?.Authorization
}

const stubFetch = (release: unknown, status = 200) =>
  vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => release,
  } as Response)

describe('checkForUpdates auth', () => {
  it('sends no Authorization header when no token is configured', async () => {
    delete process.env.HEARTH_UPDATE_TOKEN
    delete process.env.HEARTH_FEEDBACK_TOKEN
    const fetchMock = stubFetch({ tag_name: 'v9.9.9' })
    await checkForUpdates()
    expect(authHeaderFrom(fetchMock)).toBeUndefined()
  })

  it('sends the update token as a bearer when set', async () => {
    process.env.HEARTH_UPDATE_TOKEN = 'ghp_update'
    const fetchMock = stubFetch({ tag_name: 'v9.9.9' })
    await checkForUpdates()
    expect(authHeaderFrom(fetchMock)).toBe('Bearer ghp_update')
  })

  it('falls back to the feedback token when the update token is unset', async () => {
    delete process.env.HEARTH_UPDATE_TOKEN
    process.env.HEARTH_FEEDBACK_TOKEN = 'ghp_feedback'
    const fetchMock = stubFetch({ tag_name: 'v9.9.9' })
    await checkForUpdates()
    expect(authHeaderFrom(fetchMock)).toBe('Bearer ghp_feedback')
  })

  it('prefers the update token over the feedback token', async () => {
    process.env.HEARTH_UPDATE_TOKEN = 'ghp_update'
    process.env.HEARTH_FEEDBACK_TOKEN = 'ghp_feedback'
    const fetchMock = stubFetch({ tag_name: 'v9.9.9' })
    await checkForUpdates()
    expect(authHeaderFrom(fetchMock)).toBe('Bearer ghp_update')
  })

  it('reports a newer release once authenticated', async () => {
    process.env.HEARTH_UPDATE_TOKEN = 'ghp_update'
    stubFetch({ tag_name: 'v999.0.0', html_url: 'https://example/r' })
    const status = await checkForUpdates()
    expect(status.checked).toBe(true)
    expect(status.latest).toBe('v999.0.0')
    expect(status.updateAvailable).toBe(true)
  })
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

  it('HEARTH_COMPOSE_FILE names the file instead of the inferred default', () => {
    process.env.HEARTH_DEPLOY = 'image'
    delete process.env.DATABASE_URL
    process.env.HEARTH_COMPOSE_FILE = 'docker-compose.public.yml'
    expect(updateCommands()).toBe(
      'docker compose -f docker-compose.public.yml pull\ndocker compose -f docker-compose.public.yml up -d',
    )
  })

  it('HEARTH_COMPOSE_FILE applies to a source deploy too', () => {
    delete process.env.HEARTH_DEPLOY
    delete process.env.DATABASE_URL
    process.env.HEARTH_COMPOSE_FILE = 'docker-compose.mine.yml'
    expect(updateCommands()).toBe(
      'git pull\ndocker compose -f docker-compose.mine.yml up -d --build',
    )
  })

  it('an empty HEARTH_COMPOSE_FILE falls back to the inferred file', () => {
    process.env.HEARTH_DEPLOY = 'image'
    delete process.env.DATABASE_URL
    process.env.HEARTH_COMPOSE_FILE = '  '
    expect(updateCommands()).toBe(
      'docker compose -f docker-compose.ghcr.yml pull\ndocker compose -f docker-compose.ghcr.yml up -d',
    )
  })
})
