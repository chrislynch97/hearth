import { describe, it, expect } from 'vitest'
import { RateLimiter } from './rateLimit'

const cfg = { windowMs: 1000, maxAttempts: 3, blockMs: 5000 }

describe('RateLimiter', () => {
  it('allows attempts until the max is reached, then blocks', () => {
    const rl = new RateLimiter(cfg)
    const now = 10_000
    expect(rl.check('ip', now).allowed).toBe(true)
    rl.fail('ip', now)
    rl.fail('ip', now)
    expect(rl.check('ip', now).allowed).toBe(true) // 2 fails, under max
    rl.fail('ip', now) // 3rd fail → blocked
    const blocked = rl.check('ip', now)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterMs).toBe(5000)
  })

  it('lifts the block after blockMs elapses', () => {
    const rl = new RateLimiter(cfg)
    for (let i = 0; i < 3; i++) rl.fail('ip', 10_000)
    expect(rl.check('ip', 10_000).allowed).toBe(false)
    expect(rl.check('ip', 10_000 + 5001).allowed).toBe(true)
  })

  it('resets the counter when the window rolls over', () => {
    const rl = new RateLimiter(cfg)
    rl.fail('ip', 0)
    rl.fail('ip', 0)
    rl.fail('ip', 2000) // window (1000ms) elapsed → counts as a fresh 1
    expect(rl.check('ip', 2000).allowed).toBe(true)
  })

  it('tracks keys independently and reset clears a key', () => {
    const rl = new RateLimiter(cfg)
    for (let i = 0; i < 3; i++) rl.fail('a', 0)
    expect(rl.check('a', 0).allowed).toBe(false)
    expect(rl.check('b', 0).allowed).toBe(true)
    rl.reset('a')
    expect(rl.check('a', 0).allowed).toBe(true)
  })
})
