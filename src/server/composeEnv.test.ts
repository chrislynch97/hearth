/**
 * Every shipped compose file passes `.env` into the app with `env_file`, so a
 * setting added in a later release reaches an existing install with no compose
 * change (hearth-planning#31). These tests pin that shape, and the stamp the
 * running image checks the compose file against.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMPOSE_VERSION, composeOutdated, composeOutdatedWarning } from './composeEnv'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

// docker-compose.demo.yml is deliberately not here: it serves throwaway fake
// data from its own database and isn't a deploy anyone configures.
const composeFiles = [
  'docker-compose.yml',
  'docker-compose.ghcr.yml',
  'docker-compose.postgres.yml',
  'docker-compose.postgres.ghcr.yml',
  'docker-compose.public.yml',
]

/** The `hearth` service's lines, indented as written. Hand-parsed rather than
 *  via a YAML dependency — what's asserted is the literal text an operator reads. */
function hearthService(file: string): string[] {
  const lines: string[] = []
  let inHearth = false
  for (const line of readFileSync(join(repoRoot, file), 'utf8').split(/\r?\n/)) {
    const service = /^ {2}(\S+):\s*$/.exec(line)
    if (service || /^\S/.test(line)) inHearth = service?.[1] === 'hearth'
    else if (inHearth) lines.push(line)
  }
  return lines
}

/** The `hearth` service's `environment:` entries, as name → value. */
function hearthEnv(file: string): Map<string, string> {
  const env = new Map<string, string>()
  let inEnvironment = false
  for (const line of hearthService(file)) {
    if (/^ {4}\S/.test(line)) inEnvironment = /^ {4}environment:\s*$/.test(line)
    if (!inEnvironment) continue
    const entry = /^ {6}- ([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line)
    if (entry) env.set(entry[1]!, entry[2]!)
  }
  return env
}

/** The `hearth` service's `env_file:` block, comments dropped. */
function hearthEnvFile(file: string): string {
  const lines = hearthService(file)
  const start = lines.findIndex((l) => /^ {4}env_file:\s*$/.test(l))
  if (start === -1) return ''
  const block: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (/^ {4}\S/.test(line)) break
    if (!/^\s*(#|$)/.test(line)) block.push(line.trim())
  }
  return block.join('\n')
}

describe('shipped compose files', () => {
  it.each(composeFiles)('%s parses as a compose file with a hearth service', (file) => {
    expect(hearthEnv(file).get('PORT')).toBe('8787')
  })

  it.each(composeFiles)('%s passes .env through, and still starts without one', (file) => {
    // `required: false` so an install with every setting at its default needs no .env.
    expect(hearthEnvFile(file)).toBe('- path: .env\nrequired: false')
  })

  it.each(composeFiles)('%s stamps the compose version this image expects', (file) => {
    expect(hearthEnv(file).get('HEARTH_COMPOSE_VERSION')).toBe(String(COMPOSE_VERSION))
  })

  it.each(composeFiles)('%s lists no setting env_file already passes through', (file) => {
    // `HEARTH_X=${HEARTH_X:-}` is the old per-setting list. env_file makes it
    // redundant, and keeping some invites adding the next one by hand again.
    const passThrough = [...hearthEnv(file)]
      .filter(([name, value]) => value === `\${${name}:-}` || value === `\${${name}}`)
      .map(([name]) => name)
    expect(passThrough).toEqual([])
  })

  it.each(composeFiles)('%s substitutes each default from its own name', (file) => {
    // Catches a typo'd `${HEARTH_UPDATE_DIRS:-/data/updates}`, which would pin the
    // default and silently ignore the .env value.
    const wrong = [...hearthEnv(file)]
      .filter(([name]) => name.startsWith('HEARTH_'))
      .filter(([name, value]) => value.includes('${') && !value.startsWith(`\${${name}`))
      .map(([name]) => name)
    expect(wrong).toEqual([])
  })
})

describe('docker-compose.public.yml', () => {
  it('pins HEARTH_ALLOW_OPEN off over anything in .env', () => {
    // env_file would otherwise carry a `HEARTH_ALLOW_OPEN=1` left over from a
    // LAN .env onto a public box, handing every anonymous caller owner access.
    // `environment:` wins over `env_file`, so a literal here can't be overridden.
    expect(hearthEnv('docker-compose.public.yml').get('HEARTH_ALLOW_OPEN')).toBe('0')
  })

  it('fixes the settings that make it the public file', () => {
    const env = hearthEnv('docker-compose.public.yml')
    expect(env.get('HEARTH_PUBLIC')).toBe('1')
    expect(env.get('HEARTH_TRUST_PROXY')).toBe('1')
  })
})

describe('composeOutdated', () => {
  const image = (stamp?: string): NodeJS.ProcessEnv =>
    stamp === undefined ? { HEARTH_IMAGE: '1' } : { HEARTH_IMAGE: '1', HEARTH_COMPOSE_VERSION: stamp }

  it('flags a compose file from before the stamp', () => {
    expect(composeOutdated(image())).toBe(true)
  })

  it('flags an older stamp, and an unreadable one', () => {
    expect(composeOutdated(image(String(COMPOSE_VERSION - 1)))).toBe(true)
    expect(composeOutdated(image(''))).toBe(true)
    expect(composeOutdated(image('one'))).toBe(true)
  })

  it('accepts the current stamp, and a newer one', () => {
    // Newer happens when the updater fetched the next release's file ahead of the image.
    expect(composeOutdated(image(String(COMPOSE_VERSION)))).toBe(false)
    expect(composeOutdated(image(String(COMPOSE_VERSION + 1)))).toBe(false)
  })

  it('stays quiet off the Docker image', () => {
    // Bare-Node and dev runs have no compose file to be out of date.
    expect(composeOutdated({})).toBe(false)
  })

  it('names the remedy in the startup warning', () => {
    expect(composeOutdatedWarning(true)).toContain('compose.override.yml')
    expect(composeOutdatedWarning(false)).toBeNull()
  })
})
