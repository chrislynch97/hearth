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

  it('prunes stale entries so the map cannot grow without bound', () => {
    const rl = new RateLimiter(cfg)
    // A stream of distinct one-off keys (e.g. rotating spoofed IPs), each seen once.
    for (let i = 0; i < 100; i++) rl.fail(`ip-${i}`, i)
    expect(rl.size).toBe(100)
    // A later attempt, well past the window, triggers a sweep of expired entries.
    rl.fail('fresh', 100 + cfg.windowMs + 1)
    expect(rl.size).toBe(1)
  })

  it('keeps still-blocked entries during a sweep', () => {
    const rl = new RateLimiter(cfg)
    for (let i = 0; i < 3; i++) rl.fail('blocked', 0) // → blocked until blockMs (5000)
    for (let i = 0; i < 3; i++) rl.fail('old', 0)
    // Sweep at t=2000: past the 1000ms window, but 'blocked' is still blocked
    // (blockedUntil=5000 > now), so it must survive; 'old' expired identically but
    // is also still blocked here — advance past the block to prove pruning.
    rl.fail('trigger', 2000)
    expect(rl.check('blocked', 2000).allowed).toBe(false)
    // Past the block window: now the swept entry is truly stale and dropped.
    rl.fail('trigger2', 6000)
    expect(rl.check('blocked', 6000).allowed).toBe(true)
    expect(rl.size).toBeLessThan(4)
  })
})
