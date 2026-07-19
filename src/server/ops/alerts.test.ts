import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { alertWebhookUrl, heartbeatUrl, pingHeartbeat, sendAlert } from './alerts'

const OFF = {} as NodeJS.ProcessEnv

describe('config', () => {
  it('treats unset and blank as off', () => {
    expect(heartbeatUrl(OFF)).toBeNull()
    expect(heartbeatUrl({ HEARTH_BACKUP_HEARTBEAT_URL: '  ' } as NodeJS.ProcessEnv)).toBeNull()
    expect(alertWebhookUrl(OFF)).toBeNull()
  })

  it('trims a configured URL', () => {
    expect(heartbeatUrl({ HEARTH_BACKUP_HEARTBEAT_URL: ' https://hc/x ' } as NodeJS.ProcessEnv)).toBe('https://hc/x')
  })
})

describe('pingHeartbeat / sendAlert', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does nothing when unconfigured', async () => {
    await pingHeartbeat('success', 'x', OFF)
    await sendAlert({ event: 'e', message: 'm' }, OFF)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('pings the base URL on success', async () => {
    await pingHeartbeat('success', 'wrote backup', {
      HEARTH_BACKUP_HEARTBEAT_URL: 'https://hc.example/uuid',
    } as NodeJS.ProcessEnv)
    expect(fetchMock.mock.calls[0]![0]).toBe('https://hc.example/uuid')
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'POST', body: 'wrote backup' })
  })

  it('appends /fail on failure, tolerating a trailing slash', async () => {
    await pingHeartbeat('fail', 'boom', {
      HEARTH_BACKUP_HEARTBEAT_URL: 'https://hc.example/uuid/',
    } as NodeJS.ProcessEnv)
    expect(fetchMock.mock.calls[0]![0]).toBe('https://hc.example/uuid/fail')
  })

  it('swallows a heartbeat failure — alerting must not break the caller', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    await expect(
      pingHeartbeat('success', 'x', { HEARTH_BACKUP_HEARTBEAT_URL: 'https://hc.example/uuid' } as NodeJS.ProcessEnv),
    ).resolves.toBeUndefined()
  })

  it('POSTs a JSON alert to the webhook', async () => {
    await sendAlert({ event: 'backup_failed', message: 'nope', detail: { error: 'disk full' } }, {
      HEARTH_ALERT_WEBHOOK: 'https://hooks.example/x',
    } as NodeJS.ProcessEnv)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://hooks.example/x')
    expect(JSON.parse(init.body)).toMatchObject({
      event: 'backup_failed',
      message: 'nope',
      detail: { error: 'disk full' },
    })
  })

  it('swallows a non-2xx webhook response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' })
    await expect(
      sendAlert({ event: 'e', message: 'm' }, { HEARTH_ALERT_WEBHOOK: 'https://hooks.example/x' } as NodeJS.ProcessEnv),
    ).resolves.toBeUndefined()
  })
})
