import { describe, it, expect } from 'vitest'
import { makeTestDb } from '../db/testdb'
import { RateLimiter } from './rateLimit'

const cfg = { windowMs: 1000, maxAttempts: 3, blockMs: 5000 }

describe('RateLimiter', () => {
  it('allows attempts until the max is reached, then blocks', async () => {
    const db = await makeTestDb()
    const rl = new RateLimiter('t', cfg)
    const now = 10_000
    expect((await rl.check(db, 'ip', now)).allowed).toBe(true)
    await rl.fail(db, 'ip', now)
    await rl.fail(db, 'ip', now)
    expect((await rl.check(db, 'ip', now)).allowed).toBe(true) // 2 fails, under max
    await rl.fail(db, 'ip', now) // 3rd fail → blocked
    const blocked = await rl.check(db, 'ip', now)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterMs).toBe(5000)
  })

  it('lifts the block after blockMs elapses', async () => {
    const db = await makeTestDb()
    const rl = new RateLimiter('t', cfg)
    for (let i = 0; i < 3; i++) await rl.fail(db, 'ip', 10_000)
    expect((await rl.check(db, 'ip', 10_000)).allowed).toBe(false)
    expect((await rl.check(db, 'ip', 10_000 + 5001)).allowed).toBe(true)
  })

  it('resets the counter when the window rolls over', async () => {
    const db = await makeTestDb()
    const rl = new RateLimiter('t', cfg)
    await rl.fail(db, 'ip', 0)
    await rl.fail(db, 'ip', 0)
    await rl.fail(db, 'ip', 2000) // window (1000ms) elapsed → counts as a fresh 1
    expect((await rl.check(db, 'ip', 2000)).allowed).toBe(true)
  })

  it('tracks keys independently and reset clears a key', async () => {
    const db = await makeTestDb()
    const rl = new RateLimiter('t', cfg)
    for (let i = 0; i < 3; i++) await rl.fail(db, 'a', 0)
    expect((await rl.check(db, 'a', 0)).allowed).toBe(false)
    expect((await rl.check(db, 'b', 0)).allowed).toBe(true)
    await rl.reset(db, 'a')
    expect((await rl.check(db, 'a', 0)).allowed).toBe(true)
  })

  it('prunes stale rows so the table cannot grow without bound', async () => {
    const db = await makeTestDb()
    const rl = new RateLimiter('t', cfg)
    // A stream of distinct one-off keys (e.g. rotating spoofed IPs), each seen once.
    for (let i = 0; i < 100; i++) await rl.fail(db, `ip-${i}`, i)
    expect(await rl.size(db)).toBe(100)
    // A later attempt, well past the window, triggers a sweep of expired rows.
    await rl.fail(db, 'fresh', 100 + cfg.windowMs + 1)
    expect(await rl.size(db)).toBe(1)
  })

  it('keeps still-blocked rows during a sweep', async () => {
    const db = await makeTestDb()
    const rl = new RateLimiter('t', cfg)
    for (let i = 0; i < 3; i++) await rl.fail(db, 'blocked', 0) // → blocked until blockMs (5000)
    for (let i = 0; i < 3; i++) await rl.fail(db, 'old', 0)
    // Sweep at t=2000: past the 1000ms window, but 'blocked' is still blocked
    // (blockedUntil=5000 > now), so it must survive; 'old' expired identically but
    // is also still blocked here — advance past the block to prove pruning.
    await rl.fail(db, 'trigger', 2000)
    expect((await rl.check(db, 'blocked', 2000)).allowed).toBe(false)
    // Past the block window: now the swept row is truly stale and dropped.
    await rl.fail(db, 'trigger2', 6000)
    expect((await rl.check(db, 'blocked', 6000)).allowed).toBe(true)
    expect(await rl.size(db)).toBeLessThan(4)
  })

  it('namespaces by limiter name, so two limiters on one key do not collide', async () => {
    const db = await makeTestDb()
    const login = new RateLimiter('login', cfg)
    const register = new RateLimiter('register', cfg)
    for (let i = 0; i < 3; i++) await login.fail(db, 'ip', 0)
    expect((await login.check(db, 'ip', 0)).allowed).toBe(false)
    expect((await register.check(db, 'ip', 0)).allowed).toBe(true)
  })

  it("a sweep never expires another limiter's rows", async () => {
    const db = await makeTestDb()
    const short = new RateLimiter('short', cfg)
    const long = new RateLimiter('long', { ...cfg, windowMs: 60_000 })
    await long.fail(db, 'ip', 0)
    // Past `short`'s window but well inside `long`'s: the sweep must leave it alone.
    await short.fail(db, 'other', 2000)
    expect(await long.size(db)).toBe(1)
  })

  // State lives in the database, so a restarted (or second) instance sees the
  // same counters — the whole point of issue #112.
  it('shares state across limiter instances on the same database', async () => {
    const db = await makeTestDb()
    for (let i = 0; i < 3; i++) await new RateLimiter('t', cfg).fail(db, 'ip', 0)
    expect((await new RateLimiter('t', cfg).check(db, 'ip', 0)).allowed).toBe(false)
  })
})
