import { describe, it, expect } from 'vitest'
import { pushConfig, resolvePushConfig } from './config'

const publicKey = Buffer.alloc(65, 4).toString('base64url')
const privateKey = Buffer.alloc(32, 7).toString('base64url')

const env = (over: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  HEARTH_VAPID_PUBLIC_KEY: publicKey,
  HEARTH_VAPID_PRIVATE_KEY: privateKey,
  HEARTH_VAPID_SUBJECT: 'mailto:hearth@example.com',
  ...over,
})

describe('resolvePushConfig', () => {
  it('is off by default', () => {
    expect(resolvePushConfig({})).toBeNull()
    expect(resolvePushConfig({ HEARTH_VAPID_PUBLIC_KEY: '  ' })).toBeNull()
  })

  it('returns the keys when all three are set', () => {
    expect(resolvePushConfig(env())).toEqual({ publicKey, privateKey, subject: 'mailto:hearth@example.com' })
    expect(resolvePushConfig(env({ HEARTH_VAPID_SUBJECT: 'https://hearth.example.com' }))).not.toBeNull()
  })

  it('names what is missing when half-set', () => {
    expect(() => resolvePushConfig(env({ HEARTH_VAPID_PRIVATE_KEY: '' }))).toThrow('HEARTH_VAPID_PRIVATE_KEY')
  })

  it('rejects malformed keys and subjects', () => {
    expect(() => resolvePushConfig(env({ HEARTH_VAPID_PUBLIC_KEY: 'nope' }))).toThrow('public key')
    expect(() => resolvePushConfig(env({ HEARTH_VAPID_PRIVATE_KEY: 'nope' }))).toThrow('private key')
    expect(() => resolvePushConfig(env({ HEARTH_VAPID_SUBJECT: 'hearth@example.com' }))).toThrow('mailto:')
  })
})

describe('pushConfig', () => {
  it('degrades a bad config to off', () => {
    expect(pushConfig(env({ HEARTH_VAPID_SUBJECT: '' }))).toBeNull()
  })
})
