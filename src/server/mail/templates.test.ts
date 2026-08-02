import { describe, it, expect } from 'vitest'
import { inviteEmail, passwordResetEmail } from './templates'
import { DATA_NOTICE_TEXT, DATA_NOTICE_URL } from '../../shared/data-notice'

const invite = (over: Partial<Parameters<typeof inviteEmail>[0]> = {}) =>
  inviteEmail({
    to: 'sam@example.com',
    origin: 'https://hearth.example.com',
    token: 'tok',
    householdName: 'The Lynches',
    role: 'member',
    invitedBy: 'Chris',
    ttlMs: 7 * 24 * 60 * 60 * 1000,
    ...over,
  })

describe('inviteEmail', () => {
  it('carries the data notice in both parts, with a link to the full page (#229)', () => {
    const mail = invite()
    expect(mail.text).toContain(DATA_NOTICE_TEXT)
    expect(mail.text).toContain(DATA_NOTICE_URL)
    expect(mail.html).toContain(DATA_NOTICE_TEXT)
    expect(mail.html).toContain(`href="${DATA_NOTICE_URL}"`)
  })

  it('escapes a household name with markup in it', () => {
    const mail = invite({ householdName: '<b>oops</b>' })
    expect(mail.html).toContain('&lt;b&gt;oops&lt;/b&gt;')
    expect(mail.html).not.toContain('<b>oops</b>')
  })
})

describe('the other mails', () => {
  it('do not carry the notice — it belongs to the moment someone joins', () => {
    const mail = passwordResetEmail({
      to: 'sam@example.com',
      origin: 'https://hearth.example.com',
      token: 'tok',
      displayName: 'Sam',
      ttlMs: 60 * 60 * 1000,
    })
    expect(mail.text).not.toContain(DATA_NOTICE_TEXT)
    expect(mail.html).not.toContain(DATA_NOTICE_URL)
  })
})
