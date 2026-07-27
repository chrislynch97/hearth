import { describe, expect, it } from 'vitest'
import { inviteLink, resetPasswordLink, tokenLink, verifyEmailLink } from './links'

const TOKEN = 'a'.repeat(64)

describe('token links', () => {
  it('put the token in the fragment, never the path', () => {
    for (const link of [
      inviteLink('https://hearth.example', TOKEN),
      verifyEmailLink('https://hearth.example', TOKEN),
      resetPasswordLink('https://hearth.example', TOKEN),
    ]) {
      const url = new URL(link)
      expect(url.hash).toBe(`#${TOKEN}`)
      expect(url.pathname).not.toContain(TOKEN)
      expect(url.search).toBe('')
    }
  })

  it('use the route each screen is served at', () => {
    expect(inviteLink('https://h.example', TOKEN)).toBe(`https://h.example/invite#${TOKEN}`)
    expect(verifyEmailLink('https://h.example', TOKEN)).toBe(`https://h.example/verify-email#${TOKEN}`)
    expect(resetPasswordLink('https://h.example', TOKEN)).toBe(`https://h.example/reset-password#${TOKEN}`)
  })

  it('tolerate a trailing slash on the origin rather than doubling it', () => {
    expect(tokenLink('https://h.example/', 'invite', TOKEN)).toBe(`https://h.example/invite#${TOKEN}`)
  })

  it('keep a sub-path origin intact', () => {
    expect(tokenLink('https://h.example/hearth', 'invite', TOKEN)).toBe(`https://h.example/hearth/invite#${TOKEN}`)
  })
})
