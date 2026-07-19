import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { makeTestDb } from '../db/testdb'
import { ensureSeed } from '../db/seed'
import { getOwnerUser } from '../auth/session'
import { appRouter } from '../trpc/router'

const { HEARTH_FEEDBACK_TOKEN, HEARTH_FEEDBACK_REPO } = process.env

async function ownerCaller() {
  const db = await makeTestDb()
  await ensureSeed(db)
  const owner = await getOwnerUser(db)
  const caller = appRouter.createCaller({ db, householdId: 'household', role: 'owner', userId: owner!.id })
  return { db, caller, ownerId: owner!.id }
}

beforeEach(() => {
  delete process.env.HEARTH_FEEDBACK_TOKEN
  delete process.env.HEARTH_FEEDBACK_REPO
})

afterEach(() => {
  vi.restoreAllMocks()
  if (HEARTH_FEEDBACK_TOKEN === undefined) delete process.env.HEARTH_FEEDBACK_TOKEN
  else process.env.HEARTH_FEEDBACK_TOKEN = HEARTH_FEEDBACK_TOKEN
  if (HEARTH_FEEDBACK_REPO === undefined) delete process.env.HEARTH_FEEDBACK_REPO
  else process.env.HEARTH_FEEDBACK_REPO = HEARTH_FEEDBACK_REPO
})

describe('feedback router', () => {
  it('config reflects whether a token is set', async () => {
    const { caller } = await ownerCaller()
    expect((await caller.feedback.config()).enabled).toBe(false)
    process.env.HEARTH_FEEDBACK_TOKEN = 'ghp_secret'
    expect(await caller.feedback.config()).toEqual({ enabled: true, repo: 'chrislynch97/hearth' })
  })

  it('submit is refused when the feature is off', async () => {
    const { caller } = await ownerCaller()
    await expect(
      caller.feedback.submit({ kind: 'bug', title: 'It broke', description: 'A long enough description.' }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })
  })

  it('submit files an issue and returns its details', async () => {
    process.env.HEARTH_FEEDBACK_TOKEN = 'ghp_secret'
    const { caller } = await ownerCaller()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ html_url: 'https://github.com/chrislynch97/hearth/issues/9', number: 9 }), {
            status: 201,
          }),
      ),
    )
    const res = await caller.feedback.submit({
      kind: 'bug',
      title: 'It broke',
      description: 'A long enough description.',
    })
    expect(res).toEqual({ url: 'https://github.com/chrislynch97/hearth/issues/9', number: 9 })
  })

  it('throttles after the per-user limit', async () => {
    process.env.HEARTH_FEEDBACK_TOKEN = 'ghp_secret'
    const { caller } = await ownerCaller()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ html_url: 'u', number: 1 }), { status: 201 })),
    )
    const send = () =>
      caller.feedback.submit({ kind: 'idea', title: 'Idea', description: 'A long enough description.' })
    // The block only bites on the check *after* the max (6) is reached, so the
    // first six go through and the seventh is throttled.
    for (let i = 0; i < 6; i++) await send()
    await expect(send()).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
  })
})
