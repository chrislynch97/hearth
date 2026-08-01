/**
 * Every documented setting must be reachable from `.env` on every shipped
 * compose file (#210).
 *
 * A variable the server reads but no compose file passes in fails *silently*:
 * the app sees `unset` and behaves as if the operator never configured it, so
 * email, alerting and off-site backups looked switched off no matter what was
 * in `.env`. That's the worst shape of bug for a backup feature, and nothing in
 * review catches it — the compose file simply says less than the docs do.
 *
 * So the variables are enumerated from the server source rather than a list
 * maintained by hand: add a new `HEARTH_*` to the server and this fails until
 * every compose file either passes it through or names it in EXEMPT below.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const serverDir = join(repoRoot, 'src', 'server')

/** Deliberate omissions, per compose file, with the reason. Anything here must
 *  really be absent from that file — a stale entry fails the test below. */
const EXEMPT: Record<string, Record<string, string>> = {
  'docker-compose.yml': {
    HEARTH_DEPLOY: 'builds from source; `image` here would lie to the update UI',
    HEARTH_VERSION: 'baked in at build time by scripts/gen-version.mjs',
  },
  'docker-compose.ghcr.yml': {
    HEARTH_VERSION: 'baked into the image at build time',
  },
  'docker-compose.postgres.yml': {
    HEARTH_DEPLOY: 'builds from source; `image` here would lie to the update UI',
    HEARTH_VERSION: 'baked in at build time by scripts/gen-version.mjs',
  },
  'docker-compose.postgres.ghcr.yml': {
    HEARTH_VERSION: 'baked into the image at build time',
  },
  'docker-compose.public.yml': {
    HEARTH_ALLOW_OPEN:
      'omitted on purpose: passing it through would let a value left over from a LAN .env reach a public box',
    HEARTH_VERSION: 'baked into the image at build time',
  },
}

// docker-compose.demo.yml is deliberately not here: it serves throwaway fake
// data from its own database and isn't a deploy anyone configures.
const composeFiles = Object.keys(EXEMPT)

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return tsFiles(path)
    return entry.endsWith('.ts') && !entry.endsWith('.test.ts') ? [path] : []
  })
}

/** Every `HEARTH_*` the server source names. Deliberately a text scan, not a
 *  scan of `process.env.X` property reads: several are read indirectly by name
 *  (`required(env, 'HEARTH_BACKUP_S3_BUCKET', …)`), and one mentioned only in a
 *  comment is still a variable an operator can set. */
function serverVars(): string[] {
  const found = new Set<string>()
  for (const file of tsFiles(serverDir)) {
    for (const match of readFileSync(file, 'utf8').matchAll(/HEARTH_[A-Z0-9_]+/g)) found.add(match[0])
  }
  return [...found].sort()
}

/** The `hearth` service's environment entries, as name → value, exactly as
 *  written. Hand-parsed rather than via a YAML dependency — what's asserted is
 *  the literal text an operator reads and edits. */
function hearthEnv(file: string): Map<string, string> {
  const env = new Map<string, string>()
  let inHearth = false
  let inEnvironment = false
  for (const line of readFileSync(join(repoRoot, file), 'utf8').split(/\r?\n/)) {
    const service = /^ {2}(\S+):\s*$/.exec(line)
    if (service) {
      inHearth = service[1] === 'hearth'
      inEnvironment = false
      continue
    }
    if (!inHearth) continue
    if (/^ {4}\S/.test(line)) inEnvironment = /^ {4}environment:\s*$/.test(line)
    if (!inEnvironment) continue
    const entry = /^ {6}- ([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line)
    if (entry) env.set(entry[1]!, entry[2]!)
  }
  return env
}

describe('compose environment pass-through', () => {
  const vars = serverVars()

  it('finds the variables the server reads', () => {
    // A sanity check on the scan itself: a regression that made it match
    // nothing would otherwise make every assertion below vacuously pass.
    expect(vars).toContain('HEARTH_ALERT_WEBHOOK')
    expect(vars).toContain('HEARTH_MAIL_TRANSPORT')
    expect(vars.length).toBeGreaterThan(30)
  })

  it.each(composeFiles)('%s parses as a compose file with a hearth service', (file) => {
    expect(hearthEnv(file).get('PORT')).toBe('8787')
  })

  it.each(composeFiles)('%s passes through every variable the server reads', (file) => {
    const env = hearthEnv(file)
    const missing = vars.filter((v) => !env.has(v) && !(v in EXEMPT[file]!))
    expect(missing, `add these to ${file}, or exempt them with a reason`).toEqual([])
  })

  it.each(composeFiles)('%s has no stale exemptions', (file) => {
    const env = hearthEnv(file)
    const stale = Object.keys(EXEMPT[file]!).filter((v) => env.has(v) || !vars.includes(v))
    expect(stale, `${file} now passes these through, or the server stopped reading them`).toEqual([])
  })

  it.each(composeFiles)('%s substitutes each variable from its own name', (file) => {
    // Catches a typo'd `${HEARTH_ALTER_WEBHOOK:-}`, which reads as unset forever.
    // Only the HEARTH_* entries: DATABASE_URL interpolates POSTGRES_PASSWORD.
    const wrong = [...hearthEnv(file)]
      .filter(([name]) => name.startsWith('HEARTH_'))
      .filter(([name, value]) => value.includes('${') && !value.startsWith(`\${${name}`))
      .map(([name]) => name)
    expect(wrong).toEqual([])
  })
})

describe('docker-compose.public.yml', () => {
  it('never passes HEARTH_ALLOW_OPEN through', () => {
    // A public box that inherited `HEARTH_ALLOW_OPEN=1` from a LAN .env would
    // hand every anonymous caller owner access.
    expect(hearthEnv('docker-compose.public.yml').has('HEARTH_ALLOW_OPEN')).toBe(false)
    expect(readFileSync(join(repoRoot, 'docker-compose.public.yml'), 'utf8')).not.toContain(
      '${HEARTH_ALLOW_OPEN',
    )
  })

  it('fixes the settings that make it the public file', () => {
    const env = hearthEnv('docker-compose.public.yml')
    expect(env.get('HEARTH_PUBLIC')).toBe('1')
    expect(env.get('HEARTH_TRUST_PROXY')).toBe('1')
  })
})
