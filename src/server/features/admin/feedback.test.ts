import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { feedbackConfig, feedbackRepo, submitFeedback } from './feedback'

const { HEARTH_FEEDBACK_TOKEN, HEARTH_FEEDBACK_REPO } = process.env

beforeEach(() => {
  delete process.env.HEARTH_FEEDBACK_TOKEN
  delete process.env.HEARTH_FEEDBACK_REPO
})

afterEach(() => {
  vi.restoreAllMocks()
  // Restore the env these read, so tests don't leak into each other.
  if (HEARTH_FEEDBACK_TOKEN === undefined) delete process.env.HEARTH_FEEDBACK_TOKEN
  else process.env.HEARTH_FEEDBACK_TOKEN = HEARTH_FEEDBACK_TOKEN
  if (HEARTH_FEEDBACK_REPO === undefined) delete process.env.HEARTH_FEEDBACK_REPO
  else process.env.HEARTH_FEEDBACK_REPO = HEARTH_FEEDBACK_REPO
})

describe('feedbackConfig', () => {
  it('is disabled with no token', () => {
    expect(feedbackConfig()).toEqual({ enabled: false, repo: 'chrislynch97/hearth' })
  })

  it('is enabled once a token is set, without leaking it', () => {
    process.env.HEARTH_FEEDBACK_TOKEN = 'ghp_secret'
    const cfg = feedbackConfig()
    expect(cfg.enabled).toBe(true)
    expect(JSON.stringify(cfg)).not.toContain('ghp_secret')
  })

  it('repo defaults to upstream and is overridable', () => {
    expect(feedbackRepo()).toBe('chrislynch97/hearth')
    process.env.HEARTH_FEEDBACK_REPO = 'someone/fork'
    expect(feedbackRepo()).toBe('someone/fork')
  })
})

describe('submitFeedback', () => {
  it('refuses when no token is configured', async () => {
    await expect(
      submitFeedback({ kind: 'bug', title: 'x', description: 'y' }),
    ).rejects.toThrow(/not configured/)
  })

  it('POSTs an authenticated issue and returns its url + number', async () => {
    process.env.HEARTH_FEEDBACK_TOKEN = 'ghp_secret'
    process.env.HEARTH_FEEDBACK_REPO = 'someone/fork'
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ html_url: 'https://github.com/someone/fork/issues/7', number: 7 }), {
          status: 201,
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await submitFeedback({
      kind: 'idea',
      title: 'Add dark mode',
      description: 'Would be nice',
      route: '/settings',
      submittedBy: 'Alice',
    })

    expect(result).toEqual({ url: 'https://github.com/someone/fork/issues/7', number: 7 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.github.com/repos/someone/fork/issues')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ghp_secret')
    const body = JSON.parse(init.body as string)
    expect(body.title).toBe('Add dark mode')
    expect(body.labels).toEqual(['enhancement'])
    // Context footer is auto-attached.
    expect(body.body).toContain('Page: /settings')
    expect(body.body).toContain('Reported by: Alice')
  })

  it('throws with the status when GitHub rejects the report', async () => {
    process.env.HEARTH_FEEDBACK_TOKEN = 'ghp_secret'
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 422 })))
    await expect(
      submitFeedback({ kind: 'bug', title: 'x', description: 'y' }),
    ).rejects.toThrow(/422/)
  })
})
