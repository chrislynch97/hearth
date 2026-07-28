import { describe, it, expect } from 'vitest'
import { mailConfig, mailEnabled, resolveMailConfig } from './config'

/** A minimal env with mail switched on, plus whatever the case overrides. */
const env = (over: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  HEARTH_MAIL_TRANSPORT: 'smtp',
  HEARTH_MAIL_FROM: 'Hearth <hearth@example.com>',
  HEARTH_PUBLIC_URL: 'https://hearth.example.com',
  HEARTH_SMTP_HOST: 'smtp.example.com',
  ...over,
})

describe('resolveMailConfig', () => {
  it('is off by default, and for an explicit off', () => {
    expect(resolveMailConfig({})).toBeNull()
    expect(resolveMailConfig({ HEARTH_MAIL_TRANSPORT: 'off' })).toBeNull()
    expect(resolveMailConfig({ HEARTH_MAIL_TRANSPORT: '  ' })).toBeNull()
  })

  it('rejects an unknown transport', () => {
    expect(() => resolveMailConfig({ HEARTH_MAIL_TRANSPORT: 'sendmail' })).toThrow(/unknown HEARTH_MAIL_TRANSPORT/)
  })

  it('reads a full SMTP config, defaulting port and TLS mode', () => {
    expect(resolveMailConfig(env())).toEqual({
      transport: 'smtp',
      from: 'Hearth <hearth@example.com>',
      publicUrl: 'https://hearth.example.com',
      smtp: { host: 'smtp.example.com', port: 587, tls: 'starttls', user: null, pass: null },
    })
  })

  it('defaults the port to 465 for implicit TLS', () => {
    expect(resolveMailConfig(env({ HEARTH_SMTP_TLS: 'implicit' }))?.smtp?.port).toBe(465)
  })

  it('takes an explicit port over the default', () => {
    expect(resolveMailConfig(env({ HEARTH_SMTP_PORT: '2525' }))?.smtp?.port).toBe(2525)
  })

  it('rejects a port that is not a port', () => {
    expect(() => resolveMailConfig(env({ HEARTH_SMTP_PORT: 'smtp' }))).toThrow(/must be a port number/)
    expect(() => resolveMailConfig(env({ HEARTH_SMTP_PORT: '99999' }))).toThrow(/must be a port number/)
  })

  it('rejects an unknown TLS mode', () => {
    expect(() => resolveMailConfig(env({ HEARTH_SMTP_TLS: 'ssl' }))).toThrow(/unknown HEARTH_SMTP_TLS/)
  })

  it('carries credentials through, and rejects a username with no password', () => {
    const withAuth = resolveMailConfig(env({ HEARTH_SMTP_USER: 'apikey', HEARTH_SMTP_PASS: 's3cret' }))
    expect(withAuth?.smtp).toMatchObject({ user: 'apikey', pass: 's3cret' })
    expect(() => resolveMailConfig(env({ HEARTH_SMTP_USER: 'apikey' }))).toThrow(/HEARTH_SMTP_PASS is empty/)
  })

  it('requires the from address, the public URL and (for smtp) a host', () => {
    expect(() => resolveMailConfig(env({ HEARTH_MAIL_FROM: '' }))).toThrow(/HEARTH_MAIL_FROM is empty/)
    expect(() => resolveMailConfig(env({ HEARTH_PUBLIC_URL: '' }))).toThrow(/HEARTH_PUBLIC_URL is empty/)
    expect(() => resolveMailConfig(env({ HEARTH_SMTP_HOST: '' }))).toThrow(/HEARTH_SMTP_HOST is empty/)
  })

  it('rejects a public URL that is not an absolute http(s) origin', () => {
    expect(() => resolveMailConfig(env({ HEARTH_PUBLIC_URL: 'hearth.example.com' }))).toThrow(/not a valid URL/)
    expect(() => resolveMailConfig(env({ HEARTH_PUBLIC_URL: 'ftp://hearth.example.com' }))).toThrow(/must be http/)
  })

  it('strips a trailing slash so links do not double up', () => {
    expect(resolveMailConfig(env({ HEARTH_PUBLIC_URL: 'https://hearth.example.com/' }))?.publicUrl).toBe(
      'https://hearth.example.com',
    )
  })

  it('keeps a sub-path, for an instance served under one', () => {
    expect(resolveMailConfig(env({ HEARTH_PUBLIC_URL: 'https://example.com/hearth/' }))?.publicUrl).toBe(
      'https://example.com/hearth',
    )
  })

  describe('the log transport', () => {
    const logEnv = { HEARTH_MAIL_TRANSPORT: 'log', HEARTH_MAIL_FROM: 'a@b.c', HEARTH_PUBLIC_URL: 'http://localhost:8787' }

    it('needs no SMTP settings', () => {
      expect(resolveMailConfig(logEnv)).toMatchObject({ transport: 'log', smtp: null })
    })

    it('is refused on a declared-public instance — it logs live tokens', () => {
      expect(() => resolveMailConfig({ ...logEnv, HEARTH_PUBLIC: '1' })).toThrow(/writes live invite/)
    })
  })
})

describe('mailConfig / mailEnabled', () => {
  it('read a misconfiguration as "off" rather than throwing', () => {
    const broken = env({ HEARTH_SMTP_HOST: '' })
    expect(() => resolveMailConfig(broken)).toThrow()
    expect(mailConfig(broken)).toBeNull()
    expect(mailEnabled(broken)).toBe(false)
  })

  it('report a working config as on', () => {
    expect(mailEnabled(env())).toBe(true)
    expect(mailEnabled({})).toBe(false)
  })
})
