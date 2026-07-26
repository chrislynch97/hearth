import { describe, expect, it } from 'vitest'
import { redactUrl } from './logRedact'

const TOKEN = 'a'.repeat(64)

describe('redactUrl', () => {
  it('redacts a legacy /invite/<token> path', () => {
    expect(redactUrl(`/invite/${TOKEN}`)).toBe('/invite/[redacted]')
  })

  it('keeps the query string of a legacy invite path but drops the token', () => {
    const out = redactUrl(`/invite/${TOKEN}?ref=email`)
    expect(out).toBe('/invite/[redacted]?ref=email')
  })

  it('leaves a token-less /invite alone', () => {
    expect(redactUrl('/invite')).toBe('/invite')
  })

  it('redacts a percent-encoded token in a tRPC query input', () => {
    const input = encodeURIComponent(JSON.stringify({ 0: { json: { token: TOKEN } } }))
    const out = redactUrl(`/trpc/invitations.info?batch=1&input=${input}`)
    expect(out).not.toContain(TOKEN)
    expect(out).toContain('%22token%22%3A%22[redacted]%22')
  })

  it('redacts an unencoded token in a query input', () => {
    const out = redactUrl('/trpc/invitations.info?input={"json":{"token":"deadbeef"}}')
    expect(out).toBe('/trpc/invitations.info?input={"json":{"token":"[redacted]"}}')
  })

  it('leaves the rest of a batched input readable', () => {
    const input = encodeURIComponent(JSON.stringify({ 0: { json: { token: TOKEN, ref: 'email' } } }))
    const out = redactUrl(`/trpc/invitations.info?batch=1&input=${input}`)
    expect(out).toContain('%22ref%22%3A%22email%22')
  })

  it('leaves an ordinary URL untouched', () => {
    const url = '/trpc/pots.list,budget.summary?batch=1&input=%7B%7D'
    expect(redactUrl(url)).toBe(url)
  })
})
